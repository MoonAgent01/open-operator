import axios from 'axios';

let activeSession = null;
const WEBUI_URL = process.env.NEXT_PUBLIC_WEBUI_URL || 'http://localhost:7788';
const API_URL = `${WEBUI_URL}/api`;

export async function createSession(options = {}) {
  try {
    const response = await axios.post(`${API_URL}/session`, {
      headless: false,
      width: options.width || 1366,
      height: options.height || 768,
      timezone: options.timezone || "UTC",
      contextId: options.contextId || "",
      settings: {
        headless: false,
        disableSecurity: true,
        ...options.settings
      }
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Unknown error creating session');
    }

    if (response.data.sessionId) {
      activeSession = {
        id: response.data.sessionId,
        debug_url: response.data.debugUrl || `${WEBUI_URL}/session/${response.data.sessionId}`,
        connect_url: response.data.connectUrl || `${WEBUI_URL}/session/${response.data.sessionId}/ws`,
        ws_url: response.data.wsUrl || `${WEBUI_URL}/session/${response.data.sessionId}/ws`
      };
      return activeSession;
    } else {
      throw new Error('Invalid session response from Web UI');
    }
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function navigate(url) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  const response = await axios.post(`${API_URL}/navigate`, {
    session_id: activeSession.id,
    args: { url }
  });

  if (!response.data.success) {
    throw new Error(response.data.error || 'Navigation failed');
  }
  return response.data;
}

export async function click(selector) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  const response = await axios.post(`${API_URL}/click`, {
    session_id: activeSession.id,
    args: { selector }
  });

  if (!response.data.success) {
    throw new Error(response.data.error || 'Click action failed');
  }
  return response.data;
}

export async function type(selector, text) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  const response = await axios.post(`${API_URL}/type`, {
    session_id: activeSession.id,
    args: { selector, text }
  });

  if (!response.data.success) {
    throw new Error(response.data.error || 'Type action failed');
  }
  return response.data;
}

export async function extract(selector) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  const response = await axios.post(`${API_URL}/extract`, {
    session_id: activeSession.id,
    args: { selector }
  });

  if (!response.data.extraction) {
    throw new Error(response.data.error || 'Extraction failed');
  }
  return response.data.extraction;
}

export async function closeSession() {
  if (!activeSession) {
    return;
  }

  try {
    const response = await axios.post(`${API_URL}/close_session`, {
      session_id: activeSession.id,
      args: {}
    });

    if (!response.data.success) {
      console.warn('Session close warning:', response.data.warning || 'Unknown warning');
    }
  } catch (error) {
    console.error('Error closing session:', error);
  } finally {
    activeSession = null;
  }
}

// Export as browserbase object for compatibility
export const browserbase = {
  createSession,
  navigate,
  click,
  type,
  extract,
  closeSession
};
