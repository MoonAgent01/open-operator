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

    if (response.data && response.data.id) {
      activeSession = response.data;
      return {
        id: activeSession.id,
        debug_url: `${WEBUI_URL}/session/${activeSession.id}`,
        connect_url: `${WEBUI_URL}/session/${activeSession.id}/ws`,
        ws_url: `${WEBUI_URL}/session/${activeSession.id}/ws`,
        browser_version: 'Web UI Browser'
      };
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

  return response.data.extraction;
}

export async function closeSession() {
  if (!activeSession) {
    return;
  }

  try {
    await axios.post(`${API_URL}/close_session`, {
      session_id: activeSession.id,
      args: {}
    });
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
