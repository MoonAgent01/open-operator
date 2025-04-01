# Open Operator + Web UI Integration

This project implements Open Operator as a frontend for the Web UI browser automation backend. It allows users to control the Web UI agent using Open Operator's interface and select which browser environment to use for task execution.

## Architecture

The system consists of three main components:

1. **Open Operator Frontend** (Next.js, Port 3000)
   - Modern UI for interacting with the AI agent
   - Includes BrowserSelector component for explicit browser environment selection
   - Uses Jotai atoms for consistent browser state management
   - Real-time task execution monitoring
   - WebSocket-based browser session management

2. **Bridge Server** (Node.js + Express, Port 7789)
   - Unified communication layer between Open Operator and Web UI
   - Handles browser selection with unified `useBrowserbase` flag
   - Implements fallback mechanisms for browser initialization
   - Manages session lifecycle and cleanup
   - Comprehensive logging system for debugging

3. **Web UI Backend** (Python, Port 7788)
   - Contains the AI agent logic and browser automation capabilities
   - Adapts to both internal and external browser control
   - Supports dynamic browser environment switching
   - Maintains session state and context

## Browser Selection Flow

The system uses a unified flag approach for browser selection:

### Frontend Selection
1. User selects browser type via BrowserSelector component
2. Selection stored in `browserTypeAtom` (Jotai state)
3. ChatFeed component includes selection when creating sessions

### API Layer
1. Session API validates browser type
2. Converts selection to unified `useBrowserbase` flag
3. Constructs appropriate browser settings object
4. Forwards to Bridge Server with complete configuration

### Bridge Server
1. Receives session creation request with `useBrowserbase` flag
2. Creates session with appropriate browser context
3. Implements fallback chain if primary method fails:
   - Node.js SDK → Python Connector → WebUI
4. Returns session details to frontend

### WebUI Integration
1. Receives configuration from Bridge Server
2. Uses either internal browser or external control
3. Maintains consistent behavior across both modes

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

#### Browser Selection
The BrowserSelector component (`app/components/BrowserSelector.tsx`) provides:
- Clean, intuitive dropdown interface
- Direct browser type selection
- Immediate state updates via Jotai
- Consistent type safety with BrowserType enum

#### Task Execution
The ChatFeed component (`app/components/ChatFeed.tsx`) handles:
- Browser session creation with selected type
- Real-time execution monitoring
- Step-by-step progress display
- Error state management
- Session cleanup

### Bridge Server

The Bridge Server unifies communication and implements:
- Session management with browser context
- Intent processing for agent actions
- Execution command relay
- Fallback mechanisms
- Comprehensive logging

## Logging System

The system implements detailed logging throughout:

### Frontend Logs
```typescript
[BrowserSelector] Changing browser type to: browserbase
[ChatFeed] Creating session with browser type: browserbase
```

### API Logs
```typescript
[Session API] Creating session with browser type: browserbase
[Session API] Using Browserbase: true
```

### Bridge Server Logs
```typescript
[Bridge Server] Creating session with browser type: browserbase
[Bridge Server] Using Browserbase: true
[Bridge Server] Browser type details: {...}
```

## Troubleshooting

### Common Issues

1. **Browser Selection Errors**
   - Check browserTypeAtom state in React DevTools
   - Verify BrowserSelector component is receiving updates
   - Check browser type propagation in session creation

2. **Session Creation Failures**
   - Verify browser flag in session API request
   - Check Bridge Server logs for fallback attempts
   - Ensure WebUI is properly configured for external browser

3. **Integration Issues**
   - Confirm all three components are running
   - Check port configurations
   - Verify WebSocket connections
   - Monitor browser process management

### Debugging Tips

1. **Frontend**
   - Use React DevTools to inspect browserTypeAtom
   - Check ChatFeed component state
   - Monitor WebSocket connections

2. **Bridge Server**
   - Check session creation logs
   - Monitor browser initialization attempts
   - Review fallback mechanism triggers

3. **WebUI**
   - Verify browser control mode
   - Check CDP connection details
   - Monitor browser process status

## Development

### Key Files

#### Frontend
- `app/atoms.ts`: Browser type management
- `app/components/BrowserSelector.tsx`: Browser selection UI
- `app/components/ChatFeed.tsx`: Task execution interface

#### API Routes
- `app/api/session/route.ts`: Session management
- `app/api/agent/route.ts`: Agent execution

#### Bridge Server
- `app/adapters/bridge-server/server.js`: Core integration logic
- `app/adapters/bridge-server/session-manager.js`: Session handling

### Adding New Features

1. **Frontend Changes**
   - Add components to `app/components`
   - Update atoms in `app/atoms.ts`
   - Extend API routes in `app/api`

2. **Bridge Server Extensions**
   - Add endpoints to `server.js`
   - Extend session management in `session-manager.js`
   - Update browser handling logic

3. **Integration Points**
   - Update browser selection flow
   - Extend logging system
   - Add fallback mechanisms

## Port Configuration

Default ports:
- Web UI backend: 7788
- Bridge Server: 7789
- Open Operator Frontend: 3000

Configure via environment variables or `restart-services.bat`.

## Environment Variables

```bash
# Browser Selection
BROWSER_TYPE=browserbase
USE_BROWSERBASE=true

# Ports
WEBUI_PORT=7788
BRIDGE_PORT=7789
FRONTEND_PORT=3000

# Logging
LOG_LEVEL=debug
ENABLE_DEBUG_LOGGING=true
