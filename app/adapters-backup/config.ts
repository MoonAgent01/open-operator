/**
 * Configuration for the Web-UI adapter
 */

export const WebUIConfig = {
  // Base URL for the Web-UI backend API
  baseUrl: 'http://localhost:7789', // Changed to bridge server URL
  
  // Endpoints for the Web-UI API
  endpoints: {
    // Endpoint to run the browser agent
    runAgent: '/api/run_agent',
    
    // Endpoint to stop the agent
    stopAgent: '/api/stop_agent',
    
    // Endpoint to get a screenshot of the browser
    getScreenshot: '/api/screenshot',
  },
  
  // Default browser settings
  browserSettings: {
    headless: false, // IMPORTANT: Must be false to see the browser
    windowWidth: 1280,
    windowHeight: 720,
    useOwnBrowser: false,
    keepBrowserOpen: true,
    showBrowser: true, // IMPORTANT: Added to ensure browser is visible
    openBrowser: true, // IMPORTANT: Added to ensure browser is opened
  },
  
  // Default agent settings
  agentSettings: {
    maxSteps: 50,
    useVision: true,
    maxActionsPerStep: 5,
  },
  
  // Default LLM settings
  llmSettings: {
    provider: 'openai',
    modelName: 'gpt-4o',
    temperature: 0.7,
  },
};
