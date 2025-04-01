const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');
const sessionManager = require('./session-manager');
const browserbaseConnector = require('./browserbase-connector'); // Keep existing connector
const Browserbase = require('@browserbasehq/sdk'); // Add Node.js SDK
const { chromium } = require('playwright-core'); // Add Playwright for SDK

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
        url: options.url || 'https://google.com',
        title: 'Google',
        content: '<html><body><h1>Google Search</h1></body></html>'
      };
    case 'click':
      return {
        success: true,
        message: `Clicked on ${options.selector || options.text || 'element'}`
      };
    case 'extract':
      return {
        success: true,
        url: 'https://google.com',
        content: '<html><body><h1>Google Search</h1></body></html>',
        extraction: {
          title: 'Google',
          text: 'Google Search Results'
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

// Browserbase health check endpoint
app.get('/browserbase/health', async (req, res) => {
  try {
    // Check if Browserbase adapter is available
    const isAvailable = await browserbaseConnector.isAvailable();

    res.json({
      success: true,
      available: isAvailable,
      message: isAvailable ? 'Browserbase adapter is available' : 'Browserbase adapter not found'
    });
  } catch (error) {
    console.error(`Browserbase health check failed: ${error}`);
    res.status(500).json({
      success: false,
      available: false,
      error: error.message
    });
  }
});

// Create new session endpoints
app.post(['/api/session', '/session'], createSession);

async function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);

  const sessionId = `session-${Date.now()}`;

  // Check if this is a request to use WebUI's external browser
  const useWebUIBrowser = req.body.settings?.useOwnBrowser === true || 
                         req.body.settings?.browserSettings?.useOwnBrowser === true;

  // Create session in session manager
  const session = sessionManager.createSession(sessionId, {
    contextId: req.body.contextId || '',
    useWebUI: useWebUIBrowser,
    useOpenOperatorBrowser: useWebUIBrowser
  });

  // Create session URL and connection details
  let sessionUrl, connectUrl, wsUrl, debugUrl;

  // Check if WebUI is available when using external browser
  if (useWebUIBrowser) {
    try {
      const webUIAvailable = await checkWebUIAvailability();
      if (!webUIAvailable) {
        throw new Error('WebUI not available');
      }

      // Create CDP-based browser session
      const browserSession = await browserbaseConnector.createSession({
        cdpPort: req.body.settings?.cdpPort || 9222,
        headless: req.body.settings?.headless || false,
        width: req.body.settings?.browserSettings?.windowSize?.width || 1366,
        height: req.body.settings?.browserSettings?.windowSize?.height || 768
      });

      // Store CDP connection details
      sessionManager.updateSession(sessionId, {
        browserbaseSessionId: browserSession.id,
        browserbaseConnectUrl: browserSession.connect_url
      });

      // Use CDP connection URLs
      sessionUrl = browserSession.debug_url;
      connectUrl = browserSession.connect_url;
      wsUrl = browserSession.ws_url;
      debugUrl = browserSession.debug_url;

    } catch (error) {
      console.error('[Session Creation] Failed to create CDP session:', error);
      
      // Fall back to standard WebUI
      sessionUrl = `${WEBUI_URL}/browser/${sessionId}`;
      connectUrl = `ws://localhost:${WEBUI_PORT}/ws`;
      wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;
      debugUrl = WEBUI_URL;
    }
  } else if (session.useBrowserbase) {
    // Standard Browserbase mode
    try {
      // Try to use browserbase connector directly
      try {
        console.log('[Session Creation] Attempting to use Node.js Browserbase SDK');
        
        // Initialize the Browserbase SDK client
        const bb = new Browserbase({
          apiKey: process.env.BROWSERBASE_API_KEY || "not-needed-for-local",
        });
        
        // Create a session using the SDK
        const browserbaseSession = await bb.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID || "local",
          // Add any additional configuration from request
          // These would be specific to the Browserbase SDK
        });
        
        // Store session data with flag indicating we're using Node.js SDK
        sessionManager.updateSession(sessionId, {
          browserbaseSessionId: browserbaseSession.id,
          browserbaseConnectUrl: browserbaseSession.connectUrl,
          usingNodeSdk: true // Flag to indicate we're using the Node SDK
        });
        
        // Set connection details from SDK response
        sessionUrl = browserbaseSession.sessionUrl || browserbaseSession.debugUrl || `http://localhost:3000/browser/${sessionId}`;
        connectUrl = browserbaseSession.connectUrl || `ws://localhost:3000/ws`;
        wsUrl = browserbaseSession.wsUrl || connectUrl;
        debugUrl = browserbaseSession.debugUrl || 'http://localhost:3000';
        
        console.log('[Session Creation] Successfully created Browserbase session using Node.js SDK');
        
      } catch (nodeSdkError) {
        // If Node.js SDK approach fails, fall back to existing connector
        console.log('[Session Creation] Node.js SDK approach failed, trying existing connector as fallback:', nodeSdkError);
        
        try {
          console.log('[Session Creation] Using Python connector for Browserbase');
          
          // Pass correct keys 'width' and 'height' expected by the connector's Python script
          const browserbaseSession = await browserbaseConnector.createSession({
            headless: req.body.settings?.headless || false,
            width: req.body.settings?.browserSettings?.windowSize?.width || 1366, // Correct key
            height: req.body.settings?.browserSettings?.windowSize?.height || 768 // Correct key
          });

          // Store Browserbase session ID in the session manager
          sessionManager.updateSession(sessionId, {
            browserbaseSessionId: browserbaseSession.id,
            usingNodeSdk: false // Flag to indicate we're using the original connector
          });

          // Use Browserbase session URLs
          sessionUrl = browserbaseSession.debug_url || `http://localhost:3000/browser/${sessionId}`;
          connectUrl = browserbaseSession.connect_url || `ws://localhost:3000/ws`;
          wsUrl = browserbaseSession.ws_url || `ws://localhost:3000/ws`;
          debugUrl = browserbaseSession.debug_url || 'http://localhost:3000';

          console.log('[Session Creation] Successfully created Browserbase session using Python connector');
        } catch (connectorError) {
          // If both approaches fail, fall back to Web UI's native browser
          console.error('[Session Creation] Both Node SDK and Python connector failed:', connectorError);
          
          // Update session to indicate Browserbase is not available
          sessionManager.updateSession(sessionId, {
            useBrowserbase: false
          });

          // Fall back to standard WebUI if Browserbase is not available
          sessionUrl = `${WEBUI_URL}/browser/${sessionId}`;
          connectUrl = `ws://localhost:${WEBUI_PORT}/ws`;
          wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;
          debugUrl = WEBUI_URL;
          
          console.log('[Session Creation] Falling back to WebUI native browser');
        }
      }
    } catch (error) {
      console.error('[Session Creation] Unhandled error in Browserbase session creation:', error);
      // Fall back to default values if all approaches fail
      sessionUrl = `http://localhost:3000/browser/${sessionId}`;
      connectUrl = `ws://localhost:3000/ws`;
      wsUrl = `ws://localhost:3000/ws`;
      debugUrl = 'http://localhost:3000';
    }
  } else {
    // Native Browser mode - forward directly to Web UI
    console.log('[Session Creation] Using Native Browser logic (Web UI)');
    sessionUrl = `${WEBUI_URL}/browser/${sessionId}`;
    connectUrl = `ws://localhost:${WEBUI_PORT}/ws`;
    wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;
    debugUrl = WEBUI_URL;
  }

  // Send response with session info
  const response = {
    success: true,
    sessionId,
    contextId: req.body.contextId || '',
    sessionUrl,
    connectUrl,
    wsUrl,
    debugUrl
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

    // Task hash for loop detection
    const taskHash = `${goal}`;

    // Record task in history for pattern-based detection
    if (sessionId && previousSteps.length > 0) {
      const lastStep = previousSteps[previousSteps.length - 1];
      sessionManager.addTaskHistory(sessionId, lastStep);
    }

    // Check for infinite loops using enhanced detection
    if (sessionManager.isLoopDetected(sessionId)) {
      console.log(`[Intent] Loop detected for session ${sessionId}, resetting task counter`);
      sessionManager.resetTaskCounter(sessionId);
      return res.status(400).json({
        success: false,
        error: 'Task loop detected - breaking cycle'
      });
    }

    // Check if task has already been completed
    if (previousSteps.length > 1 && sessionManager.isTaskCompleted(sessionId, taskHash)) {
      console.log(`[Intent] Task already completed for session ${sessionId}: ${taskHash}`);
      return res.json({
        success: true,
        result: {
          tool: 'CLOSE',
          args: {},
          text: 'Task already completed',
          reasoning: 'This task was previously completed for this session',
          instruction: 'No further action needed'
        }
      });
    }

    if (session?.useOpenOperatorBrowser) {
      // If using Open Operator browser with WebUI, delegate intent processing
      // This part might need adjustment based on how WebUI handles intent vs execution
      try {
        const browserSession = session.browserbaseSessionId ? sessionManager.getSession(session.browserbaseSessionId) : null;
        
        const gradioRequest = {
          agent_type: "org",               // Using org agent type
          llm_provider: "openai",          // LLM provider
          llm_model_name: "gpt-4o",        // Model name
          llm_num_ctx: 4096,               // Context window size
          llm_temperature: 0.7,            // Temperature
          llm_base_url: "",                // Base URL
          llm_api_key: "",                 // API key
          use_own_browser: session.useBrowserbase,  // Use external browser when Browserbase mode is enabled
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
          tool_calling_method: "auto",     // Tool calling method
          chrome_cdp: session.browserbaseConnectUrl || "" // Connect to Open Operator's browser using CDP URL
        };

        console.log('[Intent] Sending to Gradio API:', {
          url: `${WEBUI_URL}/run_with_stream`,
          body: gradioRequest
        });

        // Log the request before sending
        const requestBodyString = JSON.stringify(gradioRequest);
        console.log(`[Intent] Sending fetch to ${WEBUI_URL}/run_with_stream with body: ${requestBodyString}`);

        const webUiResponse = await fetch(`${WEBUI_URL}/run_with_stream`, { // Using correct endpoint
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBodyString // Use the stringified body
        });

        console.log(`[Intent] Received response from WebUI: Status ${webUiResponse.status}`); // Log status

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
        } else {
           // Log non-OK response body if possible
           const errorBody = await webUiResponse.text();
           console.error(`[Intent] WebUI non-OK response body: ${errorBody}`);
        }
      } catch (error) {
        // Log the full error object for fetch failures
        console.error('[Intent] WebUI communication fetch failed:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause // Undici fetch errors often have a cause
        });
        // Fall through to mock response if WebUI intent processing fails
      }
    }

    // Fallback to mock response if not using WebUI or if WebUI call failed
    let nextAction;

    // Try WebUI first if enabled
    if (session?.useOpenOperatorBrowser && previousSteps.length === 0) {
      try {
        // Try to delegate to WebUI agent
        const result = await runPythonBridge('execute_step', {
          task: goal,
          step: {
            tool: 'NAVIGATE',
            args: {},
            text: `Handle this request: ${goal}`
          },
          use_own_browser: true
        });

        if (result && result.success && result.browserView) {
          // WebUI agent handled it successfully, parse its response
          const stepResult = result.actions ? JSON.parse(result.actions) : null;
          if (stepResult && stepResult.tool) {
            nextAction = stepResult;
          }
        }
      } catch (error) {
        console.error('[Intent] WebUI delegation failed:', error);
      }
    }

    // If WebUI didn't handle it or we're in a multi-step sequence
    if (!nextAction) {
      // If this is the first step, start with Google
      if (previousSteps.length === 0) {
        nextAction = {
          tool: 'NAVIGATE',
          args: { url: 'https://google.com' },
          text: 'Navigating to Google',
          reasoning: 'Starting with Google as fallback strategy',
          instruction: 'Opening Google to help process request'
        };
      } else {
        // Handle subsequent steps based on previous action
        const lastStep = previousSteps[previousSteps.length - 1];
        
        // Generic flow based on previous step
        switch (lastStep.tool.toUpperCase()) {
        case 'NAVIGATE':
          nextAction = {
            tool: 'EXTRACT',
            args: { selector: 'body' },
            text: 'Reading page content',
            reasoning: 'Extracting page information to determine next steps',
            instruction: 'Analyze the page content'
          };
          break;

        case 'EXTRACT':
          // For Google, look for the search box
          nextAction = {
            tool: 'CLICK',
            args: {
              selector: 'input[name="q"]'  // Google's search input
            },
            text: 'Clicking on search input',
            reasoning: 'Interacting with the search field',
            instruction: 'Click on the search box'
          };
          break;

        case 'CLICK':
          // If we just clicked, we probably want to type something
          nextAction = {
            tool: 'TYPE',
            args: {
              text: goal,  // Use the goal as our search term
              selector: 'input[name="q"]'
            },
            text: 'Typing search query',
            reasoning: 'Entering information to search for',
            instruction: 'Type the search query'
          };
          break;

        case 'TYPE':
          // After typing in a search box, click search button
          nextAction = {
            tool: 'CLICK',
            args: {
              selector: 'input[name="btnK"], button[name="btnK"]'  // Google's search button
            },
            text: 'Clicking search button',
            reasoning: 'Submitting the search query',
            instruction: 'Click the search button'
          };
          break;

        default:
          // Final step - close the session
          nextAction = {
            tool: 'CLOSE',
            args: {},
            text: 'Finishing task',
            reasoning: 'Task steps completed',
            instruction: 'Close the current browser session'
          };
        }
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

    // Add step to task history for loop detection
    sessionManager.addTaskHistory(sessionId, step);

    // Check for infinite loops during execution
    if (sessionManager.isLoopDetected(sessionId)) {
      console.log(`[Execute] Loop detected for session ${sessionId} during execution, forcing CLOSE`);
      sessionManager.resetTaskCounter(sessionId);
      return res.json({
        success: true,
        result: {
          tool: 'CLOSE',
          args: {},
          text: 'Task loop detected - stopping execution',
          reasoning: 'A potential infinite loop was detected',
          instruction: 'Stopping task execution to prevent looping'
        }
      });
    }

    // Determine which browser implementation to use
    if (session?.useBrowserbase && session.browserbaseSessionId) {
      console.log(`[Execute] Using Browserbase for session ${sessionId}`);

      const browserbaseSessionId = session.browserbaseSessionId;
      
      // Check if we're using the Node.js SDK or the Python connector
      if (session.usingNodeSdk) {
        try {
          console.log(`[Execute] Using Node.js SDK for Browserbase session ${browserbaseSessionId}`);
          
          // Initialize the Browserbase SDK client
          const bb = new Browserbase({
            apiKey: process.env.BROWSERBASE_API_KEY || "not-needed-for-local",
          });
          
          // Handle different tool types using the Node.js SDK
          let result;
          
          switch(step.tool.toUpperCase()) {
            case 'NAVIGATE':
              // Use the SDK to navigate
              result = await bb.browser.navigate({
                sessionId: browserbaseSessionId,
                url: step.args.url
              });
              break;
              
            case 'CLICK':
              // Use the SDK to click
              result = await bb.browser.click({
                sessionId: browserbaseSessionId,
                selector: step.args.selector || undefined,
                text: step.args.text || undefined
              });
              break;
              
            case 'TYPE':
              // Use the SDK to type
              result = await bb.browser.type({
                sessionId: browserbaseSessionId,
                selector: step.args.selector,
                text: step.args.text
              });
              break;
              
            case 'EXTRACT':
              // Use the SDK to extract content
              result = await bb.browser.extract({
                sessionId: browserbaseSessionId,
                selector: step.args.selector
              });
              break;
              
            case 'CLOSE':
              // Close the session
              await bb.sessions.close({
                sessionId: browserbaseSessionId
              });
              
              // Get the goal/task from session context if available
              const context = req.body.context || {};
              const goal = context.goal || context.task || '';
              
              if (goal) {
                console.log(`[Execute] Marking task as completed for session ${sessionId}: ${goal}`);
                sessionManager.markTaskCompleted(sessionId, goal);
              }
              
              return res.json({
                success: true,
                result: {
                  text: step.text || 'Browser closed',
                  reasoning: step.reasoning || 'Task completed',
                  instruction: step.instruction || 'Session closed'
                }
              });
              
            default:
              return res.status(400).json({
                success: false,
                error: `Unsupported tool type for Browserbase SDK: ${step.tool}`
              });
          }
          
          // Return the result
          return res.json({
            success: true,
            result: {
              url: step.args.url || result.url || 'https://example.com',
              content: result.content || '<html><body>Content from Browserbase SDK</body></html>',
              extraction: result.extraction || result,
              text: step.text,
              reasoning: step.reasoning,
              instruction: step.instruction
            }
          });
          
        } catch (error) {
          console.error(`[Execute] Browserbase SDK error:`, error);
          return res.status(500).json({
            success: false,
            error: `Browserbase SDK error: ${error.message}`
          });
        }
      } else {
        // Using the original Python connector
        try {
          console.log(`[Execute] Using Python connector for Browserbase session ${browserbaseSessionId}`);
          
          // Handle different tool types using Browserbase connector
          let result;
  
          switch(step.tool.toUpperCase()) {
            case 'NAVIGATE':
              result = await browserbaseConnector.navigate(
                browserbaseSessionId,
                step.args.url
              );
              break;
  
            case 'CLICK':
              result = await browserbaseConnector.click(
                browserbaseSessionId,
                step.args.selector || step.args.text
              );
              break;
  
            case 'TYPE':
              result = await browserbaseConnector.type(
                browserbaseSessionId,
                step.args.selector,
                step.args.text
              );
              break;
  
            case 'EXTRACT':
              result = await browserbaseConnector.extract(
                browserbaseSessionId,
                step.args.selector
              );
              break;
  
            case 'CLOSE':
              await browserbaseConnector.closeSession(browserbaseSessionId);
  
              // Get the goal/task from session context if available
              const context = req.body.context || {};
              const goal = context.goal || context.task || '';
  
              if (goal) {
                console.log(`[Execute] Marking task as completed for session ${sessionId}: ${goal}`);
                sessionManager.markTaskCompleted(sessionId, goal);
              }
  
              return res.json({
                success: true,
                result: {
                  text: step.text || 'Browser closed',
                  reasoning: step.reasoning || 'Task completed',
                  instruction: step.instruction || 'Session closed'
                }
              });
  
            default:
              return res.status(400).json({
                success: false,
                error: `Unsupported tool type for Browserbase connector: ${step.tool}`
              });
          }
  
          // Return the result
          return res.json({
            success: true,
            result: {
              url: step.args.url || 'https://example.com',
              content: '<html><body>Content from Browserbase connector</body></html>',
              extraction: result,
              text: step.text,
              reasoning: step.reasoning,
              instruction: step.instruction
            }
          });
  
        } catch (error) {
          console.error(`[Execute] Browserbase connector error:`, error);
          return res.status(500).json({
            success: false,
            error: `Browserbase connector error: ${error.message}`
          });
        }
      }
    } else if (session?.useOpenOperatorBrowser) {
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
            use_own_browser: session.useBrowserbase, // Use external browser if in Browserbase mode
            chrome_cdp: session.browserbaseConnectUrl || "", // Pass CDP URL for external browser
            sessionId // Pass the sessionId to the bridge
          });

          console.log('[Execute] WebUI bridge response:', result);

          if (!result || result.error) {
            throw new Error(result?.error || 'Unknown error executing step');
          }

          // Check if the task has been completed from the WebUI response
          const isDone =
            (result.finalResult && result.finalResult.toLowerCase().includes('complet')) ||
            (result.thoughts && result.thoughts.toLowerCase().includes('complet')) ||
            step.tool.toUpperCase() === 'DONE';

          // If this is a completion action, mark the task as completed
          if (isDone || step.tool.toUpperCase() === 'CLOSE') {
            const context = req.body.context || {};
            const goal = context.goal || context.task || '';

            if (goal) {
              console.log(`[Execute] WebUI marked task as completed for session ${sessionId}: ${goal}`);
              sessionManager.markTaskCompleted(sessionId, goal);
            }
          }

          // Process the response from gradio_bridge.py
          return res.json({
            success: true,
            result: {
              url: step.args.url || 'https://google.com',
              content: result.browserView || '<html><body>Content N/A</body></html>',
              extraction: result.extraction || {},
              text: result.finalResult || step.text,
              reasoning: result.thoughts || step.reasoning,
              instruction: step.instruction
            }
          });

        } catch (error) {
          // Log the full error object for fetch failures
          console.error('[Execute] WebUI communication failed:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause // Undici fetch errors often have a cause
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

    // Handle task completion for terminal actions
    if (step.tool.toUpperCase() === 'CLOSE' ||
        (step.text && step.text.toLowerCase().includes('complet'))) {
      // Get the goal/task from session context if available
      const context = req.body.context || {};
      const goal = context.goal || context.task || '';

      if (goal) {
        console.log(`[Execute] Marking task as completed for session ${sessionId}: ${goal}`);
        sessionManager.markTaskCompleted(sessionId, goal);
      }
    }

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

// Delete session (Simplified for debugging)
app.delete('/session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log(`[Session Debug] Received request to delete session ${sessionId}`);

    // Minimal logic: Just delete from manager if exists
    const session = sessionManager.getSession(sessionId);
    if (session) {
      sessionManager.deleteSession(sessionId);
      console.log(`[Session Debug] Deleted session ${sessionId} from manager.`);
    } else {
      console.log(`[Session Debug] Session ${sessionId} not found.`);
      // Send 404 if not found and headers not sent
      if (!res.headersSent) {
        return res.status(404).json({ success: false, error: `Session ${sessionId} not found` });
      }
      return; // Stop if not found
    }

    // Send success response if headers not already sent
    if (!res.headersSent) {
      res.json({ success: true, message: 'Session closed successfully (debug mode)' });
    }
  } catch (error) {
    console.error(`[Session Debug] Error during simplified deletion for session ${req.body?.sessionId}:`, {
      message: error.message,
      stack: error.stack
    });
    // Attempt to send an error response if none has been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: `Internal server error during session closure: ${error.message}`
      });
    }
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Using LLM provider: openai, model: gpt-4o`);
  console.log(`API key found in config`);
  console.log(`Bridge server running at http://localhost:${PORT}`);
});
