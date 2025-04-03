const axios = require('axios');

// Default to Web UI's port
const WEBUI_PORT = process.env.WEBUI_PORT || 7788;
const WEBUI_URL = process.env.WEBUI_URL || `http://localhost:${WEBUI_PORT}`;

/**
 * Bridge implementation of use_mcp_tool for non-VSCode environments
 * Forwards MCP tool calls to Web UI's API endpoints
 */
async function use_mcp_tool({ server_name, tool_name, arguments: args }) {
    console.log(`[MCP Bridge] Calling tool ${tool_name} on server ${server_name}`, { args });
    
    try {
        // Map MCP tools to Web UI endpoints
        const endpoints = {
            'create_session': '/session',
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

module.exports = {
    use_mcp_tool
};
