# Open Operator + Web-UI Integration

This directory contains adapter code to integrate the Open Operator frontend with the Web-UI backend. This integration allows you to use the clean, modern interface of Open Operator while leveraging the powerful browser automation capabilities of Web-UI.

## Architecture

The integration consists of several components:

1. **Open Operator Frontend**: The Next.js-based UI that provides a clean, modern interface for interacting with the AI agent.
2. **Web-UI Backend**: The Python-based backend that provides browser automation capabilities.
3. **Bridge Server**: A Node.js Express server that acts as a bridge between the Open Operator frontend and the Web-UI backend.
4. **Adapter Code**: TypeScript modules that provide a clean API for the Open Operator frontend to communicate with the Web-UI backend.

## Setup Instructions

### Prerequisites

- Node.js and npm (for Open Operator and the Bridge Server)
- Python 3.11+ (for Web-UI)
- Web-UI installed in the correct location (see below)

### Step 1: Install Web-UI

Make sure Web-UI is installed in the correct location. The bridge server expects it to be in the following location:

```
d:/AI Agent/AI Agent/web-ui/
```

If you have Web-UI installed in a different location, you'll need to update the path in `webui-bridge.js`.

### Step 2: Install Bridge Server Dependencies

```bash
cd "d:/AI Agent/AI Agent/open-operator/app/adapters"
npm run install-deps
```

### Option 1: Start All Components at Once

We've provided a convenient script to start all components at once:

```bash
cd "d:/AI Agent/AI Agent/open-operator/app/adapters"
npm run start-all
```

This will:
1. Start the Web-UI backend on port 7788
2. Start the bridge server on port 7789
3. Start the Open Operator frontend on port 3000

You can press Ctrl+C to stop all processes.

### Option 2: Start Components Individually

If you prefer to start each component separately, you can do so:

#### Step 3a: Start Web-UI

```bash
cd "d:/AI Agent/AI Agent/web-ui"
python webui.py
```

This will start the Web-UI backend on port 7788.

#### Step 3b: Start the Bridge Server

```bash
cd "d:/AI Agent/AI Agent/open-operator/app/adapters"
npm start
```

This will start the bridge server on port 7789.

#### Step 3c: Start Open Operator

```bash
cd "d:/AI Agent/AI Agent/open-operator"
pnpm dev
```

This will start the Open Operator frontend on port 3000.

## How It Works

1. The Open Operator frontend makes API calls to its own backend API endpoints (`/api/session` and `/api/agent`).
2. These endpoints have been modified to use the adapter code instead of the original Browserbase/Stagehand implementation.
3. The adapter code communicates with the bridge server, which in turn communicates with the Web-UI backend.
4. The bridge server provides a WebSocket interface for real-time updates from the Web-UI backend to the Open Operator frontend.

## LLM Configuration

The integration is designed to use the LLM configuration from your Web-UI backend, not the one in Open Operator. Here's how it works:

1. When a user submits a task through the Open Operator interface, the request goes through our adapter layer.
2. The adapter fetches the current LLM configuration from the bridge server.
3. The bridge server reads the LLM configuration from your Web-UI backend (currently by reading the .env file).
4. The adapter then uses this configuration when sending requests to the Web-UI backend.

This ensures that the integration always uses the LLM settings you've configured in your Web-UI backend, regardless of what's configured in Open Operator.

## Files

- `config.ts`: Configuration for the adapter, including API endpoints and default settings.
- `webui-adapter.ts`: The main adapter code that provides a clean API for the Open Operator frontend.
- `webui-client.ts`: A client for communicating with the Web-UI backend.
- `webui-bridge.js`: The bridge server that acts as a proxy between the Open Operator frontend and the Web-UI backend.
- `package.json`: Dependencies and scripts for the bridge server.

## Customization

You can customize the integration by modifying the following files:

- `config.ts`: Update the API endpoints and default settings.
- `webui-adapter.ts`: Modify the adapter code to change how the Open Operator frontend interacts with the Web-UI backend.
- `webui-client.ts`: Update the client code to change how the adapter communicates with the Web-UI backend.
- `webui-bridge.js`: Modify the bridge server to change how it proxies requests between the Open Operator frontend and the Web-UI backend.

## Troubleshooting

- If you encounter issues with the bridge server, check the console output for error messages.
- If the Web-UI backend is not running, the bridge server will fail to start.
- If the bridge server is not running, the Open Operator frontend will fail to connect to the Web-UI backend.
- If you're using a different port for the Web-UI backend, update the port in `config.ts`.

### Browser Visibility Issues

If the browser is not visible when running tasks, check the following:

1. Make sure the browser settings in `config.ts` have `headless: false`, `showBrowser: true`, and `openBrowser: true`.
2. Verify that the bridge server is properly passing these settings to the Web-UI backend.
3. Check the console output for any error messages related to browser launching.
4. If using the VNC viewer, make sure it's properly configured and accessible at the URL shown in the console.

The integration is designed to ensure the browser is visible by:
- Setting `headless: false` in the configuration
- Adding `showBrowser: true` and `openBrowser: true` settings
- Explicitly passing these settings to the Web-UI backend

If you're still having issues, try running the Web-UI backend directly with the `--headless false --open-browser true` flags to verify it can launch a visible browser.
