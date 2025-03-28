/**
 * Start the integration services
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const BRIDGE_SERVER_DIR = path.join(__dirname, 'bridge-server');
const BRIDGE_SERVER_SCRIPT = path.join(BRIDGE_SERVER_DIR, 'server.js');

// Check if a port file exists
function checkPortFile(service) {
  const portFile = `.${service.toLowerCase()}_port-port`;
  return fs.existsSync(portFile);
}

// Install dependencies
async function installDependencies() {
  console.log('Installing bridge server dependencies...');
  
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: BRIDGE_SERVER_DIR,
      stdio: 'inherit',
      shell: true
    });
    
    npm.on('close', (code) => {
      if (code === 0) {
        console.log('Bridge server dependencies installed successfully');
        resolve();
      } else {
        console.error(`npm install failed with code ${code}`);
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

// Start bridge server
async function startBridgeServer() {
  console.log('Starting bridge server...');
  
  return new Promise((resolve, reject) => {
    const node = spawn('node', [BRIDGE_SERVER_SCRIPT], {
      stdio: 'inherit',
      shell: true
    });
    
    node.on('close', (code) => {
      console.error(`Bridge server exited with code ${code}`);
      reject(new Error(`Bridge server exited with code ${code}`));
    });
    
    // Wait for port file to be created
    const checkInterval = setInterval(() => {
      if (checkPortFile('bridge')) {
        clearInterval(checkInterval);
        console.log('Bridge server started successfully');
        resolve();
      }
    }, 1000);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!checkPortFile('bridge')) {
        console.error('Timed out waiting for bridge server to start');
        reject(new Error('Timed out waiting for bridge server to start'));
      }
    }, 30000);
  });
}

// Main function
async function main() {
  try {
    await installDependencies();
    await startBridgeServer();
  } catch (error) {
    console.error('Error starting integration services:', error);
    process.exit(1);
  }
}

main();
