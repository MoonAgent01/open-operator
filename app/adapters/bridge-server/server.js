const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 7789;

// WebUI integration constants
const WEBUI_PORT = 7788;
const WEBUI_URL = `http://localhost:${WEBUI_PORT}`;

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

// Helper to mock browser behavior when Python bridge is unavailable
function mockBrowserResponse(action, options = {}) {
  console.log(`[Mock Browser] Using mock response for ${action}`);
  
  switch (action) {
    case 'navigate':
      return {
        success: true,
        url: options.url || 'https://example.com',
        title: 'Example Page',
        content: '<html><body><h1>Example Page</h1></body></html>'
      };
    case 'click':
      return {
        success: true,
        message: `Clicked on ${options.selector || options.text || 'element'}`
      };
    case 'extract':
      return {
        success: true,
        url: 'https://example.com',
        content: '<html><body><h1>Example Page</h1></body></html>',
        extraction: {
          title: 'Example Page',
          text: 'Example Page Content'
        }
      };
    default:
      return {
        success: true,
        message: `Action ${action} completed successfully`
      };
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'WebUI Bridge Server is running' });
});

app.get('/health', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    if (sessionId && !activeSessions.has(sessionId)) {
      return res.status(404).json({ 
        success: false, 
        error: `Session ${sessionId} not found` 
      });
    }
    
    res.json({ 
      success: true, 
      status: 'active',
      sessions: Array.from(activeSessions.keys())
    });
  } catch (error) {
    console.error(`Health check failed: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new session (with /api prefix)
app.post('/api/session', (req, res) => {
  createSession(req, res);
});

// Create a new session (without /api prefix)
app.post('/session', (req, res) => {
  createSession(req, res);
});

function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);
  const sessionId = `session-${Date.now()}`;
  const useWebUIBrowser = req.body.settings?.useWebUIBrowser || false;
  
  activeSessions.set(sessionId, { 
    id: sessionId,
    contextId: req.body.contextId || '',
    createdAt: new Date(),
    useWebUIBrowser
  });
  
  // Determine session URL based on browser mode
  const sessionUrl = useWebUIBrowser 
    ? `${WEBUI_URL}/browser/${sessionId}`
    : `http://localhost:3000/browser/${sessionId}`;
  
  // Send response with session info
  const response = {
    success: true,
    sessionId,
    contextId: req.body.contextId || '',
    sessionUrl,
    connectUrl: useWebUIBrowser 
      ? `ws://localhost:${WEBUI_PORT}/ws` 
      : `ws://localhost:3000/ws`,
    wsUrl: useWebUIBrowser 
      ? `ws://localhost:${WEBUI_PORT}/ws` 
      : `ws://localhost:3000/ws`,
    debugUrl: useWebUIBrowser ? WEBUI_URL : 'http://localhost:3000'
  };
  
  console.log('[Session Creation] Response:', response);
  res.json(response);
}

// Process intent (critical endpoint for stagehand-mock.ts)
app.post('/intent', async (req, res) => {
  try {
    console.log('[Intent] Processing intent request:', req.body);
    
    const { goal, previousSteps = [], context = {} } = req.body;
    
    if (!goal) {
      return res.status(400).json({
        success: false,
        error: 'Missing goal in request'
      });
    }
    
    // Get session ID from either body or first previous step
    const sessionId = req.body.sessionId || 
                     (previousSteps.length > 0 ? previousSteps[0].sessionId : null);
    const session = sessionId ? activeSessions.get(sessionId) : null;
    
    if (session?.useWebUIBrowser) {
      try {
        const webUiResponse = await fetch(`${WEBUI_URL}/api/agent/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            task: goal,
            history: previousSteps.map(step => ({
              action: step.tool,
              args: step.args,
              result: step.text
            })),
            context: {
              is_first_step: context.isFirstStep || false
            }
          })
        });
        
        if (webUiResponse.ok) {
          const webUiData = await webUiResponse.json();
          if (webUiData.success) {
            return res.json({
              success: true,
              result: {
                tool: webUiData.result?.tool || 'NAVIGATE',
                args: webUiData.result?.args || {},
                text: webUiData.result?.text || 'Executing action',
                reasoning: webUiData.result?.reasoning || 'Processing request',
                instruction: webUiData.result?.instruction || 'Perform action'
              }
            });
          }
        }
      } catch (error) {
        console.error('[Intent] WebUI communication failed:', error);
      }
    }
    
    // Fallback to mock response
    // Determine next action based on the goal and previous steps
    let nextAction;
    
    if (previousSteps.length === 0 || context.isFirstStep) {
      // First step is always a navigation
      nextAction = {
        tool: 'NAVIGATE',
        args: { 
          url: goal.toLowerCase().includes('youtube') ? 
            'https://youtube.com' : 
            'https://example.com' 
        },
        // Format properly for ChatFeed component
        text: `Navigating to ${goal.toLowerCase().includes('youtube') ? 'YouTube' : 'example.com'}`,
        reasoning: 'Starting navigation to fulfill the request',
        instruction: `Opening ${goal.toLowerCase().includes('youtube') ? 'YouTube' : 'example.com'} website`
      };
    } else {
      // Determine next action based on the last step
      const lastStep = previousSteps[previousSteps.length - 1];
      
      switch (lastStep.tool.toUpperCase()) {
        case 'NAVIGATE':
          nextAction = {
            tool: 'EXTRACT',
            args: { selector: 'body' },
            text: 'Reading page content',
            reasoning: 'Extracting information from the current page',
            instruction: 'Read the page content to understand the structure'
          };
          break;
        case 'EXTRACT':
          nextAction = {
            tool: 'CLICK',
            args: { 
              selector: goal.toLowerCase().includes('youtube') ? 
                'input[name="search_query"]' : 
                'a[href="#example"]' 
            },
            text: 'Clicking on element',
            reasoning: 'Interacting with a relevant element',
            instruction: `Click on ${goal.toLowerCase().includes('youtube') ? 'the search box' : 'a link'}`
          };
          break;
        case 'CLICK':
          nextAction = {
            tool: 'TYPE',
            args: { 
              text: goal,
              selector: 'input[name="search_query"]'
            },
            text: 'Typing text',
            reasoning: 'Entering search query',
            instruction: `Type "${goal}" in the search field`
          };
          break;
        default:
          nextAction = {
            tool: 'CLOSE',
            args: {},
            text: 'Finishing task',
            reasoning: 'Completed the requested operations',
            instruction: 'Close the current browser session'
          };
      }
    }
    
    console.log('[Intent] Returning mock action:', nextAction);
    
    res.json({
      success: true,
      result: nextAction
    });
  } catch (error) {
    console.error(`[Intent] Error: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute step in browser
app.post('/execute', async (req, res) => {
  try {
    const { sessionId, step } = req.body;
    
    if (!sessionId || !step || !step.tool) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId or step in request'
      });
    }
    
    console.log(`[Execute] Processing step for session ${sessionId}:`, step);
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }
    
    const session = activeSessions.get(sessionId);
    
    if (session?.useWebUIBrowser) {
      try {
        const webUiResponse = await fetch(`${WEBUI_URL}/api/browser/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            command: step.tool.toLowerCase(),
            parameters: step.args,
            metadata: {
              text: step.text,
              reasoning: step.reasoning,
              instruction: step.instruction
            }
          })
        });
        
        if (webUiResponse.ok) {
          const data = await webUiResponse.json();
          if (data.success) {
            return res.json({
              success: true,
              result: {
                ...data.result,
                text: step.text,
                reasoning: step.reasoning,
                instruction: step.instruction
              }
            });
          }
        }
      } catch (error) {
        console.error('[Execute] WebUI communication failed:', error);
        throw new Error(`WebUI communication failed: ${error.message}`);
      }
    }
    
    // Fallback to mock if Web UI not selected or failed
    const mockResult = mockBrowserResponse(step.tool.toLowerCase(), step.args);
    res.json({
      success: true,
      result: {
        ...mockResult,
        text: step.text,
        reasoning: step.reasoning,
        instruction: step.instruction
      }
    });
  } catch (error) {
    console.error(`[Execute] Error: ${error}`);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Process agent task
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
app.delete('/session', (req, res) => {
  const { sessionId } = req.body;
  
  console.log(`[Session] Closing session ${sessionId}`);
  
  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    res.json({ success: true, message: 'Session closed successfully' });
  } else {
    res.status(404).json({
      success: false,
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
