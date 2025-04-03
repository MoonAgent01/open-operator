# Browser Integration Guide

This guide explains how the Open Operator frontend integrates with Web UI's browser automation through the custom Browserbase implementation.

## Overview

The integration allows you to:
- Use Open Operator's modern UI with Web UI's powerful browser automation
- Maintain all Browserbase API features without requiring an external API key
- Seamlessly switch between browser modes

## Architecture

```
Open Operator Frontend (3000) → Bridge Server (7789) → Web UI Backend (7788)
```

## Components

### 1. Custom Browserbase SDK

We've created a custom Browserbase SDK implementation (`browserbase-sdk-proxy.js`) that redirects all calls to our local WebUI implementation, eliminating the need for an external API key.

This proxy provides the same interface as the original Browserbase SDK, making it a drop-in replacement that works with all existing code.

### 2. Bridge Server

The bridge server (`server.js`) now uses this custom SDK for all browser operations, providing a seamless experience regardless of which browser type you choose.

### 3. Session Management

Session management has been unified to work consistently across different browser types, with proper fallbacks if one method fails.

## Browser Types

### Native Browser Mode

Uses Web UI's built-in browser capabilities directly.
- Simple setup and configuration
- Runs in the Web UI environment

### Browserbase Mode

Uses our custom Browserbase implementation:
- Same feature set as the Browserbase SDK
- No external API key required
- Connects to Web UI's "Use Own Browser" feature for more flexibility

## Starting the Integration

1. Start the Web UI backend:
   ```
   cd "D:\AI Agent\web-ui"
   python webui.py
   ```

2. Start the Bridge Server:
   ```
   cd "D:\AI Agent\open-operator\app\adapters\bridge-server"
   npm start
   ```

3. Start the Open Operator frontend:
   ```
   cd "D:\AI Agent\open-operator"
   npm run dev
   ```

4. Open http://localhost:3000 to use the integrated system

## Troubleshooting

### Browser Connection Issues

If you see a "Not Found" error when starting a session:
1. Check that Web UI is running at http://localhost:7788
2. Ensure the Bridge Server is running at http://localhost:7789
3. Verify the Open Operator frontend is using the correct bridge server URL

### Session Creation Problems

If you're having trouble creating browser sessions:
1. Check the Bridge Server logs for any error messages
2. Ensure Web UI's browser capabilities are working correctly
3. Try switching between browser types (Native vs Browserbase)

### Intent Processing Errors

If the AI agent can't process intents correctly:
1. Check that the OpenAI API key is set correctly (if required)
2. Verify the browser session was created successfully
3. Check the Bridge Server logs for detailed error messages

## Local Development

To modify the integration:

1. **Custom SDK (browserbase-sdk-proxy.js):**
   - Add or modify methods to match the Browserbase SDK interface
   - Update the implementation to use Web UI's browser capabilities

2. **Bridge Server (server.js):**
   - Improve error handling and fallback mechanisms
   - Add support for additional browser actions

3. **Session Management (session-manager.js):**
   - Enhance session tracking and task history management
   - Improve loop detection and task completion logic

## API Testing

You can test the Bridge Server API endpoints using curl or Postman:

### Create Session
```bash
curl -X POST http://localhost:7789/session \
  -H "Content-Type: application/json" \
  -d '{"contextId":"test session","settings":{"browserType":"native"}}'
```

### Process Intent
```bash
curl -X POST http://localhost:7789/intent \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session-123","goal":"open google"}'
```

### Execute Step
```bash
curl -X POST http://localhost:7789/execute \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session-123","step":{"tool":"NAVIGATE","args":{"url":"https://google.com"}}}'
```

### Delete Session
```bash
curl -X DELETE http://localhost:7789/session \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session-123"}'
```
