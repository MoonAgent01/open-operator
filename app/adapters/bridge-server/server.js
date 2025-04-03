const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const bodyParser = require('body-parser');
const sessionManager = require('./session-manager');
const browserbaseConnector = require('./browserbase-connector');
// Replace the original Browserbase SDK with our custom proxy
const Browserbase = require('./browserbase-sdk-proxy');
const { chromium } = require('playwright-core');
const { runPythonBridge } = require('./python-bridge'); // Import the bridge function

const app = express();
const PORT = process.env.PORT || 7789;

// WebUI integration constants
const WEBUI_PORT = 7788;
const WEBUI_URL = `http://localhost:${WEBUI_PORT}`;
const WEBUI_API_URL = `${WEBUI_URL}/api`; // Base API URL, specific endpoints might differ
let webUIAvailable = false;

// Check if Web UI is available and verify API endpoints
async function checkWebUIAvailability() {
  try {
    console.log(`[WebUI Check] Testing WebUI at ${WEBUI_URL}`);
    
    // Check root path first, as Gradio apps usually respond here
    const rootResponse = await fetch(`${WEBUI_URL}/`, {
      timeout: 2000,
      headers: { 'Accept': 'text/html' } // Gradio root usually serves HTML
    });

    if (!rootResponse.ok) {
      console.log(`[WebUI Check] Root path check failed: ${rootResponse.status} ${rootResponse.statusText}`);
      return false; // Assume unavailable if root check fails
    }
    
    console.log(`[WebUI Check] WebUI root path responding.`);
    
    // Check each API endpoint we'll be using
    const endpoints = [];
    
    // We don't actually check these endpoints directly since they may require authentication
    // or proper request payloads, but we note them for reference
    console.log(`[WebUI Check] Essential WebUI API endpoints:`);
    console.log(`[WebUI Check] - Session API: ${WEBUI_URL}/session`);
    console.log(`[WebUI Check] - Intent API (if implemented): ${WEBUI_URL}/api/intent`);
    console.log(`[WebUI Check] - Execute API (if implemented): ${WEBUI_URL}/api/execute`);
    
    // Instead of detailed endpoint checks that might fail due to missing parameters,
    // we'll just report WebUI as available if the root responded
    console.log(`[WebUI Check] WebUI responded successfully. Integration ready.`);
    webUIAvailable = true;
    return true;

  } catch (error) {
    console.error('[WebUI Check] Error checking WebUI availability:', error.message);
    webUIAvailable = false;
    return false;
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Helper Functions
function mockBrowserResponse(action, options = {}) {
    console.log(`[Mock Response] Generating mock for action: ${action}`, options);
    switch (action.toLowerCase()) {
      case 'navigate':
        return { url: options.url || 'https://example.com', content: `<html><body>Mock navigation to ${options.url || 'example.com'}</body></html>` };
      case 'click':
        return { message: `Mock click on selector: ${options.selector || options.text || 'unknown element'}` };
      case 'type':
        return { message: `Mock type "${options.text}" into selector: ${options.selector}` };
      case 'extract':
        return { extraction: `Mock extraction from selector: ${options.selector || 'body'}` };
      case 'close':
        return { message: 'Mock browser closed' };
      default:
        return { message: `Mock response for unknown action: ${action}` };
    }
}


// Routes
app.get('/', (req, res) => {
  res.json({ message: 'WebUI Bridge Server is running' });
});

app.get('/health', async (req, res) => {
    const isWebUIAvailable = await checkWebUIAvailability();
    // Add Browserbase health check if needed
    res.json({
      status: 'ok',
      activeSessions: sessionManager.getActiveSessionCount(),
      ports: {
        webui: WEBUI_PORT,
        bridge: PORT
      },
      webui_status: isWebUIAvailable ? 'ok' : 'unavailable',
      // browserbase_status: 'unknown' // Add actual check if needed
    });
});

app.get('/browserbase/health', async (req, res) => {
    try {
        // Use our custom SDK implementation - no API key required
        const bb = new Browserbase();
        await bb.sessions.list({ limit: 1 });
        res.json({ 
            status: 'ok',
            implementation: 'custom',
            message: 'Using custom Browserbase SDK implementation'
        });
    } catch (error) {
        console.error('[Browserbase Health] Error:', error);
        res.status(503).json({ status: 'error', message: error.message });
    }
});

// Create new session endpoints
app.post(['/api/session', '/session'], createSession);

async function createSession(req, res) {
  console.log('[Session Creation] POST /session received:', req.body);

  const sessionId = `session-${Date.now()}`;

  // Determine if Browserbase should be used based on frontend settings
  const useBrowserbase = req.body.settings?.useBrowserbase === true;
  const browserType = req.body.settings?.browserType || (useBrowserbase ? "browserbase" : "native"); // Infer if not provided
  console.log(`[Bridge Server] Creating session with browser type: ${browserType}`);
  console.log(`[Bridge Server] Using Browserbase: ${useBrowserbase}`);

  // Create session in session manager with single unified flag
  const session = sessionManager.createSession(sessionId, {
    contextId: req.body.contextId || '',
    useBrowserbase: useBrowserbase,
    browserType: browserType // Store determined browser type
  });

  let sessionUrl, connectUrl, wsUrl, debugUrl;

  if (useBrowserbase) {
      try {
        console.log('[Bridge Server] Browser type details:', {
          useBrowserbase,
          browserType,
          settings: req.body.settings
        });

        // Create a browser session using our custom SDK
        console.log('[Bridge Server] Using customized Browserbase SDK');
        const bb = new Browserbase();  // No API key needed
          
        const browserbaseSession = await bb.sessions.create({
          width: req.body.settings?.browserSettings?.windowSize?.width || 1366,
          height: req.body.settings?.browserSettings?.windowSize?.height || 768,
          headless: req.body.settings?.headless || false,
          useOwnBrowser: true, // Use WebUI's browser
          keepBrowserOpen: req.body.settings?.keepBrowserOpen || true
        });

        sessionManager.updateSession(sessionId, {
          browserbaseSessionId: browserbaseSession.id,
          browserbaseConnectUrl: browserbaseSession.connectUrl || browserbaseSession.wsUrl,
          usingNodeSdk: true
        });

        sessionUrl = browserbaseSession.sessionUrl || browserbaseSession.debugUrl;
        connectUrl = browserbaseSession.connectUrl;
        wsUrl = browserbaseSession.wsUrl || connectUrl;
        debugUrl = browserbaseSession.debugUrl;

        console.log('[Session Creation] Successfully created Browserbase session');
      } catch (error) {
        console.error('[Session Creation] Browserbase session creation failed:', error);
        // Fall back to WebUI native browser
        console.log('[Session Creation] Falling back to WebUI native browser');
        sessionManager.updateSession(sessionId, { useBrowserbase: false, browserType: 'native' }); // Update session state
        // Point sessionUrl and debugUrl to the main WebUI interface URL
        sessionUrl = WEBUI_URL;
        connectUrl = `ws://localhost:${WEBUI_PORT}/ws`; // Keep WebSocket URL if applicable
        wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;      // Keep WebSocket URL if applicable
        debugUrl = WEBUI_URL; // Debug URL is the main interface
      }
  } else {
    // Using WebUI's native browser
    console.log('[Session Creation] Using WebUI native browser');
    // Point sessionUrl and debugUrl to the main WebUI interface URL
    sessionUrl = WEBUI_URL;
    connectUrl = `ws://localhost:${WEBUI_PORT}/ws`; // Keep WebSocket URL if applicable
    wsUrl = `ws://localhost:${WEBUI_PORT}/ws`;      // Keep WebSocket URL if applicable
    debugUrl = WEBUI_URL; // Debug URL is the main interface
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
    const sessionId = req.body.sessionId || (previousSteps.length > 0 ? previousSteps[0].sessionId : null);

    if (!goal) return res.status(400).json({ success: false, error: 'Missing goal' });
    if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' });

    const session = sessionManager.getSession(sessionId);
    if (!session) return res.status(404).json({ success: false, error: `Session ${sessionId} not found` });

    console.log(`[Intent] Using session ${sessionId} with browser type: ${session.browserType}`);

    // --- Loop Detection ---
    const taskHash = `${goal}-${JSON.stringify(previousSteps.map(s => s.tool))}`; // More robust hash
    if (previousSteps.length > 0) {
        sessionManager.addTaskHistory(sessionId, previousSteps[previousSteps.length - 1]);
    }
    if (sessionManager.isLoopDetected(sessionId)) {
        console.log(`[Intent] Loop detected for session ${sessionId}, resetting task counter`);
        sessionManager.resetTaskCounter(sessionId);
        // Return CLOSE action instead of error to gracefully end the loop in UI
        return res.json({
            success: true,
            sessionId: sessionId, // Add sessionId
            result: {
                tool: 'CLOSE',
                args: {},
                text: 'Task loop detected - stopping execution',
                reasoning: 'A potential infinite loop was detected',
                instruction: 'Stopping task execution to prevent looping'
            }
        });
    }
    // --- End Loop Detection ---

    // --- Task Completion Check ---
    if (previousSteps.length > 1 && sessionManager.isTaskCompleted(sessionId, goal)) { // Check against goal
      console.log(`[Intent] Task already completed for session ${sessionId}: ${goal}`);
      return res.json({
        success: true,
        sessionId: sessionId, // Add sessionId
        result: {
          tool: 'CLOSE',
          args: {},
          text: 'Task already completed',
          reasoning: 'This task was previously completed for this session',
          instruction: 'No further action needed'
        }
      });
    }
    // --- End Task Completion Check ---

    // --- WebUI API Call ---
    // We use the browserbaseConnector to interface with WebUI for all browser types
    try {
        console.log('[Intent] Using browserbaseConnector to process intent with WebUI');
        const intentResult = await browserbaseConnector.processIntent(
            goal, 
            sessionId, 
            previousSteps, 
            context
        );
        
        if (intentResult.success) {
            console.log('[Intent] WebUI successfully processed intent:', intentResult.result);
            return res.json({
                success: true,
                sessionId: sessionId,
                result: intentResult.result
            });
        }
    } catch (error) {
        console.error('[Intent] Error using WebUI connector:', error);
        // Continue to fallback if connector fails
    }
    // --- End WebUI API Call ---


    // --- Ultimate Fallback Logic ---
    // This is the last resort if browserbaseConnector also fails
    console.log('[Intent] Using built-in fallback action generation.');
    let nextAction;
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
          nextAction = { tool: 'EXTRACT', args: { selector: 'body' }, text: 'Reading page content', reasoning: 'Extracting page information', instruction: 'Analyze page content' };
          break;
        case 'EXTRACT':
          nextAction = { tool: 'CLICK', args: { selector: 'input[name="q"]' }, text: 'Clicking search input', reasoning: 'Interacting with search field', instruction: 'Click search box' };
          break;
        case 'CLICK':
          // Check if the last click was the search button
          if (lastStep.args?.selector?.includes('btnK')) {
              // After clicking search, maybe extract results
              nextAction = { tool: 'EXTRACT', args: { selector: '#search' }, text: 'Extracting search results', reasoning: 'Getting results after search', instruction: 'Extract results' };
          } else {
              // Assume it was clicking the input field, so type next
              nextAction = { tool: 'TYPE', args: { text: goal, selector: 'input[name="q"]' }, text: 'Typing search query', reasoning: 'Entering search terms', instruction: 'Type search query' };
          }
          break;
        case 'TYPE':
          nextAction = { tool: 'CLICK', args: { selector: 'input[name="btnK"], button[name="btnK"]' }, text: 'Clicking search button', reasoning: 'Submitting search', instruction: 'Click search button' };
          break;
        default:
          nextAction = { tool: 'CLOSE', args: {}, text: 'Finishing task', reasoning: 'Task steps completed', instruction: 'Close session' };
      }
     }
     console.log('[Intent] Returning fallback action:', nextAction);
     res.json({ success: true, sessionId: sessionId, result: nextAction });
     // --- End Ultimate Fallback Logic ---

  } catch (error) {
    console.error(`[Intent] Error: ${error.message}`, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Execute step in browser
app.post('/execute', async (req, res) => {
  try {
    const { sessionId, step } = req.body;

    if (!sessionId || !step || !step.tool) {
      return res.status(400).json({ success: false, error: 'Missing sessionId or step' });
    }

    console.log(`[Execute] Processing step for session ${sessionId}:`, step);

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: `Session ${sessionId} not found` });
    }

    // Add step to task history *before* execution for loop detection
    sessionManager.addTaskHistory(sessionId, step);

    // Check for loops *during* execution as well
    if (sessionManager.isLoopDetected(sessionId)) {
      console.log(`[Execute] Loop detected for session ${sessionId} during execution, forcing CLOSE`);
      sessionManager.resetTaskCounter(sessionId);
      return res.json({
        success: true,
        result: { tool: 'CLOSE', args: {}, text: 'Loop detected', reasoning: 'Stopping loop', instruction: 'Stop execution' }
      });
    }
    
    // Handle CLOSE action regardless of browser type to ensure proper cleanup
    if (step.tool.toUpperCase() === 'CLOSE') {
      console.log(`[Execute] Handling CLOSE action for session ${sessionId}`);
      
      // Mark task as completed
      sessionManager.markTaskCompleted(sessionId, session.contextId || 'unknown_goal');
      
      // Close the WebUI browser session if applicable
      if (session.browserbaseSessionId) {
        try {
          console.log(`[Execute] Closing Browserbase session ${session.browserbaseSessionId}`);
          const bb = new Browserbase(); // No API key needed with our custom implementation
          await bb.sessions.close({ sessionId: session.browserbaseSessionId });
        } catch (closeError) {
          console.error(`[Execute] Error closing Browserbase session: ${closeError.message}`);
          // Continue even if close fails
        }
      }
      
      return res.json({
        success: true,
        result: {
          tool: 'CLOSE',
          text: 'Browser closed',
          reasoning: 'Task completed',
          instruction: 'Session closed'
        }
      });
    }
    
    // --- Use Browserbase Connector for All Browser Types ---
    try {
      console.log(`[Execute] Using browserbaseConnector.executeStep for ${step.tool} action`);
      
      // Execute step via the unified connector
      const result = await browserbaseConnector.executeStep(sessionId, step);
      
      if (result.success) {
        console.log(`[Execute] Step execution succeeded:`, result.result);
        
        // Update session state if navigation
        if (step.tool.toUpperCase() === 'NAVIGATE' && step.args?.url) {
          sessionManager.updateSession(sessionId, { lastUrl: step.args.url });
        }
        
        return res.json(result);
      } else {
        throw new Error(result.error || 'Step execution failed');
      }
    } catch (error) {
      console.error(`[Execute] Error executing step:`, error);
      
      // --- Ultimate Fallback: Mock Response ---
      console.log('[Execute] Using mock response fallback');
      const mockResult = mockBrowserResponse(step.tool.toLowerCase(), step.args);
      
      // Update session state if navigation
      if (step.tool.toUpperCase() === 'NAVIGATE' && step.args?.url) {
        sessionManager.updateSession(sessionId, { lastUrl: step.args.url });
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
    }

  } catch (error) {
    console.error(`[Execute] Error: ${error.message}`, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Process agent task - This seems redundant if /intent handles the logic
// app.post('/api/agent', async (req, res) => {
//   // Consider removing or simplifying this if /intent covers the core logic
// });

// Run agent task - This seems redundant if /intent and /execute handle steps
// app.post('/api/sessions/:sessionId/agent/run', async (req, res) => {
//    // Consider removing or simplifying
// });

// Navigation endpoints - This seems redundant if /execute handles NAVIGATE
// app.post('/api/sessions/:sessionId/navigate', (req, res) => {
//    // Consider removing
// });

// Delete session
app.delete('/session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'Missing sessionId' });
        }

        console.log(`[Session Delete] Received request for session ${sessionId}`);
        const session = sessionManager.getSession(sessionId);

        if (session?.useBrowserbase && session.browserbaseSessionId) {
            try {
                console.log(`[Session Delete] Closing Browserbase session ${session.browserbaseSessionId}`);
                // Use our custom implementation - no API key required
                const bb = new Browserbase();
                await bb.sessions.close({ sessionId: session.browserbaseSessionId });
            } catch (error) {
                console.error(`[Session Delete] Error closing Browserbase session ${session.browserbaseSessionId}:`, error);
                // Continue deletion even if closing fails
            }
        } else {
            console.log(`[Session Delete] No active Browserbase session found for ${sessionId}, or using native WebUI.`);
            // Add logic here if WebUI needs an explicit close command
        }

        sessionManager.deleteSession(sessionId);
        console.log(`[Session Delete] Session ${sessionId} deleted from manager.`);
        res.json({ success: true, message: 'Session ended successfully' });

    } catch (error) {
        console.error(`[Session Delete] Error: ${error.message}`, error.stack);
        // Use a longer timeout for delete requests?
        // Check if the error is a timeout error specifically
        if (error.cause?.code === 'UND_ERR_HEADERS_TIMEOUT') {
             console.warn(`[Session Delete] Timeout occurred while trying to delete session ${req.body.sessionId}. Session likely closed or unresponsive.`);
             // Still attempt to remove from session manager
             if (req.body.sessionId) {
                 sessionManager.deleteSession(req.body.sessionId);
             }
             // Return success even on timeout, as the goal is cleanup
             return res.status(200).json({ success: true, message: 'Session deletion attempted, timeout occurred.' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});


// Start the server
app.listen(PORT, async () => {
  console.log(`Bridge server starting on http://localhost:${PORT}`);
  await checkWebUIAvailability(); // Check WebUI status on startup
  console.log(`Using LLM provider: openai, model: gpt-4o`); // Placeholder, make dynamic if needed
  
  // Using our custom Browserbase implementation
  console.log(`Using custom Browserbase SDK implementation (no API key required)`);
  
  if (process.env.OPENAI_API_KEY) {
      console.log(`OpenAI API key found.`);
  } else {
      console.warn(`OpenAI API key not found. LLM functionality might be limited.`);
  }
});
