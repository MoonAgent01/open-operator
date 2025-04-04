# Bridge Server for Open Operator

This Node.js server acts as part of the communication pathway between Open Operator and Web UI, facilitating session management and browser control.

## Role in Architecture

The Bridge Server is a required component in the system, serving these functions:

1. **Communication Relay**
   - Receives requests from Open Operator API routes
   - Acts as an MCP client to the Web UI server
   - Returns results back to Open Operator

2. **Session Management**
   - Helps manage browser session lifecycle
   - Maintains session state information
   - Assists in clean session termination

3. **Command Processing**
   - Forwards task requests to Web UI's MCP server
   - Receives command results from Web UI
   - Relays status updates back to Open Operator

## System Flow

```
Open Operator Frontend (3000) → Bridge Server (7789) → Web UI MCP Server (7788) → Modified Browserbase SDK → Local Browser
```

## Setup and Running

1. **Install Dependencies:**
```bash
cd "D:\AI Agent\AI Agent\open-operator\app\adapters\bridge-server"
npm install
```

2. **Start the Server:**
```bash
npm start
```
*Note: The Web UI MCP Server must be running first (`start_mcp_server.bat`).*

## Configuration

### Environment Variables
```bash
# Required Settings
PORT=7789                      # Bridge Server port
WEBUI_PORT=7788               # Web UI MCP Server port
WEBUI_URL=http://localhost:7788

# Optional Settings
LOG_LEVEL=debug               # For detailed logging
```

## Key Components

### MCP Client Logic
- Located in relevant JavaScript modules
- Manages MCP communication with Web UI
- Handles tool calls and responses

### Session Management
- Tracks active browser sessions
- Maintains session state
- Handles cleanup on completion

## Important Notes

- This server must be running for Open Operator to function correctly
- It's a required part of the communication chain
- Verify Web UI MCP Server is running before starting this server
- Keep the terminal window open during operation

## Debugging

### Common Issues

1. **Connection Problems**
   - Verify Web UI MCP Server is running (`localhost:7788`)
   - Check port availability (7789)
   - Monitor network requests/responses

2. **Session Issues**
   - Check session creation logs
   - Verify MCP communication
   - Monitor session state

### Logging

Enable debug output:
```bash
DEBUG=true npm start
```

Monitor logs for:
- MCP communication
- Session management
- Error messages

## API Reference

Internal endpoints used by Open Operator:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session` | POST | Create new sessions |
| `/session` | DELETE | Clean up sessions |
| `/execute` | POST | Execute browser actions |

## License

MIT
