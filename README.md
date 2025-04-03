# Open Operator + Web UI Integration

This project implements Open Operator as a frontend for the Web UI browser automation backend, using VSCode's Model Context Protocol (MCP) for direct communication between components.

## Architecture

The system consists of two main components:

1. **Open Operator Frontend** (Next.js, Port 3000)
   - Modern UI for interacting with the AI agent
   - Real-time task execution monitoring
   - Direct MCP communication with Web UI
   - WebSocket-based browser session management

2. **Web UI Backend** (Python, Port 7788)
   - Contains the AI agent logic and LLM capabilities
   - Exposes browser control via MCP tools
   - Maintains session state and context
   - Provides structured action results

## Quick Start

To start the system:

1. **Start Web UI Backend**
```bash
cd "D:\New folder (2)\AI Agent\web-ui"  
.\setup_env.ps1
.\start_app.ps1
```

2. **Start Open Operator Frontend**
```bash
cd "d:/AI Agent/AI Agent/open-operator"
pnpm install  
pnpm dev
```

Optional: Start Bridge Server (for compatibility/fallback)
```bash
cd "D:\AI Agent\AI Agent\open-operator\app\adapters\bridge-server"
npm install 
npm start
```

## Components

### Frontend UI

The ChatFeed component (`app/components/ChatFeed.tsx`) handles:
- Task session creation via MCP
- Real-time execution monitoring
- Step-by-step progress display
- Error state management
- Session cleanup

### MCP Integration

Open Operator uses VSCode's MCP to communicate with Web UI:

1. **Session Management**
   - Creates browser sessions via MCP tools
   - Maintains session state between steps
   - Handles clean session termination

2. **Task Execution**
   - Uses Web UI's LLM for step determination
   - Executes browser actions via MCP tools
   - Receives structured results from Web UI

3. **Browser Control**
   - Direct browser automation through MCP
   - Support for common actions (navigate, click, type)
   - Content extraction capabilities

## MCP Tools

The system leverages these MCP tools:

| Tool | Description |
|------|-------------|
| `create_session` | Initialize new browser sessions |
| `navigate` | Navigate to URLs |
| `click` | Click page elements |
| `type` | Enter text into fields |
| `extract` | Extract content from pages |
| `determine_next_step` | Get LLM-determined next action |

## Troubleshooting

### Common Issues

1. **Startup Problems**
   - Ensure Web UI is running first
   - Check VSCode with Claude extension is running
   - Verify MCP configuration in settings

2. **Task Execution Issues**
   - Check Web UI logs for LLM errors
   - Monitor browser process status
   - Verify page content is accessible

3. **Integration Problems**
   - Check MCP tool registration
   - Verify Web UI server is responsive
   - Monitor VSCode MCP connection

### Debugging Tips

1. **Frontend**
   - Use browser DevTools
   - Check WebSocket connections
   - Monitor API requests/responses

2. **MCP Tools**
   - Check VSCode Output panel
   - Monitor Web UI MCP logs
   - Verify tool registration

## Development

### Key Files

#### Frontend
- `app/components/ChatFeed.tsx`: Task execution interface
- `app/api/session/route.ts`: Session management
- `app/api/agent/route.ts`: Agent execution
- `types/global.d.ts`: MCP type definitions

#### API Routes
- `app/api/session/route.ts`: Session lifecycle
- `app/api/agent/route.ts`: Task execution

### Adding Features

1. **Frontend Changes**
   - Add components to `app/components`
   - Update API routes in `app/api`
   - Extend type definitions if needed

2. **MCP Integration**
   - Update MCP tool usage in routes
   - Handle new response types
   - Add error handling

## Environment Variables

```bash
# Ports
FRONTEND_PORT=3000
WEBUI_PORT=7788

# Optional Bridge Server
BRIDGE_PORT=7789

# Logging
LOG_LEVEL=debug
ENABLE_DEBUG_LOGGING=true
```

## License

MIT
