# Open Operator Frontend

This project implements Open Operator as a frontend for the Web UI browser automation backend. Tasks are sent via MCP to Web UI, which then uses the Modified Browserbase SDK for browser control.

## Architecture

The system consists of these components working together:

1. **Open Operator Frontend** (Next.js, Port 3000)
   - Modern, responsive user interface for task input
   - Sends task requests via MCP to Web UI
   - Displays execution progress and results
   - Communicates with Bridge Server for session management

2. **Web UI Backend** (Python/MCP Server, Port 7788)
   - Receives tasks via MCP from Open Operator
   - Processes tasks and determines required actions
   - **Selects "Browserbase" as execution method**
   - Sends browser commands to Modified Browserbase SDK
   - Returns results via MCP to Open Operator

3. **Modified Browserbase SDK**
   - Receives commands from Web UI engine
   - Uses local Playwright to control browser
   - **Does NOT use Browserbase cloud service**
   - Returns execution results to Web UI

4. **Bridge Server** (Node.js, Port 7789)
   - Handles session management and initialization
   - Required for proper system operation
   - Part of the communication flow

## Quick Start

The components must be started in this specific order:

1. **Start Web UI Backend**
```bash
cd "D:\AI Agent\AI Agent\web-ui"  
.\setup_env.ps1
.\start_app.ps1
```

2. **Start MCP Server**
```bash
cd "D:\AI Agent"
.\start_mcp_server.bat
```

3. **Start Bridge Server**
```bash
cd "D:\AI Agent\AI Agent\open-operator\app\adapters\bridge-server"
npm install 
npm start
```

4. **Start Open Operator Frontend**
```bash
cd "d:/AI Agent/AI Agent/open-operator"
pnpm install  
pnpm dev
```

## Communication Flow

1. **Task Initiation**
   - User enters task in Open Operator UI
   - Frontend sends task via MCP to Web UI
   - Web UI processes task and selects "Browserbase"

2. **Command Execution**
   - Web UI sends commands to Modified Browserbase SDK
   - SDK controls browser using local Playwright
   - Results flow back through Web UI to Open Operator

3. **Session Management**
   - Bridge Server handles session lifecycle
   - Web UI maintains browser state
   - Clean termination on task completion

## Configuration

### Environment Variables
```bash
# Required Ports
FRONTEND_PORT=3000    # Open Operator UI
WEBUI_PORT=7788      # Web UI MCP Server
BRIDGE_PORT=7789     # Bridge Server

# Optional Settings
LOG_LEVEL=debug
ENABLE_DEBUG_LOGGING=true
```

## Troubleshooting

### Common Issues

1. **Connection Problems**
   - Verify all components are running in correct order
   - Check port availability (3000, 7788, 7789)
   - Monitor terminal output for each component

2. **Task Execution Issues**
   - Check Web UI logs for command processing
   - Verify Bridge Server connectivity
   - Monitor browser process status

3. **Browser Control Issues**
   - Verify Web UI can communicate with Modified SDK
   - Check Playwright installation
   - Monitor browser process logs

### Debugging

1. **Component Status**
```bash
# Check Web UI MCP Server
curl http://localhost:7788/health

# Check Bridge Server
curl http://localhost:7789/health

# Check Frontend
curl http://localhost:3000/api/health
```

2. **Log Monitoring**
   - Check all terminal windows for errors
   - Enable debug logging if needed
   - Monitor browser console output

## Important Notes

- Keep all terminal windows open during operation
- Start components in the specified order
- The system uses local browser control, not Browserbase cloud
- Modified SDK uses Playwright for browser automation

## License

MIT
