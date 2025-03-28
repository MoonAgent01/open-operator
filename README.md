# Open Operator + Web UI Integration

This project integrates Open Operator as a frontend with Web UI as a backend for browser automation. The integration uses a bridge server to facilitate communication between components.

## Architecture

The system is composed of three main components:

1. **Open Operator Frontend** - Modern Next.js UI for interacting with the AI agent
2. **Bridge Server** - Node.js + Express server that handles communication between frontend and backend
3. **Web UI Backend** - Python-based browser automation and AI agent engine

## Quick Start

To start all components at once, run:

```bash
cd "D:/AI Agent"
start-open-operator.bat
```

This will launch:
- Web UI backend on port 7788
- Bridge server on port 7789
- Open Operator frontend on port 3000

## Components

### Bridge Server

The bridge server (in `app/adapters/bridge-server`) is the critical component that handles communication between the frontend and backend. It:

- Creates browser sessions
- Forwards agent commands
- Provides fallback mock responses when needed
- Handles errors and ensures resilient operation

### Frontend UI

The Open Operator frontend provides a clean interface for:
- Entering goals/tasks for the agent
- Viewing browser sessions
- Monitoring agent progress

### Integration Points

The main integration points are:

1. **Session Management**: Creating and managing browser sessions
2. **Agent Requests**: Forwarding user goals to the AI agent
3. **Browser Control**: Executing browser actions based on agent decisions

## Troubleshooting

If you encounter "Failed to handle intent" errors:

1. Make sure all three components are running
2. Check the bridge server logs for details
3. Verify port configurations in `.bridge_port-port` and `.webui_port-port` files
4. Ensure Web UI backend is properly configured for API access

## Development

### Adding New Features

To extend the integration:

1. Frontend components are in `app/components`
2. API endpoints are in `app/api`
3. Bridge server logic is in `app/adapters/bridge-server`

### Debugging

- Bridge server logs provide valuable information about request/response flow
- Python bridge logs show communications with Web UI
- Frontend network tab can show API request details

## Port Configuration

The default ports are:
- Web UI backend: 7788
- Bridge server: 7789
- Frontend: 3000

These can be configured in the restart-services.bat file.
