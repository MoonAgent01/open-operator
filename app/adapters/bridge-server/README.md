# WebUI Bridge Server

This bridge server connects Open Operator frontend with Web UI browser automation backend, allowing seamless control of browser sessions.

## Overview

The WebUI Bridge Server acts as an intermediary between Open Operator's frontend and Web UI's browser automation backend. It enables users to:

1. Use Open Operator's modern UI to control Web UI's powerful browser automation
2. Seamlessly choose between native browser mode and external browser mode
3. Maintain all browser automation capabilities while using a unified interface

## Architecture

```
Open Operator Frontend (3000) → Bridge Server (7789) → Web UI Backend (7788)
```

## How It Works

The bridge server abstracts away the differences between browser environments by:

1. **Unified API**: Presenting a standard set of endpoints for browser control
2. **Intelligent Routing**: Directing commands to the appropriate backend
3. **Error Handling**: Providing fallbacks and graceful degradation
4. **Stateful Sessions**: Maintaining session state across all components

## Key Components

### Browserbase Connector

The `browserbase-connector.js` module provides:

- Session creation and management with Web UI
- Execution of browser actions (navigate, click, type, etc.)
- Intent processing for AI agent actions
- Screenshot and content extraction capabilities

### Session Manager

The `session-manager.js` module:

- Tracks active browser sessions
- Monitors for task completion and loop detection
- Maintains browser state across requests
- Handles session cleanup

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check for bridge server |
| `/health` | GET | Detailed health status |
| `/session` | POST | Create new browser session |
| `/intent` | POST | Process AI agent intent |
| `/execute` | POST | Execute browser action |
| `/session` | DELETE | Close and delete session |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7789 | Bridge server port |
| `WEBUI_PORT` | 7788 | Web UI backend port |
| `WEBUI_URL` | `http://localhost:7788` | Web UI base URL |
| `BROWSERBASE_API_KEY` | - | Browserbase API key (optional) |
| `OPENAI_API_KEY` | - | OpenAI API key (optional) |

## Starting the Server

```bash
cd "AI Agent/open-operator/app/adapters/bridge-server"
npm install
node server.js
```

Or use the restart script:

```bash
cd "AI Agent"
./open-operator/restart-services.bat
```

## Browser Types

The bridge server supports two browser modes:

1. **Native Browser** (default)
   - Uses Web UI's built-in browser
   - No external dependencies
   - Simple setup and configuration

2. **Browserbase Mode**
   - Connects to Web UI's "Use Own Browser" feature
   - More flexibility for persistent sessions
   - Supports user data profiles

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify all services are running (Web UI, Bridge Server, Open Operator)
   - Check ports are not blocked or in use by other applications
   - Ensure environment variables are correctly set

2. **Browser Control Issues**
   - Check logs for browser session creation failures
   - Verify Web UI is properly configured
   - Use proper selectors for page elements

3. **Integration Errors**
   - Look for 404 errors which indicate API mismatch
   - Check payload formats if receiving 400 errors
   - Verify service URLs are correct

### Logs to Check

Run with verbose logging:

```bash
DEBUG=true node server.js
```

Check the following sections in logs:

- `[WebUI Check]` - Web UI availability and API endpoints
- `[Session Creation]` - Browser session initialization
- `[Intent]` - AI agent intent processing
- `[Execute]` - Browser action execution
- `[WebUI Connector]` - Connector API communication

## API Reference

### Create Session

```
POST /session
```

Request:
```json
{
  "contextId": "open youtube",
  "settings": {
    "useBrowserbase": false,
    "browserType": "native",
    "headless": false,
    "browserSettings": {
      "windowSize": {
        "width": 1366,
        "height": 768
      }
    }
  }
}
```

### Process Intent

```
POST /intent
```

Request:
```json
{
  "sessionId": "session-1234567890",
  "goal": "open youtube",
  "previousSteps": [],
  "context": {}
}
```

### Execute Step

```
POST /execute
```

Request:
```json
{
  "sessionId": "session-1234567890",
  "step": {
    "tool": "NAVIGATE",
    "args": {
      "url": "https://youtube.com"
    },
    "text": "Navigating to YouTube",
    "reasoning": "Opening the requested site",
    "instruction": "Opening YouTube"
  }
}
```

### Close Session

```
DELETE /session
```

Request:
```json
{
  "sessionId": "session-1234567890"
}
```
