# Bridge Server for Open Operator

This bridge server connects Open Operator to the Web UI, allowing Open Operator to use the Web UI's browser automation capabilities.

## How It Works

The bridge server acts as a middleware between Open Operator and Web UI:

1. It exposes REST API endpoints that Open Operator can call
2. It translates these REST API calls into Gradio client calls to Web UI
3. It manages sessions and WebSocket connections

## API Endpoints

### `GET /health`

Check the health of the bridge server and Web UI.

**Response:**
```json
{
  "status": "ok",
  "activeSessions": 0,
  "activeWebSockets": 0,
  "ports": {
    "webui": 7788,
    "bridge": 7789
  },
  "webui_status": "ok"
}
```

### `POST /session`

Create a new browser session.

**Request:**
```json
{
  "timezone": "UTC",
  "contextId": "my-session",
  "settings": {
    "browserSettings": {
      "useExistingBrowser": false,
      "keepBrowserOpen": true,
      "headless": false,
      "windowSize": {
        "width": 1366,
        "height": 768
      }
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123",
  "contextId": "my-session",
  "sessionUrl": "http://localhost:7788/vnc.html?autoconnect=true&resize=scale&password=vncpassword",
  "connectUrl": "ws://localhost:9222/devtools/browser/abc123",
  "wsUrl": "ws://localhost:9222/devtools/browser/abc123",
  "debugUrl": "http://localhost:7788/vnc.html?autoconnect=true&resize=scale&password=vncpassword"
}
```

### `DELETE /session`

End a browser session.

**Request:**
```json
{
  "sessionId": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

### `POST /execute`

Execute a step in the browser.

**Request:**
```json
{
  "sessionId": "abc123",
  "step": {
    "tool": "GOTO",
    "args": {
      "url": "https://example.com"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "extraction": "Step executed successfully"
}
```

## WebSocket Connection

The bridge server also provides a WebSocket endpoint for CDP connections:

```
ws://localhost:7789/devtools/browser/{sessionId}
```

## Installation

```bash
cd open-operator/app/adapters/bridge-server
npm install
```

## Running

```bash
node server.js
```

Or use the integration script:

```bash
cd open-operator/app/adapters
node start-integration.js
```

## Configuration

The bridge server uses the following environment variables:

- `WEBUI_PORT`: Port for Web UI (default: 7788)
- `BRIDGE_PORT`: Port for bridge server (default: 7789)

It also looks for port files:

- `.webui-port`: Web UI port
- `.bridge-port`: Bridge server port
