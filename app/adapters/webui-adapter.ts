/**
 * Adapter for communicating with the Web-UI backend
 */

import * as WebUIClient from './webui-client';
import { WebUIConfig } from './config';

// Types from Open Operator that we need to match
export interface BrowserStep {
  text: string;
  reasoning: string;
  tool: "GOTO" | "ACT" | "EXTRACT" | "OBSERVE" | "CLOSE" | "WAIT" | "NAVBACK";
  instruction: string;
  stepNumber?: number;
}

// Browser agent session
export interface BrowserAgentSession {
  sessionId: string;
  browserUrl: string;
}

// Session information
export interface SessionInfo {
  sessionId: string;
  sessionUrl: string;    // VNC URL for browser viewing
  connectUrl: string;    // CDP URL for browser control
  wsUrl: string;         // WebSocket URL for direct communication
  contextId: string;
  debugUrl?: string;     // VNC URL for debugging
}

// WebUI Agent state
export interface WebUIAgentState {
  sessionId: string | null;
  task: string | null;
  steps: BrowserStep[];
  isRunning: boolean;
  currentStep: number;
  finalResult: string | null;
  error: string | null;
  urls?: {
    vnc: string;
    cdp: string;
    ws: string;
  };
}

// Global state to track the current agent
let currentAgentState: WebUIAgentState = {
  sessionId: null,
  task: null,
  steps: [],
  isRunning: false,
  currentStep: 0,
  finalResult: null,
  error: null,
  urls: undefined
};

/**
 * Create a new browser session
 */
export async function createSession(timezone?: string, contextId?: string): Promise<SessionInfo> {
  try {
    console.log('Creating browser session:', { timezone, contextId });
    
    // Create session through Web UI client
    const response = await WebUIClient.createSession({
      timezone,
      contextId,
      settings: {
        headless: false,
        timeout: 30000,
        viewport: {
          width: WebUIConfig.browserSettings.windowWidth,
          height: WebUIConfig.browserSettings.windowHeight
        },
        stealth: {
          enabled: true,
          solveCaptchas: true
        }
      }
    });

    if (!response.success) {
      throw new Error('Failed to create session through Web UI');
    }

    console.log('Session created successfully:', response);

    // Store the session info in our state
    currentAgentState.sessionId = response.sessionId;
    currentAgentState.isRunning = false;
    currentAgentState.steps = [];
    currentAgentState.currentStep = 0;
    currentAgentState.finalResult = null;
    currentAgentState.error = null;
    currentAgentState.urls = {
      vnc: response.sessionUrl,
      cdp: response.connectUrl,
      ws: response.wsUrl
    };
    
    return {
      sessionId: response.sessionId,
      sessionUrl: response.sessionUrl,
      connectUrl: response.connectUrl,
      wsUrl: response.wsUrl,
      contextId: response.contextId || contextId || `context-${Date.now()}`,
      debugUrl: response.debugUrl || response.sessionUrl
    };
  } catch (error) {
    console.error('Error creating session:', error);
    throw new Error('Failed to create browser session');
  }
}

/**
 * End a browser session
 */
export async function endSession(sessionId: string): Promise<void> {
  try {
    console.log('Ending session:', sessionId);
    
    // Call the WebUIClient to stop the browser agent
    await WebUIClient.stopBrowserAgent(sessionId);
    
    // Update our state
    if (currentAgentState.sessionId === sessionId) {
      currentAgentState.isRunning = false;
      currentAgentState.urls = undefined;
      currentAgentState.sessionId = null;
    }

    console.log('Session ended successfully:', sessionId);
  } catch (error) {
    console.error('Error ending session:', error);
    throw new Error('Failed to end browser session');
  }
}

/**
 * Start a browser agent session
 */
export async function startBrowserAgent(task: string): Promise<BrowserAgentSession> {
  try {
    console.log('Starting browser agent with task:', task);
    
    const response = await WebUIClient.startBrowserAgent(task);
    
    if (!response.success) {
      throw new Error('Failed to start browser agent');
    }
    
    console.log('Browser agent started successfully:', response);
    
    return {
      sessionId: response.sessionId,
      browserUrl: response.browserUrl
    };
  } catch (error) {
    console.error('Error starting browser agent:', error);
    throw error;
  }
}

/**
 * Execute a step
 */
export async function executeStep(sessionId: string, step: BrowserStep): Promise<any> {
  try {
    console.log('Executing step:', { sessionId, step });
    
    if (!currentAgentState.sessionId || currentAgentState.sessionId !== sessionId) {
      throw new Error('No active session found for step execution');
    }

    const result = await WebUIClient.executeAgentAction(
      sessionId,
      step.tool.toLowerCase(),
      step.instruction
    );

    if (!result.success) {
      throw new Error('Step execution failed');
    }

    console.log('Step executed successfully:', result);
    return result.result;
  } catch (error) {
    console.error('Error executing step:', error);
    throw new Error('Failed to execute step');
  }
}

/**
 * Get the current agent state
 */
export function getAgentState(): WebUIAgentState {
  return { ...currentAgentState };
}

/**
 * Reset the agent state
 */
export function resetAgentState(): void {
  currentAgentState = {
    sessionId: null,
    task: null,
    steps: [],
    isRunning: false,
    currentStep: 0,
    finalResult: null,
    error: null,
  };
}
