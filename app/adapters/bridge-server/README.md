# Bridge Server for Open Operator + Web UI Integration

This bridge server connects Open Operator to the Web UI, enabling a unified browser automation experience with flexible browser environment selection.

## Architecture

The bridge server functions as an integration layer with several key responsibilities:

1. **Session Management**
   - Creates and maintains browser sessions
   - Associates sessions with user contexts
   - Handles browser environment selection
   - Implements graceful cleanup

2. **Browser Control**
   - Manages Browserbase integration via Node.js SDK or Python connector
   - Handles fallback mechanisms when primary methods fail
   - Configures WebUI for external browser control when needed
   - Unifies browser control behind consistent API

3. **Communication Layer**
   - Exposes REST endpoints for frontend interaction
   - Forwards requests to appropriate backend services
   - Translates response formats for frontend consumption
   - Handles WebSocket connections for real-time data

## Unified Browser Flag System

The bridge server implements a unified browser selection approach using a single `useBrowserbase` flag:

- **Flag Value**: `useBrowserbase: true/false`
- **True**: Uses Browserbase for browser control
- **False**: Uses WebUI's native browser

This flag is set based on frontend selection and determines the entire browser control flow.

## API Endpoints

### `GET /health`

Check the health of the bridge server and connected services.

**Response:**
```json
{
  "status": "ok",
  "activeSessions": 2,
  "activeWebSockets": 1,
  "ports": {
    "webui": 7788,
    "bridge": 7789
  },
  "webui_status": "ok",
  "browserbase_status": "ok"
}
```

### `POST /session`

Create a new browser session with specific browser environment.

**Request:**
```json
{
  "timezone": "UTC",
  "contextId": "my-session",
  "settings": {
    "useBrowserbase": true,
    "browserType": "browserbase",
    "browserSettings": {
      "useExistingBrowser": false,
      "keepBrowserOpen": true,
      "keepBrowserOpenBetweenTasks": true,
      "headless": false,
      "windowSize": {
        "width": 1366,
        "height": 768
      },
      "showBrowser": true
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session-1743139675619",
  "contextId": "my-session",
  "sessionUrl": "http://localhost:7788/browser/session-1743139675619",
  "connectUrl": "ws://localhost:7788/ws",
  "wsUrl": "ws://localhost:7788/ws",
  "debugUrl": "http://localhost:7788"
}
```

### `DELETE /session`

End a browser session.

**Request:**
```json
{
  "sessionId": "session-1743139675619"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

### `POST /intent`

Process agent intent for the next browser action.

**Request:**
```json
{
  "goal": "Open YouTube",
  "sessionId": "session-1743139675619",
  "previousSteps": []
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "tool": "NAVIGATE",
    "args": {
      "url": "https://youtube.com"
    },
    "text": "Navigating to YouTube",
    "reasoning": "Based on the user goal to open YouTube",
    "instruction": "Opening the YouTube website"
  }
}
```

### `POST /execute`

Execute a specific browser action.

**Request:**
```json
{
  "sessionId": "session-1743139675619",
  "step": {
    "tool": "NAVIGATE",
    "args": {
      "url": "https://youtube.com"
    },
    "text": "Navigating to YouTube",
    "reasoning": "Based on the user goal to open YouTube",
    "instruction": "Opening the YouTube website"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "url": "https://youtube.com",
    "content": "<html>...</html>",
    "text": "Navigating to YouTube",
    "reasoning": "Based on the user goal to open YouTube",
    "instruction": "Opening the YouTube website"
  }
}
```

## Browser Initialization Flow

The bridge server implements a sophisticated fallback chain for browser initialization:

1. **Primary Method**: Node.js Browserbase SDK
   ```
   [Bridge Server] Attempting to use Node.js Browserbase SDK
   ```

2. **First Fallback**: Python Browserbase Connector
   ```
   [Bridge Server] Node.js SDK failed, falling back to Python connector
   ```

3. **Final Fallback**: WebUI Native Browser
   ```
   [Bridge Server] Falling back to WebUI native browser
   ```

This ensures robust browser initialization regardless of environment limitations.

## Session Management

The server maintains session state with comprehensive tracking:

- **Session Creation**: Associates browserType with sessionId
- **Context Tracking**: Maintains user context across tasks
- **Loop Detection**: Prevents infinite execution cycles
- **Task History**: Tracks completed tasks to prevent duplication
- **Error Recovery**: Implements graceful handling of failures

## Logging System

The bridge server implements comprehensive logging:

```
[Session Creation] POST /session received: {...}
[Bridge Server] Creating session with browser type: browserbase
[Bridge Server] Using Browserbase: true
[Bridge Server] Browser type details: {...}
[Session Creation] Response: {...}
```

Logging levels and prefixes provide clear indication of system state.

## Configuration

The bridge server supports configuration through:

### Environment Variables

```
WEBUI_PORT=7788
BRIDGE_PORT=7789
BROWSERBASE_API_KEY=your_key
```

### Port Files

- `.webui_port-port`: Contains WebUI port number
- `.bridge_port-port`: Contains bridge server port number

## Installation

```bash
cd app/adapters/bridge-server
npm install
```

## Running

```bash
node server.js
```

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Check that WebUI is running on the configured port
   - Verify network connectivity between services
   - Check for port conflicts

2. **Browser Initialization Failures**
   - Review logs for specific initialization errors
   - Check Browserbase credentials if applicable
   - Verify fallback chain is completing

3. **Session Management Issues**
   - Monitor session creation and termination
   - Check for orphaned sessions
   - Review session cleanup logic

### Debug Logging

To enable enhanced debug logging:

```bash
DEBUG=true node server.js
```

This provides detailed information on:
- Session creation
- Browser initialization
- Intent processing
- Execution steps
- Fallback mechanisms

### Health Check

To verify all components are operational:

```bash
curl http://localhost:7789/health
```

This returns status information for the bridge server, WebUI, and browser environments.
