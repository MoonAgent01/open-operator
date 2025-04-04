import axios from 'axios';

// Import MCP utilities
import { use_mcp_tool } from '../../utils/mcp';

let activeSession = null;
const WEBUI_URL = process.env.NEXT_PUBLIC_WEBUI_URL || 'http://localhost:7788';
// Use the base URL for session endpoint, as it might be directly at /session instead of /api/session
const API_URL = `${WEBUI_URL}`;

export async function createSession(options = {}) {
  console.log('Creating session using MCP');
  const result = await use_mcp_tool({
    server_name: 'webui-browser',
    tool_name: 'create_session',
    arguments: {
      width: options.width || 1366,
      height: options.height || 768
    }
  });

  console.log('Session created successfully via MCP:', result);
  activeSession = {
    id: result,
    debug_url: `${WEBUI_URL}/session/${result}`,
    connect_url: `${WEBUI_URL}/session/${result}/ws`,
    ws_url: `${WEBUI_URL}/session/${result}/ws`
  };
  return activeSession;
}

export async function navigate(url) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  return await use_mcp_tool({
    server_name: 'webui-browser',
    tool_name: 'navigate',
    arguments: {
      session_id: activeSession.id,
      url
    }
  });
}

export async function click(selector) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  return await use_mcp_tool({
    server_name: 'webui-browser',
    tool_name: 'click',
    arguments: {
      session_id: activeSession.id,
      selector
    }
  });
}

export async function type(selector, text) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  return await use_mcp_tool({
    server_name: 'webui-browser',
    tool_name: 'type',
    arguments: {
      session_id: activeSession.id,
      selector,
      text
    }
  });
}

export async function extract(selector) {
  if (!activeSession) {
    throw new Error('No active session');
  }

  const result = await use_mcp_tool({
    server_name: 'webui-browser',
    tool_name: 'extract',
    arguments: {
      session_id: activeSession.id,
      selector
    }
  });

  return result.extraction;
}

export async function closeSession() {
  if (!activeSession) {
    return;
  }

  try {
    await use_mcp_tool({
      server_name: 'webui-browser',
      tool_name: 'close_session',
      arguments: {
        session_id: activeSession.id
      }
    });
    console.log('Session closed successfully via MCP');
  } finally {
    activeSession = null;
  }
}

// Helper function to execute a step using MCP
export async function executeStep(_, step) { // Ignore sessionId parameter, use activeSession
  if (!activeSession) {
    throw new Error('No active session');
  }

  const tool = step.tool.toLowerCase();
  console.log(`[MCP] Executing step with tool: ${tool}`);

  try {
    switch (tool) {
      case 'determine_next_step':
        return {
          result: await use_mcp_tool({
            server_name: 'webui-browser',
            tool_name: 'determine_next_step',
            arguments: {
              session_id: activeSession.id,
              goal: step.args.goal,
              previous_steps: step.args.previous_steps || []
            }
          })
        };

      case 'navigate':
      case 'goto':
        return { result: await navigate(step.args.url) };

      case 'click':
      case 'act':
        return { result: await click(step.args.selector) };

      case 'type':
        return { result: await type(step.args.selector, step.args.text) };

      case 'extract':
        const extraction = await extract(step.args.selector);
        return { result: { extraction } };

      case 'close':
      case 'close_session':
        await closeSession();
        return { result: { success: true, message: 'Session closed' } };

      case 'screenshot':
        return {
          result: await use_mcp_tool({
            server_name: 'webui-browser',
            tool_name: 'take_screenshot',
            arguments: {
              session_id: activeSession.id,
              full_page: step.args.fullPage || false
            }
          })
        };

      default:
        throw new Error(`Unsupported tool: ${tool}`);
    }
  } catch (error) {
    console.error(`[MCP] Error executing ${tool}:`, error);
    throw error;
  }
}

// Export as browserbase object for compatibility
export const browserbase = {
  createSession,
  navigate,
  click,
  type,
  extract,
  closeSession,
  executeStep
};
