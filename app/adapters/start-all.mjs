/**
 * Start all services with dynamic port management
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store running processes
const processes = new Map();

/**
 * Discover port from environment or file
 */
async function discoverPort(service, defaultPort) {
  // 1. Check environment variable
  const envPort = process.env[`${service.toUpperCase()}_PORT`];
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port) && port > 0) return port;
  }

  // 2. Check port files
  const portFiles = [
    `.${service.toLowerCase()}-port`,
    path.join(process.cwd(), `.${service.toLowerCase()}-port`),
    path.join(os.tmpdir(), `${service.toLowerCase()}.port`)
  ];

  for (const file of portFiles) {
    try {
      if (fs.existsSync(file)) {
        const port = parseInt(fs.readFileSync(file, 'utf8'));
        if (!isNaN(port) && port > 0) return port;
      }
    } catch (error) {
      console.warn(`Failed to read port from ${file}:`, error);
    }
  }

  // 3. Return default
  return defaultPort;
}

/**
 * Check if a port is in use
 */
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.once('error', () => {
      resolve(true);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/**
 * Wait for a service to be ready
 */
async function waitForService(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Start Web UI
 */
async function startWebUI() {
  const webUiPort = await discoverPort('WEBUI', 7788);
  console.log('Starting Web UI on port', webUiPort);

  // Check if Web UI is already running
  try {
    const response = await fetch(`http://localhost:${webUiPort}/health`);
    if (response.ok) {
      console.log('Web UI is already running');
      return webUiPort;
    }
  } catch {}

  // Start Web UI process
  const webUiProc = spawn('python', ['webui.py'], {
    env: {
      ...process.env,
      WEBUI_PORT: webUiPort.toString()
    },
    cwd: path.resolve(__dirname, '../../../web-ui'),
    stdio: ['inherit', 'pipe', 'pipe']
  });

  processes.set('webui', webUiProc);

  // Handle output
  webUiProc.stdout.on('data', (data) => {
    console.log('[Web UI]', data.toString().trim());
  });

  webUiProc.stderr.on('data', (data) => {
    console.error('[Web UI Error]', data.toString().trim());
  });

  // Wait for startup
  const ready = await waitForService(`http://localhost:${webUiPort}`);
  if (!ready) {
    throw new Error('Web UI failed to start');
  }

  return webUiPort;
}

/**
 * Start bridge server
 */
async function startBridge() {
  const bridgePort = await discoverPort('BRIDGE', 7789);
  console.log('Starting bridge server on port', bridgePort);

  // Check if bridge is already running
  try {
    const response = await fetch(`http://localhost:${bridgePort}/health`);
    if (response.ok) {
      console.log('Bridge server is already running');
      return { bridgePort };
    }
  } catch {}

  // Start bridge server
  const bridgeProc = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      BRIDGE_PORT: bridgePort.toString(),
      DEBUG: 'bridge-server:*'
    },
    cwd: path.join(__dirname, 'bridge-server'),
    stdio: ['inherit', 'pipe', 'pipe']
  });

  processes.set('bridge', bridgeProc);

  // Handle output
  bridgeProc.stdout.on('data', (data) => {
    console.log('[Bridge]', data.toString().trim());
  });

  bridgeProc.stderr.on('data', (data) => {
    console.error('[Bridge Error]', data.toString().trim());
  });

  // Wait for startup
  const ready = await waitForService(`http://localhost:${bridgePort}`);
  if (!ready) {
    throw new Error('Bridge server failed to start');
  }

  return { bridgePort };
}

/**
 * Cleanup on exit
 */
function cleanup() {
  console.log('Cleaning up...');
  
  // Stop all processes
  for (const [name, proc] of processes) {
    console.log(`Stopping ${name}...`);
    proc.kill();
  }
  
  // Remove port files
  const portFiles = ['.webui-port', '.bridge-port'];
  for (const file of portFiles) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
  
  console.log('Cleanup complete');
  process.exit(0);
}

/**
 * Main startup function
 */
async function start() {
  try {
    // Register cleanup
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Start services
    console.log('Starting services...');
    const webUiPort = await startWebUI();
    const bridge = await startBridge();
    
    console.log('All services running:');
    console.log('- Web UI:', webUiPort);
    console.log('- Bridge:', bridge.bridgePort);
    
    // Write configuration for other processes
    const config = {
      webui: {
        port: webUiPort,
        url: `http://localhost:${webUiPort}`
      },
      bridge: {
        port: bridge.bridgePort,
        url: `http://localhost:${bridge.bridgePort}`
      }
    };
    
    fs.writeFileSync(
      path.join(__dirname, '.runtime-config.json'),
      JSON.stringify(config, null, 2)
    );
    
    console.log('Configuration saved to .runtime-config.json');
  } catch (error) {
    console.error('Startup failed:', error);
    cleanup();
  }
}

// Start everything
start().catch((error) => {
  console.error('Fatal error:', error);
  cleanup();
});
