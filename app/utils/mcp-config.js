// MCP configuration for Open Operator
const MCP_CONFIG = {
  // Whether to use MCP for communication
  useMcp: process.env.NEXT_PUBLIC_USE_MCP === 'true',
  
  // MCP server name
  serverName: process.env.NEXT_PUBLIC_MCP_SERVER_NAME || 'webui-browser',
  
  // Tool mappings
  tools: {
    createSession: 'create_session',
    navigate: 'navigate',
    click: 'click',
    type: 'type',
    extract: 'extract',
    determineNextStep: 'determine_next_step',
    closeSession: 'close_session'
  }
};

export default MCP_CONFIG;
