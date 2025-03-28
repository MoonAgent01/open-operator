/**
 * Start Integration Script
 * 
 * This script helps start all the components of the Open Operator + Web-UI integration.
 * It will:
 * 1. Check if Web-UI is installed
 * 2. Start the Web-UI backend
 * 3. Start the bridge server
 * 4. Start the Open Operator frontend
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths
const rootDir = path.resolve(__dirname, '../../../');
const webUiDir = path.join(rootDir, 'web-ui');
const webUiPath = path.join(webUiDir, 'webui.py');
const openOperatorDir = path.join(rootDir, 'open-operator');
const adaptersDir = path.join(openOperatorDir, 'app', 'adapters');

// Check if Web-UI is installed
if (!fs.existsSync(webUiPath)) {
  console.error(`Error: Web-UI not found at ${webUiPath}`);
  console.error('Please make sure the Web-UI is installed in the correct location.');
  process.exit(1);
}

// Function to start a process
function startProcess(command, args, cwd, name) {
  console.log(`Starting ${name}...`);
  
  const process = spawn(command, args, {
    cwd,
    shell: true,
    stdio: 'pipe',
  });
  
  process.stdout.on('data', (data) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });
  
  process.stderr.on('data', (data) => {
    console.error(`[${name}] ${data.toString().trim()}`);
  });
  
  process.on('close', (code) => {
    console.log(`${name} process exited with code ${code}`);
  });
  
  return process;
}

// Check if dependencies are installed
console.log('Checking if dependencies are installed...');

// Function to check if a module exists
function moduleExists(moduleName) {
  try {
    require.resolve(moduleName);
    return true;
  } catch (e) {
    return false;
  }
}

// Check if required modules are installed
const requiredModules = ['express', 'cors', 'ws', 'axios'];
const missingModules = requiredModules.filter(module => !moduleExists(module));

if (missingModules.length > 0) {
  console.log(`Installing missing dependencies: ${missingModules.join(', ')}...`);
  
  // Install missing dependencies
  const installProcess = startProcess('npm', ['install', ...missingModules], adaptersDir, 'Dependency Installation');
  
  // Wait for installation to complete
  installProcess.on('close', (code) => {
    if (code !== 0) {
      console.error('Failed to install dependencies. Please run "npm install express cors ws axios" manually.');
      process.exit(1);
    }
    
    console.log('Dependencies installed successfully.');
    startAllProcesses();
  });
} else {
  console.log('All dependencies are installed.');
  startAllProcesses();
}

// Function to start all processes
function startAllProcesses() {
  // Start Web-UI backend
  console.log('Starting Web-UI backend...');
  const webUiProcess = startProcess('python', [webUiPath], webUiDir, 'Web-UI');

  // Wait for Web-UI to start
  console.log('Waiting for Web-UI to start...');
  setTimeout(() => {
    // Start bridge server
    console.log('Starting bridge server...');
    const bridgeProcess = startProcess('node', ['webui-bridge.js'], adaptersDir, 'Bridge Server');
    
    // Wait for bridge server to start
    console.log('Waiting for bridge server to start...');
    setTimeout(() => {
      // Start Open Operator frontend
      console.log('Starting Open Operator frontend...');
      const openOperatorProcess = startProcess('pnpm', ['dev'], openOperatorDir, 'Open Operator');
      
      // Handle process termination
      process.on('SIGINT', () => {
        console.log('Shutting down all processes...');
        
        openOperatorProcess.kill();
        bridgeProcess.kill();
        webUiProcess.kill();
        
        process.exit(0);
      });
      
      console.log('\n=== All components started ===');
      console.log('Web-UI backend: http://localhost:7788');
      console.log('Bridge server: http://localhost:7789');
      console.log('Open Operator frontend: http://localhost:3000');
      console.log('\nPress Ctrl+C to stop all processes.');
    }, 2000);
  }, 5000);
}

console.log('Starting all components...');
console.log('Press Ctrl+C to stop all processes.');
