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
    // Escape backticks and dollar signs in args for the template literal
    const escapedArgs = JSON.stringify(args)
                          .replace(/`/g, '\\`')
                          .replace(/\$/g, '\\$');
    const scriptContent = `
import sys
import json
import os
# Add adapter path to sys.path to ensure import works
adapter_dir = r'${adapterPath.replace(/\\/g, '\\\\')}'
if adapter_dir not in sys.path:
    sys.path.insert(0, adapter_dir)
# Also add the parent directory in case the adapter is structured differently
parent_dir = os.path.dirname(adapter_dir)
if parent_dir not in sys.path:
	sys.path.insert(0, parent_dir)

# Now try the import
try:
    from browserbase_adapter import Browserbase
except ImportError:
    # Fallback if structure is different, e.g., browserbase_adapter/browserbase.py
    try:
        from browserbase import Browserbase
    except ImportError as e:
        print(json.dumps({"success": False, "error": f"Failed to import Browserbase adapter: {e}, sys.path: {sys.path}"}))
        sys.exit(1)


def main():
    # Parse arguments
    args = json.loads(r'''${escapedArgs}''')

    # Initialize Browserbase
    browser = Browserbase(api_key="not-needed")

    # Execute the requested action
    if "${scriptName}" == "create_session":
        try:
            session = browser.create_session(
                headless=args.get('headless', False), # Use Python syntax
                stealth={
                    "enabled": True, # Use Python syntax
                    "solveCaptchas": True # Use Python syntax
                },
                viewport={
                    "width": args.get('width', 1366), # Use Python syntax
                    "height": args.get('height', 768) # Use Python syntax
                }
            )
            print(json.dumps({
                "success": True, # Use Python syntax
                "session": session
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "close_session":
        try:
            result = browser.close_session(args.get('sessionId')) # Use Python syntax
            print(json.dumps({
                "success": True, # Use Python syntax
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "navigate":
        try:
            result = browser.open(
                url=args.get('url'), # Use Python syntax
                session_id=args.get('sessionId') # Use Python syntax
            )
            print(json.dumps({
                "success": True, # Use Python syntax
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "click":
        try:
            # Execute JavaScript to find and click the element
            # Escape quotes within the JS string for Python
            selector = args.get('selector', '').replace("'", "\\'")
            script = f"""
            function clickElement(selector) {{
                const element = document.querySelector(selector);
                if (element) {{
                    element.click();
                    return true; // Use JS syntax
                }}
                return false; // Use JS syntax
            }}
            return clickElement('{selector}');
            """
            result = browser.execute_js(
                script=script,
                session_id=args.get('sessionId') # Use Python syntax
            )
            print(json.dumps({
                "success": True, # Use Python syntax
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "type":
        try:
            # Execute JavaScript to type text into the element
            # Escape quotes within the JS string for Python
            selector = args.get('selector', '').replace("'", "\\'")
            text = args.get('text', '').replace("'", "\\'")
            script = f"""
            function typeText(selector, text) {{
                const element = document.querySelector(selector);
                if (element) {{
                    element.value = text;
                    // Dispatch input event to trigger React state updates etc.
                    element.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    return true; // Use JS syntax
                }}
                return false; // Use JS syntax
            }}
            return typeText('{selector}', '{text}');
            """
            result = browser.execute_js(
                script=script,
                session_id=args.get('sessionId') # Use Python syntax
            )
            print(json.dumps({
                "success": True, # Use Python syntax
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "extract":
        try:
            # Get HTML content from the page
            html = browser.get_html(session_id=args.get('sessionId')) # Use Python syntax

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
                session_id=args.get('sessionId') # Use Python syntax
            )

            # Combine the results
            result = {
                "html": html,
                "pageInfo": page_info.get('result', {}) # Use Python syntax
            }

            print(json.dumps({
                "success": True, # Use Python syntax
                "result": result
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    elif "${scriptName}" == "screenshot":
        try:
            screenshot = browser.screenshot(
                session_id=args.get('sessionId'), # Use Python syntax
                full_page=args.get('fullPage', False) # Use Python syntax
            )
            print(json.dumps({
                "success": True, # Use Python syntax
                "screenshot": screenshot
            }))
        except Exception as e:
            print(json.dumps({
                "success": False, # Use Python syntax
                "error": str(e)
            }))

    else:
        print(json.dumps({
            "success": False, # Use Python syntax
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
