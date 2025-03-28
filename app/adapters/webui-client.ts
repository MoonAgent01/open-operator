/**
 * Client for communicating with the Web-UI backend
 */

import { WebUIConfig } from './config';
import { BrowserStep } from './webui-adapter';

interface SessionSettings {
  headless?: boolean;
  timeout?: number;
  viewport?: {
    width: number;
    height: number;
  };
  stealth?: {
    enabled?: boolean;
    solveCaptchas?: boolean;
    fingerprint?: {
      browsers?: string[];
      devices?: string[];
      locales?: string[];
      operatingSystems?: string[];
    };
  };
}

interface CreateSessionOptions {
  timezone?: string;
  contextId?: string;
  settings?: SessionSettings;
}

interface ApiResponse {
  success: boolean;
  error?: string;
}

interface SessionResponse extends ApiResponse {
  sessionId: string;
  sessionUrl: string;    // VNC URL for browser viewing
  connectUrl: string;    // CDP URL for browser control
  wsUrl: string;         // WebSocket URL for direct communication
  contextId?: string;
  debugUrl?: string;     // VNC URL for debugging
}

interface LLMConfigResponse extends ApiResponse {
  config?: {
    provider: string;
    modelName: string;
    temperature: number;
  };
}

interface AgentResponse extends ApiResponse {
  sessionId: string;
  browserUrl: string;
}

interface ActionResponse extends ApiResponse {
  result?: any;
}

interface ScreenshotResponse extends ApiResponse {
  screenshot?: string;
}

/**
 * Make a request to the Web-UI API
 */
async function makeRequest<T>(endpoint: string, method: string, body?: any): Promise<T> {
  try {
    // Get Web UI base URL
    const webUiPort = await WebUIConfig.ports.webUi;
    if (!webUiPort) {
      throw new Error('Failed to get Web UI port configuration');
    }

    const baseUrl = `http://localhost:${webUiPort}`;
    console.log(`Making ${method} request to ${baseUrl}${endpoint}`, body);

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Web UI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`Response from ${endpoint}:`, data);
    return data;
  } catch (error) {
    console.error(`Error making request to ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Create a new session
 */
export async function createSession(options: CreateSessionOptions): Promise<SessionResponse> {
  try {
    const response = await makeRequest<SessionResponse>('/session', 'POST', {
      type: 'browser',
      options: {
        ...options,
        useOwnBrowser: false,
        keepBrowserOpen: true,
        headless: false,
        disableSecurity: true,
        windowSize: {
          width: options.settings?.viewport?.width || 1366,
          height: options.settings?.viewport?.height || 768
        }
      }
    });
    return response;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

/**
 * Get the current LLM configuration from the Web-UI backend
 */
export async function getLLMConfig(): Promise<typeof WebUIConfig.llmSettings> {
  try {
    const response = await makeRequest<LLMConfigResponse>('/llm-config', 'GET');
    
    if (response.success && response.config) {
      return response.config;
    }

    console.warn('Failed to get LLM configuration:', response.error);
    return WebUIConfig.llmSettings;
  } catch (error) {
    console.error('Error getting LLM configuration:', error);
    return WebUIConfig.llmSettings;
  }
}

/**
 * Start a browser agent session
 */
export async function startBrowserAgent(task: string): Promise<AgentResponse> {
  try {
    // Get the current LLM configuration
    const llmConfig = await getLLMConfig();
    
    // Create session payload
    const payload = {
      type: 'browser',
      task,
      options: {
        agent_type: 'custom',
        // Use the LLM configuration from the Web-UI backend
        llm_provider: llmConfig.provider,
        llm_model_name: llmConfig.modelName,
        llm_temperature: llmConfig.temperature,
        // Browser settings
        useOwnBrowser: false,
        keepBrowserOpen: true,
        headless: false,
        disableSecurity: true,
        windowSize: {
          width: WebUIConfig.browserSettings.windowWidth,
          height: WebUIConfig.browserSettings.windowHeight
        },
        // Agent settings
        maxSteps: WebUIConfig.agentSettings.maxSteps,
        useVision: WebUIConfig.agentSettings.useVision,
        maxActionsPerStep: WebUIConfig.agentSettings.maxActionsPerStep
      }
    };
    
    // Make the session creation request
    const response = await makeRequest<SessionResponse>('/session', 'POST', payload);
    
    return {
      success: true,
      sessionId: response.sessionId,
      browserUrl: response.sessionUrl
    };
  } catch (error) {
    console.error('Error starting browser agent:', error);
    throw error;
  }
}

/**
 * Stop a browser agent session
 */
export async function stopBrowserAgent(sessionId: string): Promise<ApiResponse> {
  try {
    return await makeRequest<ApiResponse>('/session', 'DELETE', { sessionId });
  } catch (error) {
    console.error('Error stopping browser agent:', error);
    throw error;
  }
}

/**
 * Execute an agent action
 */
export async function executeAgentAction(sessionId: string, action: string, instruction: string): Promise<ActionResponse> {
  try {
    return await makeRequest<ActionResponse>('/execute', 'POST', {
      sessionId,
      action,
      instruction,
    });
  } catch (error) {
    console.error('Error executing agent action:', error);
    throw error;
  }
}

/**
 * Get a screenshot of the browser
 */
export async function getBrowserScreenshot(sessionId: string): Promise<ScreenshotResponse> {
  try {
    // Use the screenshot endpoint if available
    if (WebUIConfig.endpoints.getScreenshot) {
      return await makeRequest<ScreenshotResponse>(WebUIConfig.endpoints.getScreenshot, 'POST', {
        sessionId,
      });
    }
    
    // Fallback to default screenshot
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
  return {
    finalResult: result.final_result || 'Task completed successfully',
    errors: result.errors || '',
    actions: result.model_actions || '',
    thoughts: result.model_thoughts || '',
  };
}
