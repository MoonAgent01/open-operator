/**
 * Client for communicating with the Web-UI backend
 */

import { WebUIConfig } from './config';
import { BrowserStep } from './webui-adapter';

/**
 * Make a request to the Web-UI API
 */
async function makeRequest(endpoint: string, method: string, body?: any) {
  try {
    const response = await fetch(`${WebUIConfig.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error making request to ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Get the current LLM configuration from the Web-UI backend
 */
export async function getLLMConfig() {
  try {
    // Fetch the LLM configuration from the bridge server
    const response = await makeRequest('/api/llm-config', 'GET');
    
    if (response.success) {
      return response.config;
    } else {
      console.error('Failed to get LLM configuration:', response.error);
      // Fall back to default configuration
      return WebUIConfig.llmSettings;
    }
  } catch (error) {
    console.error('Error getting LLM configuration:', error);
    // Fall back to default configuration
    return WebUIConfig.llmSettings;
  }
}

/**
 * Start a browser agent session
 */
export async function startBrowserAgent(task: string) {
  try {
    // Get the current LLM configuration from the Web-UI backend
    const llmConfig = await getLLMConfig();
    
    // Create the payload with all necessary settings
    const payload = {
      agent_type: 'custom',
      // Use the LLM configuration from the Web-UI backend
      llm_provider: llmConfig.provider,
      llm_model_name: llmConfig.modelName,
      llm_temperature: llmConfig.temperature,
      // Browser settings - CRITICAL: ensure headless is false to see the browser
      use_own_browser: WebUIConfig.browserSettings.useOwnBrowser,
      keep_browser_open: WebUIConfig.browserSettings.keepBrowserOpen,
      headless: false, // IMPORTANT: This must be false to see the browser
      window_w: WebUIConfig.browserSettings.windowWidth,
      window_h: WebUIConfig.browserSettings.windowHeight,
      // Task and agent settings
      task: task,
      max_steps: WebUIConfig.agentSettings.maxSteps,
      use_vision: WebUIConfig.agentSettings.useVision,
      max_actions_per_step: WebUIConfig.agentSettings.maxActionsPerStep,
      // Additional settings to ensure browser is visible
      open_browser: true, // IMPORTANT: This tells Web-UI to open the browser
      show_browser: true, // IMPORTANT: This ensures the browser is visible
    };
    
    console.log('Starting browser agent with settings:', JSON.stringify(payload, null, 2));
    
    // Make the actual request to the bridge server
    const response = await makeRequest('/api/session', 'POST', {
      task: task,
      settings: payload
    });
    
    if (!response.success) {
      throw new Error(`Failed to start browser agent: ${response.error || 'Unknown error'}`);
    }
    
    return {
      success: true,
      sessionId: response.sessionId || `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      browserUrl: response.sessionUrl || `${WebUIConfig.baseUrl}/vnc.html?autoconnect=true&password=vncpassword`,
    };
  } catch (error) {
    console.error('Error starting browser agent:', error);
    throw error;
  }
}

/**
 * Stop a browser agent session
 */
export async function stopBrowserAgent(sessionId: string) {
  try {
    // In a real implementation, this would call the Web-UI API to stop a browser agent
    // For now, we'll simulate a successful response
    
    // The payload would include the session ID
    const payload = {
      sessionId,
    };
    
    // In a real implementation, this would be:
    // return await makeRequest(WebUIConfig.endpoints.stopAgent, 'POST', payload);
    
    // For now, simulate a response
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error stopping browser agent:', error);
    throw error;
  }
}

/**
 * Get a screenshot of the browser
 */
export async function getBrowserScreenshot(sessionId: string) {
  try {
    // In a real implementation, this would call the Web-UI API to get a screenshot
    // For now, we'll simulate a successful response
    
    // The payload would include the session ID
    const payload = {
      sessionId,
    };
    
    // In a real implementation, this would be:
    // return await makeRequest(WebUIConfig.endpoints.getScreenshot, 'POST', payload);
    
    // For now, simulate a response with a base64-encoded image
    return {
      success: true,
      screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    };
  } catch (error) {
    console.error('Error getting browser screenshot:', error);
    throw error;
  }
}

/**
 * Convert Web-UI agent actions to Open Operator BrowserStep format
 */
export function convertActionsToBrowserSteps(actions: any[]): BrowserStep[] {
  // In a real implementation, this would convert the Web-UI agent actions to Open Operator BrowserStep format
  // For now, we'll return a simulated set of steps
  
  return actions.map((action, index) => {
    // Map the action type to a tool
    let tool: BrowserStep['tool'] = 'ACT';
    if (action.type === 'goto') tool = 'GOTO';
    else if (action.type === 'extract') tool = 'EXTRACT';
    else if (action.type === 'observe') tool = 'OBSERVE';
    else if (action.type === 'close') tool = 'CLOSE';
    else if (action.type === 'wait') tool = 'WAIT';
    else if (action.type === 'navback') tool = 'NAVBACK';
    
    return {
      text: action.description || `Step ${index + 1}`,
      reasoning: action.reasoning || 'No reasoning provided',
      tool,
      instruction: action.instruction || '',
      stepNumber: index + 1,
    };
  });
}

/**
 * Parse the Web-UI agent result
 */
export function parseAgentResult(result: any) {
  // In a real implementation, this would parse the Web-UI agent result
  // For now, we'll return a simulated result
  
  return {
    finalResult: result.final_result || 'Task completed successfully',
    errors: result.errors || '',
    actions: result.model_actions || '',
    thoughts: result.model_thoughts || '',
  };
}
