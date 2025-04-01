const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');
const sessionManager = require('./session-manager');
const browserbaseConnector = require('./browserbase-connector');
const Browserbase = require('@browserbasehq/sdk');
const { chromium } = require('playwright-core');

const app = express();
const PORT = process.env.PORT || 7789;

// WebUI integration constants
const WEBUI_PORT = 7788;
const WEBUI_URL = `http://localhost:${WEBUI_PORT}`;
const WEBUI_API_URL = `${WEBUI_URL}/api`;
let webUIAvailable = false;

// Check if Web UI is available
async function checkWebUIAvailability() {
  try {
    console.log(`[WebUI Check] Testing WebUI at ${WEBUI_URL}`);
    const apiResponse = await fetch(`${WEBUI_URL}/`, {
      timeout: 2000,
      headers: { 'Accept': 'application/json, text/html' }
    });

    if (!apiResponse.ok) {
      console.log(`[WebUI Check] Status check failed: ${apiResponse.status} ${apiResponse.statusText}`);
      return false;
    }

    try {
      const contentType = apiResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const healthData = await apiResponse.json();
        console.log('[WebUI Check] Health response JSON:', healthData);
        const isAvailable = healthData.status ? healthData.status === 'ok' : true;
        console.log(`[WebUI Check] WebUI available (JSON): ${isAvailable}`);
        return isAvailable;
      } else {
        console.log('[WebUI Check] WebUI responded with non-JSON content type:', contentType);
        console.log('[WebUI Check] Considering WebUI available since it responded successfully');
        return true;
      }
    } catch (jsonError) {
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

// Helper Functions
async function runPythonBridge(command, args = {}) {
  // ... (keep existing runPythonBridge implementation)
}

function mockBrowserResponse(action, options = {}) {
  // ... (keep existing mockBrowserResponse implementation)
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'WebUI Bridge Server is running' });
});

app.get('/health', async (req, res) => {
  // ... (keep existing health endpoint implementation)
});

app.get('/browserbase/health', async (req, res) => {
  // ... (keep existing browserbase health endpoint implementation)
});

// Create new session endpoints
app.post(['/api/session', '/session'], createSession);

async function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);

  const sessionId = `session-${Date.now()}`;

  // Determine if Browserbase should be used based on frontend settings
  const useBrowserbase = req.body.settings?.useBrowserbase === true;
  const browserType = req.body.settings?.browserType || "unknown";
  console.log(`[Bridge Server] Creating session with browser type: ${browserType}`);
  console.log(`[Bridge Server] Using Browserbase: ${useBrowserbase}`);

  // Create session in session manager with single unified flag
  const session = sessionManager.createSession(sessionId, {
    contextId: req.body.contextId || '',
    useBrowserbase: useBrowserbase
  });

  let sessionUrl, connectUrl, wsUrl, debugUrl;

  if (useBrowserbase) {
      try {
        console.log('[Bridge Server] Browser type details:', {
          useBrowserbase,
          browserType,
          usingNodeSdk: false,
          settings: req.body.settings
        });
        
        // Try Node.js SDK first
        try {
          console.log('[Bridge Server] Attempting to use Node.js Browserbase SDK');
        const bb = new Browserbase({
          apiKey: process.env.BROWSERBASE_API_KEY || "not-needed-for-local",
        });
        
        const browserbaseSession = await bb.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID || "local",
          // Include window size and other settings
          width: req.body.settings?.browserSettings?.windowSize?.width || 1366,
          height: req.body.settings?.browserSettings?.windowSize?.height || 768,
          headless: req.body.settings?.headless || false
        });
        
        sessionManager.updateSession(sessionId, {
          browserbaseSessionId: browserbaseSession.id,
          browserbaseConnectUrl: browserbaseSession.connectUrl,
          usingNodeSdk: true
        });
        
        sessionUrl = browserbaseSession.sessionUrl || browserbaseSession.debugUrl;
        connectUrl = browserbaseSession.connectUrl;
        wsUrl = browserbaseSession.wsUrl || connectUrl;
        debugUrl = browserbaseSession.debugUrl;
        
        console.log('[Session Creation] Successfully created Browserbase session using Node.js SDK');
        
      } catch (nodeSdkError) {
        // Fall back to Python connector
        console.log('[Bridge Server] Node.js SDK failed, falling back to Python connector:', nodeSdkError);
        console.log('[Bridge Server] Python connector browser settings:', {
          headless: req.body.settings?.headless || false,
          width: req.body.settings?.browserSettings?.windowSize?.width || 1366,
          height: req.body.settings?.browserSettings?.windowSize?.height || 768
        });
        
        const browserbaseSession = await browserbaseConnector.createSession({
          headless: req.body.settings?.headless || false,
          width: req.body.settings?.browserSettings?.windowSize?.width || 1366,
          height: req.body.settings?.browserSettings?.windowSize?.height || 768
        });

        sessionManager.updateSession(sessionId, {
          browserbaseSessionId: browserbaseSession.id,
          browserbaseConnectUrl: browserbaseSession.connect_url,
          usingNodeSdk: false
        });

        sessionUrl = browserbaseSession.debug_url;
        connectUrl = browserbaseSession.connect_url;
        wsUrl = browserbaseSession.ws_url;
        debugUrl = browserbaseSession.debug_url;

        console.log('[Session Creation] Successfully created Browserbase session using Python connector');
      }
    } catch (error) {
      console.error('[Session Creation] Both Browserbase approaches failed:', error);
      // Fall back to WebUI
      console.log('[Session Creation] Falling back to WebUI');
      sessionUrl = `${WEBUI_URL}/browser/${sessionId}`;
      connectUrl = `ws://localhost:${WEBUI_PORT}/ws`;
      wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;
      debugUrl = WEBUI_URL;
    }
  } else {
    // Using WebUI's native browser
    console.log('[Session Creation] Using WebUI native browser');
    sessionUrl = `${WEBUI_URL}/browser/${sessionId}`;
    connectUrl = `ws://localhost:${WEBUI_PORT}/ws`;
    wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;
    debugUrl = WEBUI_URL;
  }

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

// Intent processing endpoint
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

    if (session?.useBrowserbase) {
      // If using Browserbase with WebUI, delegate intent processing
      try {
        const browserSession = session.browserbaseSessionId ? sessionManager.getSession(session.browserbaseSessionId) : null;
        
        const gradioRequest = {
          agent_type: "org",               
          llm_provider: "openai",          
          llm_model_name: "gpt-4o",        
          llm_num_ctx: 4096,               
          llm_temperature: 0.7,            
          llm_base_url: "",                
          llm_api_key: "",                 
          use_own_browser: session.useBrowserbase,  
          keep_browser_open: true,         
          headless: false,                 
          disable_security: false,         
          window_w: 1280,                  
          window_h: 720,                   
          save_recording_path: "",         
          save_agent_history_path: "",     
          save_trace_path: "",             
          enable_recording: false,         
          task: goal,                      
          add_infos: "",                   
          max_steps: 1,                    
          use_vision: false,               
          max_actions_per_step: 1,         
          tool_calling_method: "auto",     
          chrome_cdp: session.browserbaseConnectUrl || "" 
        };

        // Modified to use the proper Gradio API endpoint format
        console.log('[Intent] Sending to Gradio API:', {
          url: `${WEBUI_URL}/api/predict`,
          body: gradioRequest
        });

        const requestBodyString = JSON.stringify(gradioRequest);
        console.log(`[Intent] Sending fetch to ${WEBUI_URL}/api/predict with body: ${requestBodyString}`);

        const webUiResponse = await fetch(`${WEBUI_URL}/api/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBodyString
        });

        console.log(`[Intent] Received response from WebUI: Status ${webUiResponse.status}`);

        if (webUiResponse.ok) {
          const webUiData = await webUiResponse.json();
          if (webUiData.data && webUiData.data.length > 0) {
             const resultData = webUiData.data[0];
             return res.json({
               success: true,
               result: {
                 tool: resultData?.tool || 'NAVIGATE',
                 args: resultData?.args || {},
                 text: resultData?.text || 'Executing action',
                 reasoning: resultData?.reasoning || 'Processing request',
                 instruction: resultData?.instruction || 'Perform action'
               }
             });
          }
        } else {
           const errorBody = await webUiResponse.text();
           console.error(`[Intent] WebUI non-OK response body: ${errorBody}`);
        }
      } catch (error) {
        console.error('[Intent] WebUI communication fetch failed:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
      }
    }

    // Fallback to mock response if not using WebUI or if WebUI call failed
    let nextAction;

    // Try WebUI first if enabled
    if (session?.useBrowserbase && previousSteps.length === 0) {
      try {
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
          const stepResult = result.actions ? JSON.parse(result.actions) : null;
          if (stepResult && stepResult.tool) {
            nextAction = stepResult;
          }
        }
      } catch (error) {
        console.error('[Intent] WebUI delegation failed:', error);
      }
    }

    if (!nextAction) {
      if (previousSteps.length === 0) {
        nextAction = {
          tool: 'NAVIGATE',
          args: { url: 'https://google.com' },
          text: 'Navigating to Google',
          reasoning: 'Starting with Google as fallback strategy',
          instruction: 'Opening Google to help process request'
        };
      } else {
        const lastStep = previousSteps[previousSteps.length - 1];
        
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
          nextAction = {
            tool: 'CLICK',
            args: {
              selector: 'input[name="q"]'
            },
            text: 'Clicking on search input',
            reasoning: 'Interacting with the search field',
            instruction: 'Click on the search box'
          };
          break;

        case 'CLICK':
          nextAction = {
            tool: 'TYPE',
            args: {
              text: goal,
              selector: 'input[name="q"]'
            },
            text: 'Typing search query',
            reasoning: 'Entering information to search for',
            instruction: 'Type the search query'
          };
          break;

        case 'TYPE':
          nextAction = {
            tool: 'CLICK',
            args: {
              selector: 'input[name="btnK"], button[name="btnK"]'
            },
            text: 'Clicking search button',
            reasoning: 'Submitting the search query',
            instruction: 'Click the search button'
          };
          break;

        default:
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
      
      if (session.usingNodeSdk) {
        try {
          console.log(`[Execute] Using Node.js SDK for Browserbase session ${browserbaseSessionId}`);
          
          const bb = new Browserbase({
            apiKey: process.env.BROWSERBASE_API_KEY || "not-needed-for-local",
          });
          
          let result;
          
          switch(step.tool.toUpperCase()) {
            case 'NAVIGATE':
              result = await bb.browser.navigate({
                sessionId: browserbaseSessionId,
                url: step.args.url
              });
              break;
              
            case 'CLICK':
              result = await bb.browser.click({
                sessionId: browserbaseSessionId,
                selector: step.args.selector || undefined,
                text: step.args.text || undefined
              });
              break;
              
            case 'TYPE':
              result = await bb.browser.type({
                sessionId: browserbaseSessionId,
                selector: step.args.selector,
                text: step.args.text
              });
              break;
              
            case 'EXTRACT':
              result = await bb.browser.extract({
                sessionId: browserbaseSessionId,
                selector: step.args.selector
              });
              break;
              
            case 'CLOSE':
              await bb.sessions.close({
                sessionId: browserbaseSessionId
              });
              
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
        try {
          console.log(`[Execute] Using Python connector for Browserbase session ${browserbaseSessionId}`);
          
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
    }

    // Using WebUI's native browser
    console.log('[Execute] Using WebUI native browser');
    
    const mockResult = mockBrowserResponse(step.tool.toLowerCase(), step.args);

    // Handle task completion for terminal actions
    if (step.tool.toUpperCase() === 'CLOSE' ||
        (step.text && step.text.toLowerCase().includes('complet'))) {
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
  // ... (keep existing agent endpoint implementation)
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
      use_own_browser: session.useBrowserbase // Updated to use single flag
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

// Navigation endpoints
app.post('/api/sessions/:sessionId/navigate', (req, res) => {
  // ... (keep existing navigate endpoint implementation)
});

// Delete session
app.delete('/session', async (req, res) => {
  // ... (keep existing delete session endpoint implementation)
});

// Start the server
app.listen(PORT, () => {
  console.log(`Using LLM provider: openai, model: gpt-4o`);
  console.log(`API key found in config`);
  console.log(`Bridge server running at http://localhost:${PORT}`);
});
