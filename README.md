# Open Operator + Web UI Integration

This project implements Open Operator as a frontend for the Web UI browser automation backend. It allows users to control the Web UI agent using Open Operator's interface and select which browser environment to use for task execution.

## Architecture

The system consists of three main components:

1. **Open Operator Frontend** (Next.js, Port 3000)
   - Modern UI for interacting with the AI agent
   - Includes a browser selection dropdown with two options:
     - **"Native Browser"**: Uses Web UI's internal Chromium browser
     - **"Browserbase"**: Uses Open Operator's internal browser environment
   - Manages user sessions and task input

2. **Bridge Server** (Node.js + Express, Port 7789)
   - Relays communications between Open Operator and Web UI
   - Forwards tasks and browser preference flag from Open Operator to Web UI
   - Passes execution results back to the frontend

3. **Web UI Backend** (Python, Port 7788)
   - Contains the AI agent logic and browser automation capabilities
   - Executes tasks using either:
     - Its own local Chromium browser (when "Native Browser" is selected)
     - Open Operator's browser environment (when "Browserbase" is selected)

## Browser Selection Logic

The system is designed to provide flexibility in browser selection:

- **Native Browser**: When this option is selected, the `useBrowserbase: false` flag is set. The Bridge Server forwards the task to Web UI, which executes it using its default internal Chromium browser.

- **Browserbase**: When this option is selected, the `useBrowserbase: true` flag is set. The Bridge Server forwards the task to Web UI with special parameters that instruct Web UI to connect to and control Open Operator's browser environment rather than launching its own. This enables the Web UI agent to leverage Open Operator's browser capabilities.

## Quick Start

To start all components:

```bash
cd "D:/AI Agent"
start-open-operator.bat
```

This launches:
- Web UI backend (Port 7788)
- Bridge Server (Port 7789)
- Open Operator Frontend (Port 3000)

## Components

### Frontend UI

The Open Operator frontend provides:
- Browser selection dropdown in the navigation bar
- Task input field and execution controls
- Live view of browser activity
- Step-by-step agent progress display

### Bridge Server

The Bridge Server (in `app/adapters/bridge-server`):
- Manages communication between frontend and backend
- Handles session creation with the appropriate browser flag
- Forwards agent intent and execution commands
- Processes results from the Web UI backend

## Troubleshooting

If you encounter "Failed to handle intent" errors:

1. **Check All Components**: Ensure all three components are running on their respective ports
2. **Check Bridge Server Logic**: Verify the Bridge is forwarding requests to the correct Web UI endpoints
3. **Verify Browser Selection**: Ensure the `useBrowserbase` flag is being properly passed from the frontend through to Web UI
4. **Check Web UI Configuration**: Make sure Web UI supports external browser control when "Browserbase" is selected

## Development

### Adding New Features

To extend the integration:

1. **Frontend**: Components are in `app/components`
2. **API Routes**: Endpoints are in `app/api`
3. **Bridge Logic**: Server code is in `app/adapters/bridge-server`

### Key Files

- `app/atoms.ts`: Contains the `browserTypeAtom` that stores browser selection
- `app/components/ChatFeed.tsx`: Manages task execution UI and calls API
- `app/api/session/route.ts`: Creates sessions with the browser preference
- `app/api/agent/route.ts`: Handles step-by-step agent execution
- `app/adapters/bridge-server/server.js`: Core relay logic between Open Operator and Web UI

## Port Configuration

Default ports:
- Web UI backend: 7788
- Bridge Server: 7789
- Open Operator Frontend: 3000

These can be configured in the `restart-services.bat` file or directly in environment variables.
