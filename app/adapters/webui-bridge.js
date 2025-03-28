/**
 * Bridge between Open Operator and Web-UI
 * Handles communication and port management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');

// Port range for service discovery
const PORT_RANGE = {
  min: 7700,
  max: 7800
};

// Service directories for port files
const PORT_DIRS = [
  process.cwd(),
  os.tmpdir(),
  '/var/run'
];

/**
 * Check if a port is available
 */
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find next available port in range
 */
async function findAvailablePort(min = PORT_RANGE.min, max = PORT_RANGE.max) {
  for (let port = min; port <= max; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${min}-${max}`);
}

/**
 * Save port to discovery file
 */
async function savePortToFile(service, port) {
  const fileName = `.${service.toLowerCase()}-port`;
  
  // Try multiple locations
  for (const dir of PORT_DIRS) {
    try {
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, port.toString());
      console.log(`Saved ${service} port ${port} to ${filePath}`);
      return filePath;
    } catch (error) {
      console.warn(`Failed to save port file in ${dir}:`, error);
      continue;
    }
  }
  
  console.warn(`Could not save port file for ${service}`);
}

/**
 * Load port from discovery file
 */
async function loadPortFromFile(service) {
  const fileName = `.${service.toLowerCase()}-port`;
  
  // Try multiple locations
  for (const dir of PORT_DIRS) {
    try {
      const filePath = path.join(dir, fileName);
      if (fs.existsSync(filePath)) {
        const port = parseInt(fs.readFileSync(filePath, 'utf8'));
        if (!isNaN(port) && port > 0) {
          console.log(`Loaded ${service} port ${port} from ${filePath}`);
          return port;
        }
      }
    } catch (error) {
      console.warn(`Failed to load port file from ${dir}:`, error);
      continue;
    }
  }
  
  return null;
}

/**
 * Service discovery
 */
async function discoverService(service, defaultPort) {
  // 1. Try environment variable
  const envPort = process.env[`${service.toUpperCase()}_PORT`];
  if (envPort) {
    const port = parseInt(envPort);
    if (!isNaN(port) && port > 0 && await isPortAvailable(port)) {
      return port;
    }
  }

  // 2. Try discovery file
  const savedPort = await loadPortFromFile(service);
  if (savedPort && await isPortAvailable(savedPort)) {
    return savedPort;
  }

  // 3. Find next available port
  try {
    const port = await findAvailablePort();
    await savePortToFile(service, port);
    return port;
  } catch (error) {
    console.warn('Port discovery failed:', error);
  }

  // 4. Fall back to default
  if (await isPortAvailable(defaultPort)) {
    return defaultPort;
  }

  throw new Error(`Could not allocate port for ${service}`);
}

/**
 * Initialize bridge server
 */
async function initializeBridge() {
  try {
    // Discover Web UI port
    const webUiPort = await discoverService('WEBUI', 7788);
    console.log('Web UI port:', webUiPort);

    // Discover bridge port
    const bridgePort = await discoverService('BRIDGE', 7789);
    console.log('Bridge port:', bridgePort);

    // Create WebSocket proxy
    const wss = new WebSocket.Server({ port: bridgePort });
    
    // Handle connections
    wss.on('connection', (ws) => {
      console.log('Client connected');
      
      // Create connection to Web UI
      const webUiWs = new WebSocket(`ws://localhost:${webUiPort}`);
      
      // Forward messages
      ws.on('message', (data) => {
        webUiWs.send(data);
      });
      
      webUiWs.on('message', (data) => {
        ws.send(data);
      });
      
      // Handle disconnection
      ws.on('close', () => {
        console.log('Client disconnected');
        webUiWs.close();
      });
      
      webUiWs.on('close', () => {
        ws.close();
      });
    });

    console.log('Bridge server running');
    
    // Health check server
    const healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        ports: {
          webui: webUiPort,
          bridge: bridgePort
        }
      }));
    });

    healthServer.listen(bridgePort + 1);
    
    return {
      webUiPort,
      bridgePort,
      wss,
      healthServer
    };
  } catch (error) {
    console.error('Failed to initialize bridge:', error);
    throw error;
  }
}

module.exports = {
  initializeBridge,
  discoverService,
  PORT_RANGE
};
