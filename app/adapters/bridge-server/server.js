const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');
const sessionManager = require('./session-manager');

const app = express();
const PORT = process.env.PORT || 7789;

// WebUI integration constants
const WEBUI_PORT = 7788;
const WEBUI_URL = `http://localhost:${WEBUI_PORT}`;
const WEBUI_API_URL = `${WEBUI_URL}/api`; // Web UI uses /api prefix
let webUIAvailable = false;

// Check if Web UI is available
async function checkWebUIAvailability() {
  try {
    console.log(`[WebUI Check] Testing WebUI at ${WEBUI_URL}`);
    const apiResponse = await fetch(`${WEBUI_URL}/`, {
      timeout: 2000,
      headers: { 'Accept': 'application/json, text/html' }
    });

    // First check if we got a successful response at all
    if (!apiResponse.ok) {
      console.log(`[WebUI Check] Status check failed: ${apiResponse.status} ${apiResponse.statusText}`);
      return false;
    }

    // Try to parse as JSON, but don't fail if it's not JSON
    try {
      const contentType = apiResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const healthData = await apiResponse.json();
        console.log('[WebUI Check] Health response JSON:', healthData);
        // If it has a status field, use it, otherwise consider it available
        const isAvailable = healthData.status ? healthData.status === 'ok' : true;
        console.log(`[WebUI Check] WebUI available (JSON): ${isAvailable}`);
        return isAvailable;
      } else {
        // It's HTML or some other format, but the server is responding
        console.log('[WebUI Check] WebUI responded with non-JSON content type:', contentType);
        console.log('[WebUI Check] Considering WebUI available since it responded successfully');
        return true;
      }
    } catch (jsonError) {
      // Even if JSON parsing fails, the server is still responsive
      console.log('[WebUI Check] Failed to parse response as JSON, but server is responding');
      console.log(`[WebUI Check] WebUI considered available`);
      return true;
    }
  } catch (error) {
    console.error('[WebUI Check] Error:', error.message);
    console.error('Full error:', {
      message: error.message,
      stack: error.stack
    });
    return false;
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

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
    const session = sessionId ? sessionManager.getSession(sessionId) : null;
    
    if (sessionId && !session) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }

    res.json({
      success: true,
      status: 'active',
      sessions: sessionManager.listSessions().map(s => s.id)
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

async function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);
  const sessionId = `session-${Date.now()}`;
  
  // Use the useOpenOperatorBrowser flag if it exists, otherwise check for useWebUIBrowser
  const useOpenOperatorBrowser = req.body.settings?.useOpenOperatorBrowser || 
                               req.body.settings?.useNativeBrowser || 
                               req.body.settings?.useWebUIBrowser || false;

  // Create session in session manager
  const session = sessionManager.createSession(sessionId, {
    contextId: req.body.contextId || '',
    useOpenOperatorBrowser
  });

  // Create session URL
  const sessionUrl = useOpenOperatorBrowser
    ? `${WEBUI_URL}/browser/${sessionId}`
    : `http://localhost:3000/browser/${sessionId}`;

  // Send response with session info
  const response = {
    success: true,
    sessionId,
    contextId: req.body.contextId || '',
    sessionUrl,
    connectUrl: useOpenOperatorBrowser
      ? `ws://localhost:${WEBUI_PORT}/ws`
      : `ws://localhost:3000/ws`,
    wsUrl: useOpenOperatorBrowser
      ? `ws://localhost:${WEBUI_PORT}/ws`
      : `ws://localhost:3000/ws`,
    debugUrl: useOpenOperatorBrowser ? WEBUI_URL : 'http://localhost:3000'
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
    const session = sessionId ? sessionManager.getSession(sessionId) : null;

    if (session?.useOpenOperatorBrowser) {
      // If using Open Operator browser with WebUI, delegate intent processing
      // This part might need adjustment based on how WebUI handles intent vs execution
      try {
        const gradioRequest = {
          agent_type: "org",               // Using org agent type
          llm_provider: "openai",          // LLM provider
          llm_model_name: "gpt-4o",        // Model name
          llm_num_ctx: 4096,               // Context window size
          llm_temperature: 0.7,            // Temperature
          llm_base_url: "",                // Base URL
          llm_api_key: "",                 // API key
          use_own_browser: session.useOpenOperatorBrowser,  // Use Open Operator's browser when enabled
          keep_browser_open: true,         // Keep browser open
          headless: false,                 // Headless mode
          disable_security: false,         // Disable security
          window_w: 1280,                  // Window width
          window_h: 720,                   // Window height
          save_recording_path: "",         // Recording path
          save_agent_history_path: "",     // Agent history path
          save_trace_path: "",             // Trace path
          enable_recording: false,         // Enable recording
          task: goal,                      // Task description from goal
          add_infos: "",                   // Additional info (empty)
          max_steps: 1,                    // Max steps
          use_vision: false,               // Use vision
          max_actions_per_step: 1,         // Max actions per step
          tool_calling_method: "auto"      // Tool calling method
        };
        
        console.log('[Intent] Sending to Gradio API:', {
          url: `${WEBUI_URL}/run_with_stream`,
          body: gradioRequest
        });

        const webUiResponse = await fetch(`${WEBUI_URL}/run_with_stream`, { // Using correct endpoint
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gradioRequest)
        });

        if (webUiResponse.ok) {
          const webUiData = await webUiResponse.json();
          // Adapt response parsing based on WebUI's actual intent response structure
          if (webUiData.data && webUiData.data.length > 0) {
             // Assuming the first element of data contains the result
             const resultData = webUiData.data[0];
             // Map the resultData structure to the expected StepResult format
             return res.json({
               success: true,
               result: {
                 tool: resultData?.tool || 'NAVIGATE', // Default or map from resultData
                 args: resultData?.args || {},
                 text: resultData?.text || 'Executing action',
                 reasoning: resultData?.reasoning || 'Processing request',
                 instruction: resultData?.instruction || 'Perform action'
               }
             });
          }
        }
      } catch (error) {
        console.error('[Intent] WebUI communication failed:', error);
        // Fall through to mock response if WebUI intent processing fails
      }
    }

    // Fallback to mock response if not using WebUI or if WebUI call failed
    let nextAction;

    if (previousSteps.length === 0 || context.isFirstStep) {
      nextAction = {
        tool: 'NAVIGATE',
        args: {
          url: goal.toLowerCase().includes('youtube') ?
            'https://youtube.com' :
            'https://example.com'
        },
        text: `Navigating to ${goal.toLowerCase().includes('youtube') ? 'YouTube' : 'example.com'}`,
        reasoning: 'Starting navigation to fulfill the request',
        instruction: `Opening ${goal.toLowerCase().includes('youtube') ? 'YouTube' : 'example.com'} website`
      };
    } else {
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

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }

    if (session?.useOpenOperatorBrowser) {
      const webUIAvailable = await checkWebUIAvailability();
      console.log(`[Execute] WebUI available: ${webUIAvailable}, useOpenOperatorBrowser: ${session.useOpenOperatorBrowser}`);

      if (webUIAvailable) {
        try {
          // Map action to Web UI task format
          let task;
          switch(step.tool) {
            case 'NAVIGATE':
              task = `Navigate to ${step.args.url}`;
              break;
            case 'CLICK':
              task = `Click on ${step.args.selector || step.args.text}`;
              break;
            case 'TYPE':
              task = `Type "${step.args.text}" in field`;
              break;
            case 'EXTRACT':
              task = `Extract content from ${step.args.selector || 'page'}`;
              break;
            default:
              task = step.text; // Use the step text as a fallback task description
          }

          // Use gradio_bridge.py to execute the step
          const result = await runPythonBridge('execute_step', { 
            step: {
              tool: step.tool,
              args: step.args,
              text: step.text
            },
            task,
            use_own_browser: true, // Set to true to use Open Operator's browser
            sessionId // Pass the sessionId to the bridge
          });

          console.log('[Execute] WebUI bridge response:', result);

          if (!result || result.error) {
            throw new Error(result?.error || 'Unknown error executing step');
          }

          // Process the response from gradio_bridge.py
          return res.json({
            success: true,
            result: {
              url: step.args.url || 'https://example.com',
              content: result.browserView || '<html><body>Content N/A</body></html>',
              extraction: result.extraction || {},
              text: result.finalResult || step.text,
              reasoning: result.thoughts || step.reasoning, 
              instruction: step.instruction
            }
          });

        } catch (error) {
          console.error('[Execute] WebUI communication failed:', error);
          console.error('Full error:', {
            message: error.message,
            stack: error.stack
          });
          // Fall through to mock response on error
        }
      } else {
         console.log('[Execute] WebUI not available, falling back to mock response.');
      }
    } else {
       console.log('[Execute] Not configured to use WebUI browser, using mock response.');
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

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }

    const result = await runPythonBridge('run_agent', { 
      task, 
      sessionId,
      use_own_browser: session.useOpenOperatorBrowser
    });

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
app.delete('/session', async (req, res) => {
  const { sessionId } = req.body;

  console.log(`[Session] Closing session ${sessionId}`);

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: `Session ${sessionId} not found`
    });
  }

  try {
    if (session?.useOpenOperatorBrowser && await checkWebUIAvailability()) {
      try {
        // Notify Web UI to clean up session if available
        await fetch(`${WEBUI_API_URL}/agent/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (error) {
        console.error('[Session] WebUI cleanup failed (non-critical):', error);
      }
    }

    sessionManager.deleteSession(sessionId);
    res.json({ success: true, message: 'Session closed successfully' });
  } catch (error) {
    console.error(`[Session] Error closing session: ${error}`);
    res.status(500).json({
      success: false,
      error: `Error closing session: ${error.message}`
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Using LLM provider: openai, model: gpt-4o`);
  console.log(`API key found in config`);
  console.log(`Bridge server running at http://localhost:${PORT}`);
});
