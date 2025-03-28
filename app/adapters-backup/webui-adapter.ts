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
  sessionUrl: string;
  contextId: string;
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
};

/**
 * Create a new browser session
 */
export async function createSession(timezone?: string, contextId?: string): Promise<SessionInfo> {
  try {
    // Generate a unique session ID
    const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create a URL for viewing the browser session
    // This would typically be a URL to a VNC viewer or similar
    const sessionUrl = `${WebUIConfig.baseUrl}/vnc.html?autoconnect=true&password=vncpassword`;
    
    // Store the session ID in our state
    currentAgentState.sessionId = sessionId;
    currentAgentState.isRunning = false;
    currentAgentState.steps = [];
    currentAgentState.currentStep = 0;
    currentAgentState.finalResult = null;
    currentAgentState.error = null;
    
    return {
      sessionId,
      sessionUrl,
      contextId: contextId || `context-${Date.now()}`,
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
    // Call the WebUIClient to stop the browser agent
    await WebUIClient.stopBrowserAgent(sessionId);
    
    // Update our state
    if (currentAgentState.sessionId === sessionId) {
      currentAgentState.isRunning = false;
    }
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
    
    console.log('Browser agent started successfully with session ID:', response.sessionId);
    console.log('Browser URL:', response.browserUrl);
    
    return {
      sessionId: response.sessionId,
      browserUrl: response.browserUrl,
    };
  } catch (error) {
    console.error('Error starting browser agent:', error);
    throw error;
  }
}

/**
 * Start the agent with a goal
 */
export async function startAgent(goal: string, sessionId: string): Promise<BrowserStep> {
  try {
    // Start the browser agent if it's not already running
    if (!currentAgentState.isRunning) {
      await startBrowserAgent(goal);
    }
    
    // Store the goal in our state
    currentAgentState.task = goal;
    currentAgentState.isRunning = true;
    
    // Create the first step (typically navigating to a search engine)
    const firstStep: BrowserStep = {
      text: `Navigating to Google to search for information about "${goal}"`,
      reasoning: "Starting with a search engine is the best way to find relevant information for this task.",
      tool: "GOTO",
      instruction: "https://www.google.com",
      stepNumber: 1,
    };
    
    // Add the step to our state
    currentAgentState.steps = [firstStep];
    currentAgentState.currentStep = 1;
    
    return firstStep;
  } catch (error) {
    console.error('Error starting agent:', error);
    throw new Error('Failed to start agent');
  }
}

/**
 * Get the next step from the agent
 */
export async function getNextStep(goal: string, sessionId: string, previousSteps: BrowserStep[]): Promise<BrowserStep> {
  try {
    // In a real implementation, this would make an API call to the Web-UI backend
    // For now, we'll simulate a successful response
    
    // Increment the step counter
    currentAgentState.currentStep += 1;
    
    // Simulate different steps based on the current step number
    let nextStep: BrowserStep;
    
    if (currentAgentState.currentStep === 2) {
      // Second step: Type the search query
      nextStep = {
        text: `Typing search query for "${goal}"`,
        reasoning: "Need to enter the search query to find relevant information.",
        tool: "ACT",
        instruction: `type into input[name="q"] ${goal}`,
        stepNumber: currentAgentState.currentStep,
      };
    } else if (currentAgentState.currentStep === 3) {
      // Third step: Click search button
      nextStep = {
        text: "Clicking search button",
        reasoning: "Need to submit the search query to see results.",
        tool: "ACT",
        instruction: "click input[name='btnK']",
        stepNumber: currentAgentState.currentStep,
      };
    } else if (currentAgentState.currentStep === 4) {
      // Fourth step: Click on a search result
      nextStep = {
        text: "Clicking on the most relevant search result",
        reasoning: "This result appears to have the information we need.",
        tool: "ACT",
        instruction: "click .g a",
        stepNumber: currentAgentState.currentStep,
      };
    } else if (currentAgentState.currentStep === 5) {
      // Fifth step: Extract information
      nextStep = {
        text: "Extracting relevant information from the page",
        reasoning: "This page contains the information we need for the task.",
        tool: "EXTRACT",
        instruction: "Extract the main content of the page",
        stepNumber: currentAgentState.currentStep,
      };
    } else {
      // Final step: Close the browser
      nextStep = {
        text: "Task completed successfully",
        reasoning: "I've found and extracted the information needed for this task.",
        tool: "CLOSE",
        instruction: "close",
        stepNumber: currentAgentState.currentStep,
      };
      
      // Set the final result
      currentAgentState.finalResult = `I've completed the task "${goal}" by searching for information and extracting relevant content from the search results.`;
      currentAgentState.isRunning = false;
    }
    
    // Add the step to our state
    currentAgentState.steps.push(nextStep);
    
    return nextStep;
  } catch (error) {
    console.error('Error getting next step:', error);
    throw new Error('Failed to get next step');
  }
}

/**
 * Execute a step
 */
export async function executeStep(sessionId: string, step: BrowserStep): Promise<any> {
  try {
    // In a real implementation, this would make an API call to the Web-UI backend
    // For now, we'll simulate a successful response
    
    // Return different results based on the tool
    if (step.tool === "EXTRACT") {
      return "This is the extracted content from the page. It contains information relevant to the task.";
    } else if (step.tool === "OBSERVE") {
      return [
        {
          element: "div",
          content: "This is the observed content from the page.",
          attributes: { class: "content" },
        },
      ];
    } else {
      // For other tools, just return success
      return null;
    }
  } catch (error) {
    console.error('Error executing step:', error);
    throw new Error('Failed to execute step');
  }
}

/**
 * Get the current state of the agent
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
