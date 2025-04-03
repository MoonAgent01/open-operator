# WebUI Bridge Server (Optional MCP Compatibility Layer)

This bridge server provides a compatibility layer between Open Operator frontend and Web UI backend, though it's now optional due to direct MCP integration.

## Overview

With the new MCP integration, direct communication between Open Operator and Web UI is handled through VSCode's Model Context Protocol. However, this bridge server remains available as:

1. A compatibility layer for systems not using MCP
2. A fallback mechanism if needed
3. A way to maintain backward compatibility

## Architecture

Modern Flow (Recommended):
```
Open Operator Frontend (3000) → VSCode MCP → Web UI Backend (7788)
```

Legacy Flow (Optional):
```
Open Operator Frontend (3000) → Bridge Server (7789) → Web UI Backend (7788)
```

## Key Components

### Browserbase Connector

The `browserbase-connector.js` module now:
- Acts as an MCP proxy for browser operations
- Maintains compatibility with existing code
- Translates between old and new APIs

### Session Manager

The `session-manager.js` module provides:
- Legacy session management support
- State tracking for non-MCP flows
- Compatibility with older integrations

## Starting the Server (Optional)

Only needed if not using MCP or requiring backwards compatibility:

```bash
cd "AI Agent/open-operator/app/adapters/bridge-server"
npm install
npm start
```

## Environment Variables

```bash
# Bridge Server (Optional)
PORT=7789
WEBUI_PORT=7788
WEBUI_URL=http://localhost:7788

# Compatibility Settings
USE_MCP=true # Set to false to force legacy mode
```

## API Endpoints (Legacy Support)

These endpoints remain available for backward compatibility:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create browser session |
| `/execute` | POST | Execute browser action |
| `/session` | DELETE | Close session |

## Troubleshooting

### Common Issues

1. **MCP vs Legacy Mode**
   - Check if VSCode/Claude extension is running (for MCP)
   - Verify MCP server registration in settings
   - Fall back to bridge server if needed

2. **Browser Control**
   - Verify Web UI is running and accessible
   - Check process/port conflicts
   - Monitor browser session state

3. **API Compatibility**
   - Ensure correct endpoint usage
   - Check payload formats
   - Verify response handling

### Debug Mode

Run with verbose logging:
```bash
DEBUG=true node server.js
```

## Migration to MCP

To migrate from bridge server to direct MCP:

1. Update VSCode settings to include Web UI MCP server
2. Remove bridge server from startup sequence
3. Update Open Operator to use MCP tools
4. Keep bridge server as fallback if needed

## License

MIT
