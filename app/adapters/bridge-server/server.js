import axios from 'axios';

// Default Web UI server URL
const WEBUI_URL = process.env.NEXT_PUBLIC_WEBUI_URL || 'http://localhost:7788';

// Check if Web UI server is running
export async function checkWebUIServer() {
  try {
    const response = await axios.get(WEBUI_URL);
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Web UI server:', error);
    return false;
  }
}

// Get Web UI server status and version
export async function getServerStatus() {
  try {
    const response = await axios.get(`${WEBUI_URL}/api/status`);
    return {
      status: 'connected',
      version: response.data?.version || 'unknown',
      url: WEBUI_URL
    };
  } catch (error) {
    return {
      status: 'disconnected',
      error: error.message,
      url: WEBUI_URL
    };
  }
}

// Handle Web UI server events (placeholder for future WebSocket implementation)
export function handleServerEvents(eventCallback) {
  // TODO: Implement WebSocket connection for real-time updates
  console.log('Web UI server event handling not implemented yet');
}

// Export server interface
export const browserServer = {
  checkServer: checkWebUIServer,
  getStatus: getServerStatus,
  handleEvents: handleServerEvents,
  url: WEBUI_URL
};
