import axios from 'axios';

// Import MCP configuration
import MCP_CONFIG from './mcp-config';

// Default to Web UI's port
const WEBUI_PORT = process.env.NEXT_PUBLIC_WEBUI_PORT || 7788;
const WEBUI_URL = process.env.NEXT_PUBLIC_WEBUI_URL || `http://localhost:${WEBUI_PORT}`;

/**
 * Bridge implementation of use_mcp_tool for non-VSCode environments
 * Forwards MCP tool calls to Web UI's API endpoints
 */
async function use_mcp_tool({ server_name, tool_name, arguments: args }) {
    // Use the server name from config if not provided
    const actualServerName = server_name || MCP_CONFIG.serverName;

    console.log(`[MCP Bridge] Calling tool ${tool_name} on server ${actualServerName}`, { args });

    try {
        // Check if we're using direct MCP communication
        if (MCP_CONFIG.useMcp && typeof window !== 'undefined' && window.use_mcp_tool) {
            console.log(`[MCP Bridge] Using direct MCP communication for ${tool_name}`);
            return await window.use_mcp_tool({
                server_name: actualServerName,
                tool_name,
                arguments: args
            });
        }

        // Fallback to API endpoints if MCP is not available
        console.log(`[MCP Bridge] Falling back to API endpoints for ${tool_name}`);

        // Map MCP tools to Web UI endpoints
        const endpoints = {
            'create_session': '/api/session',
            'navigate': '/api/navigate',
            'click': '/api/click',
            'type': '/api/type',
            'extract': '/api/extract',
            'determine_next_step': '/api/determine_next_step',
            'close_session': '/api/close_session'
        };

        const endpoint = endpoints[tool_name];
        if (!endpoint) {
            throw new Error(`Unknown MCP tool: ${tool_name}`);
        }

        const response = await axios.post(`${WEBUI_URL}${endpoint}`, args);

        if (!response.data) {
            throw new Error('Empty response from Web UI');
        }

        console.log(`[MCP Bridge] Tool ${tool_name} succeeded:`, response.data);
        return response.data;

    } catch (error) {
        console.error(`[MCP Bridge] Tool ${tool_name} failed:`, error);
        throw new Error(`MCP tool execution failed: ${error.message}`);
    }
}

export {
    use_mcp_tool
};
