/**
 * Browserbase SDK Proxy
 * This module proxies calls to the Browserbase SDK and redirects them to our WebUI-based implementation,
 * eliminating the need for an external API key while maintaining the same interface.
 */

const browserbaseConnector = require('./browserbase-connector');

// Mock for the entire Browserbase SDK
class BrowserbaseProxy {
  constructor(options = {}) {
    this.options = options;
    
    // Store API key for backwards compatibility, but we won't use it
    this.apiKey = options.apiKey || process.env.BROWSERBASE_API_KEY || "local-sdk";
    
    console.log(`[Browserbase SDK Proxy] Initializing with local implementation`);
    
    // Create browser namespace
    this.browser = {
      navigate: this.navigate.bind(this),
      click: this.click.bind(this),
      type: this.type.bind(this),
      extract: this.extract.bind(this),
      screenshot: this.screenshot.bind(this),
      html: this.html.bind(this),
      execute: this.execute.bind(this)
    };
    
    // Create sessions namespace
    this.sessions = {
      create: this.createSession.bind(this),
      list: this.listSessions.bind(this),
      get: this.getSession.bind(this),
      close: this.closeSession.bind(this)
    };
  }
  
  // Browser methods
  async navigate({ sessionId, url }) {
    console.log(`[Browserbase SDK Proxy] Navigating to ${url} in session ${sessionId}`);
    return await browserbaseConnector.navigate(sessionId, url);
  }
  
  async click({ sessionId, selector, text }) {
    console.log(`[Browserbase SDK Proxy] Clicking ${selector || text} in session ${sessionId}`);
    return await browserbaseConnector.click(sessionId, selector || text);
  }
  
  async type({ sessionId, selector, text }) {
    console.log(`[Browserbase SDK Proxy] Typing "${text}" into ${selector} in session ${sessionId}`);
    return await browserbaseConnector.type(sessionId, selector, text);
  }
  
  async extract({ sessionId, selector }) {
    console.log(`[Browserbase SDK Proxy] Extracting from ${selector} in session ${sessionId}`);
    return await browserbaseConnector.extract(sessionId, selector);
  }
  
  async screenshot({ sessionId, fullPage = false }) {
    console.log(`[Browserbase SDK Proxy] Taking screenshot in session ${sessionId}`);
    return await browserbaseConnector.screenshot(sessionId, fullPage);
  }
  
  async html({ sessionId }) {
    console.log(`[Browserbase SDK Proxy] Getting HTML in session ${sessionId}`);
    const result = await browserbaseConnector.extract(sessionId, 'html');
    return result.html || result.extraction || '';
  }
  
  async execute({ sessionId, code }) {
    console.log(`[Browserbase SDK Proxy] Executing code in session ${sessionId}`);
    const step = {
      tool: 'EXECUTE_JS',
      args: { code },
      text: 'Executing JavaScript',
      reasoning: 'Running custom code',
      instruction: 'Execute JavaScript'
    };
    return await browserbaseConnector.executeStep(sessionId, step);
  }
  
  // Session methods
  async createSession(options = {}) {
    console.log(`[Browserbase SDK Proxy] Creating session with options:`, options);
    
    // Convert SDK options format to connector format
    const connectorOptions = {
      headless: options.headless || false,
      width: options.width || 1366,
      height: options.height || 768,
      useOwnBrowser: options.useOwnBrowser || false,
      keepBrowserOpen: options.keepBrowserOpen || true
    };
    
    const session = await browserbaseConnector.createSession(connectorOptions);
    
    // Transform the response to match Browserbase SDK format
    return {
      id: session.id,
      sessionId: session.id,
      connectUrl: session.connect_url || session.ws_url,
      sessionUrl: session.debug_url,
      debugUrl: session.debug_url,
      wsUrl: session.ws_url
    };
  }
  
  async listSessions() {
    console.log(`[Browserbase SDK Proxy] Listing sessions`);
    return { sessions: [] }; // Simplified implementation
  }
  
  async getSession({ sessionId }) {
    console.log(`[Browserbase SDK Proxy] Getting session ${sessionId}`);
    try {
      return await browserbaseConnector.getSession(sessionId);
    } catch (error) {
      console.error(`[Browserbase SDK Proxy] Error getting session: ${error.message}`);
      return { id: sessionId, status: 'unknown' };
    }
  }
  
  async closeSession({ sessionId }) {
    console.log(`[Browserbase SDK Proxy] Closing session ${sessionId}`);
    return await browserbaseConnector.closeSession(sessionId);
  }
}

module.exports = BrowserbaseProxy;
