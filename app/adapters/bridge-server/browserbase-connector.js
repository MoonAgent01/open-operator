/**
 * Browserbase Connector for Open Operator Bridge
 * This module integrates Browserbase as a browser option in the Open Operator bridge
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Find Browserbase adapter location
function findBrowserbaseAdapter() {
  // Log current working directory to help with debugging
  console.log(`[Browserbase] Current working directory: ${process.cwd()}`);
  
  // Add more specific paths to search
  const possiblePaths = [
    path.join(process.cwd(), '..', '..', '..', 'browserbase_adapter'),
    path.join(process.cwd(), '..', '..', 'browserbase_adapter'),
    path.join(process.cwd(), '..', 'browserbase_adapter'),
    path.join(process.cwd(), 'browserbase_adapter'),
    path.join('D:', 'AI Agent', 'browserbase_adapter'),
    path.resolve('D:/AI Agent/browserbase_adapter'),
    path.resolve('./browserbase_adapter'),
    path.resolve('../browserbase_adapter'),
    path.resolve('../../browserbase_adapter'),
    path.resolve('../../../browserbase_adapter'),
    path.resolve('../../../../browserbase_adapter'),
  ];
  
  // Try to find the adapter by checking different file indicators
  for (const adapterPath of possiblePaths) {
    // Check if directory exists first
    if (!fs.existsSync(adapterPath)) {
      continue;
    }
    
    console.log(`[Browserbase] Checking path: ${adapterPath}`);
    
    // Check for different files that would indicate a valid adapter
    if (fs.existsSync(path.join(adapterPath, '__init__.py'))) {
      console.log(`[Browserbase] Found adapter at ${adapterPath} (via __init__.py)`);
      return adapterPath;
    }
    
    if (fs.existsSync(path.join(adapterPath, 'browserbase.py'))) {
      console.log(`[Browserbase] Found adapter at ${adapterPath} (via browserbase.py)`);
      return adapterPath;
    }
    
    if (fs.existsSync(path.join(adapterPath, 'setup.py'))) {
      console.log(`[Browserbase] Found adapter at ${adapterPath} (via setup.py)`);
      return adapterPath;
    }
  }
  
  console.warn('[Browserbase] Adapter not found in known locations');
  return null;
}

// Run a Python script using the Browserbase adapter
async function runBrowserbaseScript(scriptName, args = {}) {
  return new Promise((resolve, reject) => {
    const adapterPath = findBrowserbaseAdapter();
    if (!adapterPath) {
      return reject(new Error('Browserbase adapter not found'));
    }
    
    // Create a temporary script that imports and uses the adapter
    const tempScriptPath = path.join(__dirname, '_temp_browserbase_script.py');
    const scriptContent = `
import sys
import json
import os
from browserbase_adapter import Browserbase

def main():
    # Parse arguments
    args = json.loads('''${JSON.stringify(args)}''')
    
    # Initialize Browserbase
    browser = Browserbase(api_key="not-needed")
    
    # Execute the requested action
    if "${scriptName}" == "create_session":
        try:
            session = browser.create_session(
                headless=args.get("headless", False),
                stealth={
                    "enabled": True,
                    "solveCaptchas": True
                },
                viewport={
                    "width": args.get("width", 1366),
                    "height": args.get("height", 768)
                }
            )
            print(json.dumps({
                "success": True,
                "session": session
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "close_session":
        try:
            result = browser.close_session(args.get("sessionId"))
            print(json.dumps({
                "success": True,
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "navigate":
        try:
            result = browser.open(
                url=args.get("url"),
                session_id=args.get("sessionId")
            )
            print(json.dumps({
                "success": True,
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "click":
        try:
            # Execute JavaScript to find and click the element
            script = """
            function clickElement(selector) {
                const element = document.querySelector(selector);
                if (element) {
                    element.click();
                    return true;
                }
                return false;
            }
            return clickElement('${args.get("selector", "")}');
            """
            result = browser.execute_js(
                script=script,
                session_id=args.get("sessionId")
            )
            print(json.dumps({
                "success": True,
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "type":
        try:
            # Execute JavaScript to type text into the element
            script = """
            function typeText(selector, text) {
                const element = document.querySelector(selector);
                if (element) {
                    element.value = text;
                    return true;
                }
                return false;
            }
            return typeText('${args.get("selector", "")}', '${args.get("text", "")}');
            """
            result = browser.execute_js(
                script=script,
                session_id=args.get("sessionId")
            )
            print(json.dumps({
                "success": True,
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "extract":
        try:
            # Get HTML content from the page
            html = browser.get_html(session_id=args.get("sessionId"))
            
            # Also execute JavaScript to get page title and text
            script = """
            return {
                title: document.title,
                text: document.body.innerText,
                url: window.location.href
            };
            """
            page_info = browser.execute_js(
                script=script,
                session_id=args.get("sessionId")
            )
            
            # Combine the results
            result = {
                "html": html,
                "pageInfo": page_info.get("result", {})
            }
            
            print(json.dumps({
                "success": True,
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    elif "${scriptName}" == "screenshot":
        try:
            screenshot = browser.screenshot(
                session_id=args.get("sessionId"),
                full_page=args.get("fullPage", False)
            )
            print(json.dumps({
                "success": True,
                "screenshot": screenshot
            }))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
    
    else:
        print(json.dumps({
            "success": False,
            "error": f"Unknown action: ${scriptName}"
        }))

if __name__ == "__main__":
    main()
    `;
    
    fs.writeFileSync(tempScriptPath, scriptContent);
    
    // Run the script with Python
    console.log(`[Browserbase] Running script: ${scriptName}`);
    const pythonProcess = spawn('python', [tempScriptPath]);
    
    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      console.log(`[Browserbase] Error output: ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Browserbase] Script exited with code ${code}`);
      
      // Clean up the temporary script
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (err) {
        console.warn(`[Browserbase] Failed to clean up temp script: ${err.message}`);
      }
      
      if (code !== 0) {
        return reject(new Error(`Browserbase script exited with code ${code}: ${errorData}`));
      }

      try {
        const result = JSON.parse(outputData);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse Browserbase output: ${err.message}, Output: ${outputData}`));
      }
    });
  });
}

// Browserbase connector API
const browserbaseConnector = {
  /**
   * Check if Browserbase is available
   */
  async isAvailable() {
    try {
      const adapterPath = findBrowserbaseAdapter();
      return !!adapterPath;
    } catch (error) {
      console.error('Error checking Browserbase availability:', error);
      return false;
    }
  },
  
  /**
   * Create a new browser session
   */
  async createSession(options = {}) {
    try {
      const result = await runBrowserbaseScript('create_session', {
        headless: options.headless || false,
        width: options.window_w || 1366,
        height: options.window_h || 768
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create Browserbase session');
      }
      
      return result.session;
    } catch (error) {
      console.error('Error creating Browserbase session:', error);
      throw error;
    }
  },
  
  /**
   * Close a browser session
   */
  async closeSession(sessionId) {
    try {
      const result = await runBrowserbaseScript('close_session', {
        sessionId
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to close Browserbase session');
      }
      
      return result.result;
    } catch (error) {
      console.error(`Error closing Browserbase session ${sessionId}:`, error);
      throw error;
    }
  },
  
  /**
   * Navigate to a URL
   */
  async navigate(sessionId, url) {
    try {
      const result = await runBrowserbaseScript('navigate', {
        sessionId,
        url
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to navigate in Browserbase');
      }
      
      return result.result;
    } catch (error) {
      console.error(`Error navigating in Browserbase session ${sessionId}:`, error);
      throw error;
    }
  },
  
  /**
   * Click on an element
   */
  async click(sessionId, selector) {
    try {
      const result = await runBrowserbaseScript('click', {
        sessionId,
        selector
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to click in Browserbase');
      }
      
      return result.result;
    } catch (error) {
      console.error(`Error clicking in Browserbase session ${sessionId}:`, error);
      throw error;
    }
  },
  
  /**
   * Type text
   */
  async type(sessionId, selector, text) {
    try {
      const result = await runBrowserbaseScript('type', {
        sessionId,
        selector,
        text
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to type in Browserbase');
      }
      
      return result.result;
    } catch (error) {
      console.error(`Error typing in Browserbase session ${sessionId}:`, error);
      throw error;
    }
  },
  
  /**
   * Extract content from a page
   */
  async extract(sessionId, selector) {
    try {
      const result = await runBrowserbaseScript('extract', {
        sessionId,
        selector
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to extract in Browserbase');
      }
      
      return result.result;
    } catch (error) {
      console.error(`Error extracting in Browserbase session ${sessionId}:`, error);
      throw error;
    }
  },
  
  /**
   * Take a screenshot
   */
  async screenshot(sessionId, fullPage = false) {
    try {
      const result = await runBrowserbaseScript('screenshot', {
        sessionId,
        fullPage
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to take screenshot in Browserbase');
      }
      
      return result.screenshot;
    } catch (error) {
      console.error(`Error taking screenshot in Browserbase session ${sessionId}:`, error);
      throw error;
    }
  }
};

module.exports = browserbaseConnector;
