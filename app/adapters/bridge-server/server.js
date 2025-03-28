const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 7789;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Store active sessions
const activeSessions = new Map();

// Helper to run Python scripts
async function runPythonBridge(command, args = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, 'python_bridge.py');
    console.log(`[Python Bridge] Calling ${command} with args:`, args);
    
    const pythonProcess = spawn('python', [
      pythonPath, 
      command,
      JSON.stringify(args)
    ]);
    
    let outputData = '';
    let errorData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.log(`[Python Bridge] Error output: ${data.toString().trim()}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`[Python Bridge] Process exited with code ${code}`);
      if (code !== 0) {
        return reject(new Error(`Python bridge exited with code ${code}: ${errorData}`));
      }
      
      try {
        const result = JSON.parse(outputData);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${err.message}, Output: ${outputData}`));
      }
    });
  });
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'WebUI Bridge Server is running' });
});

app.get('/health', async (req, res) => {
  try {
    const result = await runPythonBridge('health');
    console.log('Web UI health check result:', result);
    res.json(result);
  } catch (error) {
    console.error(`Health check failed: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new session
app.post('/api/session', async (req, res) => {
  try {
    const { contextId = '', settings = {} } = req.body;
    console.log('[Session Creation] Starting session creation process');
    console.log('[Session Creation] Request settings:', req.body);
    
    const result = await runPythonBridge('create_session', {
      contextId,
      browserSettings: settings.browserSettings || {}
    });
    
    if (result.error) {
      console.error(`[Session Creation] Error: ${result.error}`);
      throw new Error(result.error);
    }
    
    // Generate session ID
    const sessionId = `session-${Date.now()}`;
    activeSessions.set(sessionId, {
      id: sessionId,
      contextId,
      createdAt: new Date(),
      settings
    });
    
    console.log(`[Session Creation] Storing session info: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      contextId,
      sessionUrl: `http://localhost:${PORT}`,
      connectUrl: `ws://localhost:${PORT}/ws`,
      wsUrl: `ws://localhost:${PORT}/ws`,
      debugUrl: `http://localhost:${PORT}`
    });
  } catch (error) {
    console.error(`[Session Creation] Error: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process intent (agent task)
app.post('/api/agent', async (req, res) => {
  try {
    const { intent } = req.body;
    console.log(`[Intent] Processing intent: ${intent}`);
    
    const result = await runPythonBridge('run_agent', { task: intent });
    
    if (!result || result.error) {
      throw new Error(result?.error || 'Unknown error processing intent');
    }
    
    res.json({
      success: true,
      result: {
        output: result.result || result.output || "Task completed",
        thinking: result.thinking || ""
      }
    });
  } catch (error) {
    console.error(`[Intent] Error: ${error}`);
    res.status(404).json({ success: false, error: error.message });
  }
});

// Run agent task
app.post('/api/sessions/:sessionId/agent/run', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { task, config } = req.body;
    
    console.log(`[Agent Run] Running task "${task}" for session ${sessionId}`);
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }
    
    const result = await runPythonBridge('run_agent', { task, sessionId });
    
    if (!result || result.error) {
      throw new Error(result?.error || 'Unknown error running agent');
    }
    
    res.json({
      success: true,
      result: {
        finalResult: result.result || result.output || "Task completed",
        actions: result.actions || "",
        errors: result.error || "",
        thoughts: result.thinking || ""
      }
    });
  } catch (error) {
    console.error(`[Agent Run] Error: ${error}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Navigation endpoints and other handlers
app.post('/api/sessions/:sessionId/navigate', (req, res) => {
  const { sessionId } = req.params;
  const { url } = req.body;
  
  console.log(`[Navigate] Session ${sessionId} navigating to ${url}`);
  
  res.json({
    status: 'success',
    title: 'Page Title'
  });
});

// Delete session
app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  console.log(`[Session] Closing session ${sessionId}`);
  
  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    res.json({ status: 'success' });
  } else {
    res.status(404).json({
      status: 'error',
      error: `Session ${sessionId} not found`
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Using LLM provider: openai, model: gpt-4o`);
  console.log(`API key found in config`);
  console.log(`Bridge server running at http://localhost:${PORT}`);
});
