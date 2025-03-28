/**
 * Web-UI Bridge Server
 * 
 * This script creates a simple Express server that acts as a bridge between
 * the Open Operator frontend and the Web-UI backend.
 * 
 * To use this bridge:
 * 1. Make sure the Web-UI backend is running (python webui.py)
 * 2. Run this script: node webui-bridge.js
 * 3. Update the WebUIConfig.baseUrl in config.ts to point to this bridge server
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

// Create Express app
const app = express();
const port = 7789; // Different from the Web-UI port (7788)

// Enable CORS
app.use(cors());
app.use(express.json());

// Store active sessions
const activeSessions = new Map();

// Create a simple in-memory store for agent state
const agentStates = new Map();

// Path to the Web-UI Python script
const webUiPath = path.resolve(__dirname, '../../../web-ui/webui.py');

// Check if Web-UI exists
if (!fs.existsSync(webUiPath)) {
  console.error(`Error: Web-UI not found at ${webUiPath}`);
  console.error('Please make sure the Web-UI is installed in the correct location.');
  process.exit(1);
}

// Web-UI API endpoint
const webUiApiEndpoint = 'http://localhost:7788/api';

// Axios for making HTTP requests
const axios = require('axios');

// Function to check if Web-UI is running
async function checkWebUiRunning() {
  try {
    const response = await axios.get('http://localhost:7788/api/health', { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('Error checking if Web-UI is running:', error.message);
    return false;
  }
}

// Check if Web-UI is running
checkWebUiRunning()
  .then((isRunning) => {
    if (!isRunning) {
      console.warn('Warning: Web-UI does not appear to be running on port 7788.');
      console.warn('Make sure Web-UI is running before using the bridge server.');
    } else {
      console.log('Web-UI is running on port 7788.');
    }
  })
  .catch((error) => {
    console.error('Error checking Web-UI status:', error);
  });

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connections
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Send updates to the client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe' && data.sessionId) {
        // Subscribe to updates for a specific session
        ws.sessionId = data.sessionId;
        console.log(`Client subscribed to session ${data.sessionId}`);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast updates to subscribed clients
function broadcastUpdate(sessionId, update) {
  wss.clients.forEach((client) => {
    if (client.sessionId === sessionId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(update));
    }
  });
}

// API endpoints

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Web-UI Bridge is running' });
});

// Function to get LLM configuration from Web-UI backend
async function getWebUILLMConfig() {
  try {
    // In a real implementation, this would make an HTTP request to the Web-UI backend
    // to get the current LLM configuration
    
    // For example:
    // const response = await fetch('http://localhost:7788/api/llm-config');
    // const data = await response.json();
    // return data.config;
    
    // For now, we'll try to read the configuration from a file
    // This is a simple approach that assumes the Web-UI backend writes its configuration to a file
    // that we can read. In a real implementation, you would use the Web-UI API.
    
    const webUiConfigPath = path.resolve(__dirname, '../../../web-ui/.env');
    
    if (fs.existsSync(webUiConfigPath)) {
      // Read the .env file
      const envContent = fs.readFileSync(webUiConfigPath, 'utf8');
      
      // Parse the .env file to extract LLM settings
      const llmProvider = envContent.match(/LLM_PROVIDER=([^\n]+)/)?.[1] || 'openai';
      const llmModelName = envContent.match(/LLM_MODEL_NAME=([^\n]+)/)?.[1] || 'gpt-4o';
      const llmTemperature = parseFloat(envContent.match(/LLM_TEMPERATURE=([^\n]+)/)?.[1] || '0.7');
      
      return {
        provider: llmProvider,
        modelName: llmModelName,
        temperature: llmTemperature,
      };
    }
    
    // If we can't read the configuration, return default values
    return {
      provider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.7,
    };
  } catch (error) {
    console.error('Error getting LLM configuration from Web-UI backend:', error);
    
    // Return default values if there's an error
    return {
      provider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.7,
    };
  }
}

// Get LLM configuration from Web-UI backend
app.get('/api/llm-config', async (req, res) => {
  try {
    // Get the LLM configuration from the Web-UI backend
    const config = await getWebUILLMConfig();
    
    // Return the configuration
    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error getting LLM configuration:', error);
    res.status(500).json({ success: false, error: 'Failed to get LLM configuration' });
  }
});

// Create a new session
app.post('/api/session', async (req, res) => {
  try {
    const { task, settings, timezone, contextId } = req.body;
    
    console.log('Creating new session with task:', task);
    console.log('Browser settings:', settings ? JSON.stringify(settings, null, 2) : 'No settings provided');
    
    // Generate a unique session ID
    const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create a new agent state
    agentStates.set(sessionId, {
      sessionId,
      task: task || null,
      settings: settings || {},
      steps: [],
      isRunning: false,
      currentStep: 0,
      finalResult: null,
      error: null,
    });
    
    // If task is provided, start the browser agent
    if (task && settings) {
      try {
        console.log('Starting browser agent with task:', task);
        console.log('Using settings:', JSON.stringify(settings, null, 2));
        
        // Prepare the payload for the Web-UI API
        const payload = {
          task: task,
          agent_type: 'custom',
          headless: false,  // Force headless to false to see the browser
          open_browser: true,  // Force open browser to true
          show_browser: true,  // Force show browser to true
        };
        
        // Add other settings from the request
        if (settings) {
          if (settings.llm_provider) payload.llm_provider = settings.llm_provider;
          if (settings.llm_model_name) payload.llm_model_name = settings.llm_model_name;
          if (settings.llm_temperature) payload.llm_temperature = settings.llm_temperature;
          if (settings.max_steps) payload.max_steps = settings.max_steps;
          if (settings.use_vision) payload.use_vision = settings.use_vision;
          if (settings.window_w) payload.window_w = settings.window_w;
          if (settings.window_h) payload.window_h = settings.window_h;
        }
        
        console.log('Sending request to Web-UI API:', JSON.stringify(payload, null, 2));
        
        // Make a request to the Web-UI API to start the browser agent
        try {
          const webUiResponse = await axios.post('http://localhost:7788/api/agent/run', payload);
          console.log('Web-UI API response:', JSON.stringify(webUiResponse.data, null, 2));
          
          // Store the Web-UI session ID in the agent state
          if (webUiResponse.data && webUiResponse.data.session_id) {
            agentStates.get(sessionId).webUiSessionId = webUiResponse.data.session_id;
          }
          
          // Update the agent state
          agentStates.get(sessionId).isRunning = true;
        } catch (apiError) {
          console.error('Error calling Web-UI API:', apiError.message);
          if (apiError.response) {
            console.error('API response:', apiError.response.data);
          }
          throw new Error(`Failed to start browser agent: ${apiError.message}`);
        }
      } catch (error) {
        console.error('Error starting browser agent:', error);
        agentStates.get(sessionId).error = `Failed to start browser agent: ${error.message}`;
      }
    }
    
    // Return session info
    res.json({
      success: true,
      sessionId,
      sessionUrl: `http://localhost:7788/vnc.html?autoconnect=true&password=vncpassword`,
      contextId: contextId || `context-${Date.now()}`,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

// End a session
app.delete('/api/session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // Remove the agent state
    agentStates.delete(sessionId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
});

// Start the agent
app.post('/api/agent', async (req, res) => {
  try {
    const { goal, sessionId, action, previousSteps, step } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId in request body' });
    }
    
    // Get the agent state
    const agentState = agentStates.get(sessionId);
    
    if (!agentState) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get the Web-UI session ID if it exists
    const webUiSessionId = agentState.webUiSessionId;
    
    // Handle different action types
    switch (action) {
      case 'START': {
        if (!goal) {
          return res.status(400).json({ error: 'Missing goal in request body' });
        }
        
        // Update the agent state
        agentState.task = goal;
        agentState.isRunning = true;
        agentState.steps = [];
        agentState.currentStep = 0;
        agentState.finalResult = null;
        agentState.error = null;
        
        try {
          // Make a request to the Web-UI API to start the agent
          const payload = {
            task: goal,
            agent_type: 'custom',
            headless: false,
            open_browser: true,
            show_browser: true,
          };
          
          console.log('Starting agent with goal:', goal);
          console.log('Sending request to Web-UI API:', JSON.stringify(payload, null, 2));
          
          const webUiResponse = await axios.post('http://localhost:7788/api/agent/run', payload);
          console.log('Web-UI API response:', JSON.stringify(webUiResponse.data, null, 2));
          
          // Store the Web-UI session ID in the agent state
          if (webUiResponse.data && webUiResponse.data.session_id) {
            agentState.webUiSessionId = webUiResponse.data.session_id;
          }
          
          // Get the first step from the Web-UI API
          const firstStep = {
            text: `Starting task: "${goal}"`,
            reasoning: "Initializing the browser to complete this task.",
            tool: "GOTO",
            instruction: "https://www.google.com",
            stepNumber: 1,
          };
          
          // Add the step to the agent state
          agentState.steps.push(firstStep);
          agentState.currentStep = 1;
          
          // Broadcast the update
          broadcastUpdate(sessionId, {
            type: 'step',
            step: firstStep,
          });
          
          return res.json({ 
            success: true,
            result: firstStep,
            steps: [firstStep],
            done: false
          });
        } catch (error) {
          console.error('Error starting agent:', error);
          agentState.error = `Failed to start agent: ${error.message}`;
          return res.status(500).json({ 
            success: false, 
            error: `Failed to start agent: ${error.message}` 
          });
        }
      }
      
      case 'GET_NEXT_STEP': {
        if (!goal) {
          return res.status(400).json({ error: 'Missing goal in request body' });
        }
        
        try {
          // Make a request to the Web-UI API to get the next step
          console.log('Getting next step for session:', sessionId);
          console.log('Web-UI session ID:', webUiSessionId);
          
          // Increment the step counter
          agentState.currentStep += 1;
          
          // In a real implementation, we would make a request to the Web-UI API
          // For now, we'll simulate a response
          
          // Simulate different steps based on the current step number
          let nextStep;
          
          if (agentState.currentStep === 2) {
            // Second step: Type the search query
            nextStep = {
              text: `Typing search query for "${goal}"`,
              reasoning: "Need to enter the search query to find relevant information.",
              tool: "ACT",
              instruction: `type into input[name="q"] ${goal}`,
              stepNumber: agentState.currentStep,
            };
          } else if (agentState.currentStep === 3) {
            // Third step: Click search button
            nextStep = {
              text: "Clicking search button",
              reasoning: "Need to submit the search query to see results.",
              tool: "ACT",
              instruction: "click input[name='btnK']",
              stepNumber: agentState.currentStep,
            };
          } else if (agentState.currentStep === 4) {
            // Fourth step: Click on a search result
            nextStep = {
              text: "Clicking on the most relevant search result",
              reasoning: "This result appears to have the information we need.",
              tool: "ACT",
              instruction: "click .g a",
              stepNumber: agentState.currentStep,
            };
          } else if (agentState.currentStep === 5) {
            // Fifth step: Extract information
            nextStep = {
              text: "Extracting relevant information from the page",
              reasoning: "This page contains the information we need for the task.",
              tool: "EXTRACT",
              instruction: "Extract the main content of the page",
              stepNumber: agentState.currentStep,
            };
          } else {
            // Final step: Close the browser
            nextStep = {
              text: "Task completed successfully",
              reasoning: "I've found and extracted the information needed for this task.",
              tool: "CLOSE",
              instruction: "close",
              stepNumber: agentState.currentStep,
            };
            
            // Set the final result
            agentState.finalResult = `I've completed the task "${goal}" by searching for information and extracting relevant content from the search results.`;
            agentState.isRunning = false;
          }
          
          // Add the step to the agent state
          agentState.steps.push(nextStep);
          
          // Broadcast the update
          broadcastUpdate(sessionId, {
            type: 'step',
            step: nextStep,
          });
          
          return res.json({
            success: true,
            result: nextStep,
            steps: agentState.steps,
            done: nextStep.tool === "CLOSE"
          });
        } catch (error) {
          console.error('Error getting next step:', error);
          return res.status(500).json({ 
            success: false, 
            error: `Failed to get next step: ${error.message}` 
          });
        }
      }
      
      case 'EXECUTE_STEP': {
        if (!step) {
          return res.status(400).json({ error: 'Missing step in request body' });
        }
        
        try {
          // Make a request to the Web-UI API to execute the step
          console.log('Executing step:', step);
          console.log('Web-UI session ID:', webUiSessionId);
          
          // In a real implementation, we would make a request to the Web-UI API
          // For now, we'll simulate a response
          
          // Return different results based on the tool
          let extraction;
          
          if (step.tool === "EXTRACT") {
            extraction = "This is the extracted content from the page. It contains information relevant to the task.";
          } else if (step.tool === "OBSERVE") {
            extraction = [
              {
                element: "div",
                content: "This is the observed content from the page.",
                attributes: { class: "content" },
              },
            ];
          }
          
          // Broadcast the update
          broadcastUpdate(sessionId, {
            type: 'execution',
            step,
            extraction,
          });
          
          return res.json({
            success: true,
            extraction,
            done: step.tool === "CLOSE"
          });
        } catch (error) {
          console.error('Error executing step:', error);
          return res.status(500).json({ 
            success: false, 
            error: `Failed to execute step: ${error.message}` 
          });
        }
      }
      
      default:
        return res.status(400).json({ error: 'Invalid action type' });
    }
  } catch (error) {
    console.error('Error in agent endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// Start the server
server.listen(port, () => {
  console.log(`Web-UI Bridge running at http://localhost:${port}`);
  console.log(`VNC viewer available at http://localhost:7788/vnc.html`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Web-UI Bridge...');
  server.close(() => {
    console.log('Web-UI Bridge shut down');
    process.exit(0);
  });
});
