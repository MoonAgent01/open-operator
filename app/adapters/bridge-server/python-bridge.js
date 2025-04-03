const { spawn } = require('child_process');
const path = require('path');

/**
 * Executes a command in the WebUI Python bridge script.
 * @param {string} command - The command to execute in the Python script.
 * @param {object} args - Arguments to pass to the Python command as a JSON string.
 * @returns {Promise<object>} - A promise that resolves with the parsed JSON result from the Python script.
 */
async function runPythonBridge(command, args = {}) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    // Adjust the path to point to the *actual* bridge script if it exists, or a placeholder
    // Assuming a bridge script might exist at web-ui/src/bridge/webui_bridge.py
    // If not, this path needs correction or the script needs creation.
    const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'web-ui', 'src', 'bridge', 'webui_bridge.py'); 

    console.log(`[Python Bridge] Running command: ${command} with args:`, args);
    console.log(`[Python Bridge] Script path: ${scriptPath}`);

    // Check if script exists (optional but good practice)
    // const fs = require('fs');
    // if (!fs.existsSync(scriptPath)) {
    //   console.error(`[Python Bridge] Error: Script not found at ${scriptPath}`);
    //   return reject(new Error(`Python bridge script not found at ${scriptPath}`));
    // }

    const processArgs = [scriptPath, command, JSON.stringify(args)];
    const webUiSrcPath = path.join(__dirname, '..', '..', '..', '..', 'web-ui', 'src'); // Calculate path to web-ui/src
    console.log(`[Python Bridge] Executing: ${pythonExecutable} ${processArgs.join(' ')} in cwd: ${webUiSrcPath}`);

    const pythonProcess = spawn(pythonExecutable, processArgs, {
      cwd: webUiSrcPath // Set the correct working directory for the Python script
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      console.log(`[Python Bridge STDOUT] ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error(`[Python Bridge STDERR] ${data}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Python Bridge] Process exited with code ${code}`);
      if (code !== 0) {
        console.error(`[Python Bridge] Error executing command ${command}: ${stderrData}`);
        // Attempt to parse stderr for JSON error details if possible
        try {
            const errorResult = JSON.parse(stderrData.trim().split('\n').pop());
             reject(new Error(errorResult.error || `Python script exited with code ${code}: ${stderrData}`));
        } catch (e) {
             reject(new Error(`Python script exited with code ${code}: ${stderrData}`));
        }
      } else {
        try {
          // Attempt to parse the last line of stdout as JSON
          const lines = stdoutData.trim().split('\n');
          const lastLine = lines.length > 0 ? lines[lines.length - 1] : '{}'; // Handle empty output
          const result = JSON.parse(lastLine);
          console.log(`[Python Bridge] Parsed result:`, result);
          resolve(result);
        } catch (e) {
          console.error('[Python Bridge] Failed to parse Python script output:', e);
          console.error('[Python Bridge] Raw stdout:', stdoutData);
          // Reject if JSON parsing fails even with exit code 0, as we expect JSON
          reject(new Error(`Failed to parse JSON output from Python script. Raw output: ${stdoutData}`));
        }
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[Python Bridge] Failed to start Python process:', err);
      reject(err);
    });
  });
}

module.exports = { runPythonBridge };
