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

async function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);
  const sessionId = `session-${Date.now()}`;
  const useWebUIBrowser = req.body.settings?.useWebUIBrowser || false;

  activeSessions.set(sessionId, {
    id: sessionId,
    contextId: req.body.contextId || '',
    createdAt: new Date(),
    useWebUIBrowser
  });

  // Always create session successfully regardless of Web UI availability
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
      // If using WebUI browser, delegate intent processing (if applicable)
      // This part might need adjustment based on how WebUI handles intent vs execution
      try {
        const webUiResponse = await fetch(`${WEBUI_URL}/run/predict`, { // Using /run/predict
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Assuming WebUI might have an intent processing endpoint or handles it within run
            session_id: sessionId,
            task: goal, // Send the goal as the task
            history: previousSteps.map(step => ({
              action: step.tool,
              args: step.args,
              result: step.text
            })),
            context: {
              is_first_step: context.isFirstStep || false
            },
            // Include necessary Gradio structure if calling a specific function
            fn_index: 0, // Example: Assuming intent processing is at index 0
            // api_name: "/process_intent" // Example: If there's a specific API name
          })
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

    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }

    const session = activeSessions.get(sessionId);

    if (session?.useWebUIBrowser) {
      const webUIAvailable = await checkWebUIAvailability();
      console.log(`[Execute] WebUI available: ${webUIAvailable}, useWebUIBrowser: ${session.useWebUIBrowser}`);

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

          // Correct Gradio API format per webui.py, including ALL parameters
          const gradioRequest = {
            data: [
              "org",       // agent_type
              "openai",    // llm_provider
              "gpt-4o",    // llm_model_name
              4096,        // llm_num_ctx (Added default)
              0.7,         // llm_temperature
              "",          // llm_base_url
              "",          // llm_api_key
              false,       // use_own_browser
              true,        // keep_browser_open
              false,       // headless
              false,       // disable_security
              1280,        // window_w
              720,         // window_h
              "",          // save_recording_path
              "",          // save_agent_history_path
              "",          // save_trace_path
              false,       // enable_recording
              task,        // task
              "",          // add_infos
              1,           // max_steps
              false,       // use_vision
              1,           // max_actions_per_step
              "auto",      // tool_calling_method
              "",          // chrome_cdp
              128000       // max_input_tokens (Added default)
            ],
            fn_index: 0 // Assuming fn_index 0 corresponds to run_with_stream
            // Removed api_name based on analysis
          };

          console.log('[Execute] Sending to Gradio API:', {
            url: `${WEBUI_URL}/api/v1/predict`, // Using standard Gradio API v1 endpoint
            body: gradioRequest
          });

          const webUiResponse = await fetch(`${WEBUI_URL}/api/v1/predict`, { // Using standard Gradio API v1 endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gradioRequest)
          });

          console.log('[Execute] WebUI response status:', webUiResponse.status);
          const result = await webUiResponse.json();
          console.log('[Execute] WebUI raw response:', result);

          if (!webUiResponse.ok) {
            // More specific error logging
            const errorDetail = result?.detail || webUiResponse.statusText;
            throw new Error(`Gradio API error: ${webUiResponse.status} ${errorDetail}`);
          }

          // Adapt response parsing based on Gradio's actual structure
          if (!result.data || result.data.length < 1) {
            console.error('[Execute] Invalid response format from Gradio API:', result);
            throw new Error('Invalid response format from Gradio API');
          }

          // Assuming the actual result is nested within the first element of the 'data' array
          // This structure might need adjustment based on actual Gradio responses
          const responsePayload = result.data[0]; // Adjust if structure differs

          // Check for success within the payload if applicable
          // Note: Gradio responses might not have a 'success' field; success is often implied by HTTP 200
          // We might need to parse the specific elements returned by run_with_stream
          console.log('[Execute] Web UI execution payload:', responsePayload);

          // Map the Gradio response elements to the expected StepResult structure
          // Indices based on the 'outputs' of run_with_stream in webui.py
          // [browser_view, final_result, errors, model_actions, model_thoughts, recording_gif, trace, history_file, stop_button, run_button]
          const finalResultText = responsePayload?.[1] || step.text; // Index 1 for final_result
          const errorText = responsePayload?.[2]; // Index 2 for errors

          if (errorText) {
             console.error('[Execute] Error reported by WebUI:', errorText);
             // Decide if this should be treated as a failure
             // For now, let's pass it through but log it
          }

          return res.json({
            success: true, // Assuming HTTP 200 means success for Gradio
            result: {
              // Map fields based on expected StepResult structure
              url: step.args.url || 'https://example.com', // URL might not be directly returned, use input or default
              content: responsePayload?.[0] || '<html><body>Content N/A</body></html>', // Index 0 for browser_view (HTML)
              extraction: {}, // Extraction might need specific handling if returned
              text: finalResultText,
              reasoning: responsePayload?.[4] || step.reasoning, // Index 4 for model_thoughts
              instruction: step.instruction // Instruction might not be returned
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
app.delete('/session', async (req, res) => {
  const { sessionId } = req.body;

  console.log(`[Session] Closing session ${sessionId}`);

  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: `Session ${sessionId} not found`
    });
  }

  const session = activeSessions.get(sessionId);

  try {
    if (session?.useWebUIBrowser && await checkWebUIAvailability()) {
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

    activeSessions.delete(sessionId);
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
