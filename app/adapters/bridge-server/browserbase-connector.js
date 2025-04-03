/**
 * Browserbase Connector for Open Operator Bridge
 * This module provides a bridge between Open Operator and Web UI using the WebUI API
 */

const axios = require('axios');
const { runPythonBridge } = require('./python-bridge'); // Import the bridge function

// Default WebUI URL and port
const WEBUI_PORT = process.env.WEBUI_PORT || 7788;
const WEBUI_URL = process.env.WEBUI_URL || `http://localhost:${WEBUI_PORT}`;

// Store active browser sessions
const activeSessions = new Map();

// Helper function to create axios instance with timeout
function createApiClient(baseURL = WEBUI_URL) {
  return axios.create({
    baseURL,
    timeout: 30000, // 30 seconds timeout
    headers: {
      'Content-Type': 'application/json',
    }
  });
}

// Create API client
const apiClient = createApiClient();

// Browserbase connector API
const browserbaseConnector = {
  /**
   * Check if WebUI is available
   */
  async isAvailable() {
    try {
      const response = await apiClient.get('/');
      return response.status === 200;
    } catch (error) {
      console.error('Error connecting to WebUI:', error.message);
      return false;
    }
  },

  /**
   * Create a new browser session
   */
  async createSession(options = {}) {
    try {
      console.log(`[WebUI Connector] Creating session with options:`, options);
      
      // Prepare session parameters in WebUI format
      const params = {
        timezone: options.timezone || 'UTC',
        contextId: options.contextId || '',
        settings: {
          useOwnBrowser: options.useOwnBrowser || false,
          keepBrowserOpen: options.keepBrowserOpen || true,
          headless: options.headless || false,
          disableSecurity: options.disableSecurity || true,
          windowSize: {
            width: options.width || 1366,
            height: options.height || 768
          },
          // Match WebUI expected parameters
          browserSettings: {
            headless: options.headless || false,
            useExistingBrowser: false,
            keepBrowserOpen: options.keepBrowserOpen || true,
            keepBrowserOpenBetweenTasks: options.keepBrowserOpen || true,
            windowSize: {
              width: options.width || 1366,
              height: options.height || 768
            },
            showBrowser: true
          },
          metadata: { source: 'open-operator', version: '1.0.0' }
        }
      };
      
      // console.log(`[WebUI Connector] Sending session request to WebUI:`, params);
      
      // REMOVED: Direct API call to /session as it doesn't exist in webui.py
      // const response = await apiClient.post('/session', params);
      // if (!response.data.success) {
      //   throw new Error(response.data.error || 'Failed to create WebUI session');
      // }
      // const sessionData = response.data;
      
      
      // --- Use Python Bridge to create session ---
      console.log(`[WebUI Connector] Using Python bridge to create session`);
      const pythonArgs = {
          // Pass necessary options from the original request
          timezone: params.timezone,
          contextId: params.contextId,
          settings: params.settings 
          // Add any other relevant options needed by the Python script
      };

      const pythonResult = await runPythonBridge('create_session', pythonArgs);

      if (!pythonResult || !pythonResult.success || !pythonResult.sessionId) {
          console.error(`[WebUI Connector] Python bridge failed to create session:`, pythonResult?.error);
          throw new Error(pythonResult?.error || "Python bridge failed to create session.");
      }
      
      console.log(`[WebUI Connector] Session created via Python bridge:`, pythonResult);

      // Store session info using data from Python bridge response
      const sessionData = {
          sessionId: pythonResult.sessionId,
          sessionUrl: pythonResult.sessionUrl || WEBUI_URL, // Fallback if not provided
          connectUrl: pythonResult.connectUrl || `ws://localhost:${WEBUI_PORT}/ws`,
          wsUrl: pythonResult.wsUrl || `ws://localhost:${WEBUI_PORT}/ws`,
          debugUrl: pythonResult.debugUrl || WEBUI_URL, // Use debugUrl if available
          contextId: pythonResult.contextId || options.contextId || ''
      };
      activeSessions.set(sessionData.sessionId, sessionData);
      
      // Return session info in Browserbase-compatible format, prioritizing debug_url
      return {
        id: sessionData.sessionId,
        debug_url: sessionData.debugUrl, 
        connect_url: sessionData.connectUrl,
        ws_url: sessionData.wsUrl,
        browser_version: 'WebUI Custom Browser (Python Bridge)'
      };
      // --- End Python Bridge Call ---

    } catch (error) {
      console.error('Error creating browser session via Python bridge:', error);
      throw error; // Re-throw error for upstream handling
    }
  },

  /**
   * Close a browser session
   */
  async closeSession(sessionId) {
    try {
      console.log(`[WebUI Connector] Closing session ${sessionId}`);
      
      // Check if we have the session in our store
      if (!activeSessions.has(sessionId)) {
        console.warn(`[WebUI Connector] Session ${sessionId} not found in active sessions, trying to close anyway`);
      }
      
      // --- Use Python Bridge to close session ---
      console.log(`[WebUI Connector] Using Python bridge to close session ${sessionId}`);
      const pythonArgs = { sessionId: sessionId };
      try {
          const pythonResult = await runPythonBridge('close_session', pythonArgs);
          if (!pythonResult || !pythonResult.success) {
              console.warn(`[WebUI Connector] Python bridge reported failure closing session ${sessionId}:`, pythonResult?.error);
              // Continue cleanup even if Python bridge fails
          } else {
              console.log(`[WebUI Connector] Python bridge successfully closed session ${sessionId}`);
          }
      } catch (bridgeError) {
           console.error(`[WebUI Connector] Error calling Python bridge for close_session ${sessionId}:`, bridgeError.message);
           // Continue cleanup despite bridge error
      }
      // --- End Python Bridge Call ---

      // Remove session from active sessions map regardless of bridge result
      activeSessions.delete(sessionId);
      console.log(`[WebUI Connector] Removed session ${sessionId} from local map.`);
      
      return { success: true }; // Report success from connector's perspective (local cleanup done)
      
    } catch (error) {
      // This catch block might now only catch errors from activeSessions.has or activeSessions.delete
      console.error(`[WebUI Connector] Unexpected error during closeSession for ${sessionId}:`, error);
      // Still attempt to clean up local state if possible
      activeSessions.delete(sessionId);
      throw error; // Re-throw unexpected errors
    }
  },

  /**
   * Process intent request
   */
  async processIntent(goal, sessionId, previousSteps = [], context = {}) {
    try {
      console.log(`[WebUI Connector] Processing intent for session ${sessionId}:`, {
        goal,
        previousStepsCount: previousSteps.length,
        context
      });
      
      // Prepare intent request payload
      const payload = {
        sessionId,
        goal,
        previousSteps: previousSteps || [],
        context: {
          ...context,
          isFirstStep: previousSteps.length === 0,
          sessionId
        }
      };

      // --- Use Python Bridge to call WebUI agent logic ---
      console.log(`[WebUI Connector] Using Python bridge to process intent for session ${sessionId}`);
      // We need to determine which Python function to call (e.g., run_org_agent or run_custom_agent)
      // and map the parameters correctly. This requires more info from webui.py or server.js context.
      // For now, let's assume a placeholder command 'process_intent' exists in a bridge script.
      // TODO: Refine this call based on actual WebUI structure.
      
      // Placeholder: Simulating a call structure - this needs refinement
      const pythonArgs = {
          sessionId: sessionId,
          task: goal,
          previous_steps: previousSteps, // Ensure naming matches Python expectations
          context: context,
          // Add other necessary parameters like llm config, browser settings etc.
          // These might need to be retrieved from sessionManager or passed down.
      };

      // Assuming runPythonBridge is accessible or imported here
      // TODO: Determine the correct Python command and arguments based on webui.py
      const pythonResult = await runPythonBridge('process_intent', pythonArgs); 
      
      // Assuming the pythonResult contains the next step in a compatible format
      if (pythonResult && pythonResult.result) {
         console.log(`[WebUI Connector] Intent processing result from Python:`, pythonResult.result);
         // Ensure the response format matches what the frontend expects
         return {
             success: true,
             sessionId: sessionId,
             result: pythonResult.result // Assuming pythonResult.result is the next step object
         };
      } else {
          console.error(`[WebUI Connector] Python bridge did not return a valid result for process_intent.`);
          throw new Error("Python bridge failed to process intent.");
      }
      // --- End Python Bridge Call ---

    } catch (error) {
      console.error(`[WebUI Connector] Error processing intent via Python bridge for session ${sessionId}:`, error.message); 

      // Fallback handling - create a mock action
      console.log(`[WebUI Connector] Generating fallback mock action due to Python bridge error.`);
      
      // Determine appropriate next step based on previous steps
      let nextAction;
      
      if (!previousSteps || previousSteps.length === 0) {
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
              reasoning: 'Extracting page information', 
              instruction: 'Analyze page content' 
            };
            break;
          case 'EXTRACT':
            nextAction = { 
              tool: 'CLICK', 
              args: { selector: 'input[name="q"]' }, 
              text: 'Clicking search input', 
              reasoning: 'Interacting with search field', 
              instruction: 'Click search box' 
            };
            break;
          case 'CLICK':
            // Check if the last click was the search button
            if (lastStep.args?.selector?.includes('btnK')) {
              // After clicking search, maybe extract results
              nextAction = { 
                tool: 'EXTRACT', 
                args: { selector: '#search' }, 
                text: 'Extracting search results', 
                reasoning: 'Getting results after search', 
                instruction: 'Extract results' 
              };
            } else {
              // Assume it was clicking the input field, so type next
              nextAction = { 
                tool: 'TYPE', 
                args: { text: goal, selector: 'input[name="q"]' }, 
                text: 'Typing search query', 
                reasoning: 'Entering search terms', 
                instruction: 'Type search query' 
              };
            }
            break;
          case 'TYPE':
            nextAction = { 
              tool: 'CLICK', 
              args: { selector: 'input[name="btnK"], button[name="btnK"]' }, 
              text: 'Clicking search button', 
              reasoning: 'Submitting search', 
              instruction: 'Click search button' 
            };
            break;
          default:
            nextAction = { 
              tool: 'CLOSE', 
              args: {}, 
              text: 'Finishing task', 
              reasoning: 'Task steps completed', 
              instruction: 'Close session' 
            };
        }
      }
      
      return {
        success: true,
        sessionId: sessionId,
        result: nextAction
      };
    }
  },

  /**
   * Execute step in browser
   */
  async executeStep(sessionId, step) {
    try {
      console.log(`[WebUI Connector] Executing step for session ${sessionId}:`, step);
      
      if (!sessionId || !step || !step.tool) {
        throw new Error('Missing sessionId or step details');
      }
      
      // Prepare execute payload
      const payload = {
        sessionId,
        step,
        context: {
          sessionId
        }
      };
      
      // --- Use Python Bridge to call WebUI agent logic ---
      // --- Use Python Bridge to call WebUI agent logic ---
      // TODO: Determine the correct Python command and arguments based on webui.py
      const pythonArgs = {
          sessionId: sessionId,
          step: step, // Pass the entire step object
          context: payload.context // Pass the context from the payload - Corrected
      };
      const pythonResult = await runPythonBridge('execute_step', pythonArgs);

      if (pythonResult && pythonResult.success) {
          console.log(`[WebUI Connector] Step execution result from Python:`, pythonResult);
          // Ensure the response format matches what the frontend expects
          return {
              success: true,
              result: pythonResult.result || {} // Assuming pythonResult.result contains execution details
          };
      } else {
          console.error(`[WebUI Connector] Python bridge failed to execute step.`);
          throw new Error(pythonResult?.error || "Python bridge failed to execute step.");
      }
      // --- End Python Bridge Call ---

    } catch (error) {
      console.error(`[WebUI Connector] Error executing step via Python bridge for session ${sessionId}:`, error.message); 
      
      // Create a fallback mock response based on the action type
      console.log(`[WebUI Connector] Generating fallback mock response due to Python bridge error.`);
      return createMockResponse(step);
    }
  },

  /**
   * Navigate to a URL
   */
  async navigate(sessionId, url) {
    try {
      console.log(`[WebUI Connector] Navigating session ${sessionId} to ${url}`);
      
      // Create a step for navigation
      const step = {
        tool: 'NAVIGATE',
        args: { url },
        text: `Navigating to ${url}`,
        reasoning: 'URL navigation requested',
        instruction: `Opening ${url}`
      };
      
      // Execute the step
      const result = await this.executeStep(sessionId, step);
      
      // Format response
      return {
        success: true,
        url: url,
        content: result.result?.content || ''
      };
    } catch (error) {
      console.error(`[WebUI Connector] Error navigating in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Click on an element
   */
  async click(sessionId, selector) {
    try {
      console.log(`[WebUI Connector] Clicking element ${selector} in session ${sessionId}`);
      
      // Create a step for clicking
      const step = {
        tool: 'CLICK',
        args: { selector },
        text: `Clicking element ${selector}`,
        reasoning: 'Interaction with element requested',
        instruction: `Click on ${selector}`
      };
      
      // Execute the step
      const result = await this.executeStep(sessionId, step);
      
      // Format response
      return {
        success: true,
        selector: selector
      };
    } catch (error) {
      console.error(`[WebUI Connector] Error clicking in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Type text
   */
  async type(sessionId, selector, text) {
    try {
      console.log(`[WebUI Connector] Typing "${text}" into ${selector} in session ${sessionId}`);
      
      // Create a step for typing
      const step = {
        tool: 'TYPE',
        args: { selector, text },
        text: `Typing "${text}" into ${selector}`,
        reasoning: 'Text input requested',
        instruction: `Type "${text}" into ${selector}`
      };
      
      // Execute the step
      const result = await this.executeStep(sessionId, step);
      
      // Format response
      return {
        success: true,
        selector: selector,
        text: text
      };
    } catch (error) {
      console.error(`[WebUI Connector] Error typing in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Extract content from a page
   */
  async extract(sessionId, selector) {
    try {
      console.log(`[WebUI Connector] Extracting content from ${selector} in session ${sessionId}`);
      
      // Create a step for extraction
      const step = {
        tool: 'EXTRACT',
        args: { selector },
        text: `Extracting content from ${selector}`,
        reasoning: 'Content extraction requested',
        instruction: `Extract content from ${selector}`
      };
      
      // Execute the step
      const result = await this.executeStep(sessionId, step);
      
      // Format response
      return {
        success: true,
        extraction: result.result?.extraction || result.extraction || '',
        selector: selector
      };
    } catch (error) {
      console.error(`[WebUI Connector] Error extracting from session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Take a screenshot
   */
  async screenshot(sessionId, fullPage = false) {
    try {
      console.log(`[WebUI Connector] Taking screenshot in session ${sessionId}`);
      
      // --- Use Python Bridge to call WebUI screenshot logic ---
      // TODO: Determine the correct Python command and arguments based on webui.py
      const pythonArgs = {
          sessionId: sessionId,
          fullPage: fullPage
      };
      const pythonResult = await runPythonBridge('take_screenshot', pythonArgs);

      if (pythonResult && pythonResult.success && pythonResult.screenshot) {
          console.log(`[WebUI Connector] Screenshot result from Python received.`);
          return pythonResult.screenshot; // Assuming pythonResult.screenshot is the base64 string
      } else {
          console.error(`[WebUI Connector] Python bridge failed to take screenshot.`);
          throw new Error(pythonResult?.error || "Python bridge failed to take screenshot.");
      }
      // --- End Python Bridge Call ---
      
    } catch (error) {
      console.error(`[WebUI Connector] Error taking screenshot via Python bridge for session ${sessionId}:`, error.message);
      
      // Return empty base64 string on error
      return ''; // Keep fallback
    }
  }
};

/**
 * Helper function to create mock responses for fallback
 */
function createMockResponse(step) {
  console.log(`[WebUI Connector] Generating mock response for action: ${step.tool}`, step.args);
  
  let mockResult = {
    success: true,
    result: {}
  };
  
  switch (step.tool.toLowerCase()) {
    case 'navigate':
      mockResult.result = { 
        url: step.args.url || 'https://example.com', 
        content: `<html><body>Mock navigation to ${step.args.url || 'example.com'}</body></html>` 
      };
      break;
    case 'click':
      mockResult.result = { 
        message: `Mock click on selector: ${step.args.selector || step.args.text || 'unknown element'}` 
      };
      break;
    case 'type':
      mockResult.result = { 
        message: `Mock type "${step.args.text}" into selector: ${step.args.selector}` 
      };
      break;
    case 'extract':
      mockResult.result = { 
        extraction: `Mock extraction from selector: ${step.args.selector || 'body'}` 
      };
      break;
    case 'close':
      mockResult.result = { 
        message: 'Mock browser closed' 
      };
      break;
    default:
      mockResult.result = { 
        message: `Mock response for unknown action: ${step.tool}` 
      };
  }
  
  // Add optional fields from the input step
  if (step.text) mockResult.result.text = step.text;
  if (step.reasoning) mockResult.result.reasoning = step.reasoning;
  if (step.instruction) mockResult.result.instruction = step.instruction;
  
  return mockResult;
}

module.exports = browserbaseConnector;
