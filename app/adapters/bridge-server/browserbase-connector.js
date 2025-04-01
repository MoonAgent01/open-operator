/**
 * Browserbase Connector for Open Operator Bridge
 * This module provides a bridge between Open Operator and Web UI using CDP protocol
 */

const { chromium } = require('playwright-core');
const WebSocket = require('ws');

// Store active browser sessions
const activeSessions = new Map();

// Connect to CDP endpoint and create new browser session
async function connectToCDP(endpoint) {
  try {
    // Connect to the browser using CDP
    const browser = await chromium.connectOverCDP(endpoint);
    const context = await browser.newContext();
    const page = await context.newPage();

    return { browser, context, page };
  } catch (error) {
    console.error('Error connecting to CDP:', error);
    throw error;
  }
}

// Browserbase connector API
const browserbaseConnector = {
  /**
   * Check if Browserbase is available
   */
  async isAvailable() {
    // Since we're not using actual Browserbase, always return true
    // as we'll be using CDP instead
    return true;
  },

  /**
   * Create a new browser session
   */
  async createSession(options = {}) {
    try {
      const sessionId = `session-${Date.now()}`;
      
      // Use Chrome DevTools Protocol to connect to the browser
      const cdpEndpoint = `http://localhost:${options.cdpPort || 9222}`;
      
      const session = await connectToCDP(cdpEndpoint);
      
      // Store session info
      activeSessions.set(sessionId, session);

      // Return session info in Browserbase-compatible format
      return {
        id: sessionId,
        debug_url: cdpEndpoint,
        connect_url: cdpEndpoint,
        ws_url: cdpEndpoint.replace('http', 'ws'),
        browser_version: 'CDP Browser'
      };
    } catch (error) {
      console.error('Error creating browser session:', error);
      throw error;
    }
  },

  /**
   * Close a browser session
   */
  async closeSession(sessionId) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Close browser components in reverse order
      await session.page.close();
      await session.context.close();
      await session.browser.close();
      
      activeSessions.delete(sessionId);

      return { success: true };
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Navigate to a URL
   */
  async navigate(sessionId, url) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.page.goto(url);
      
      return {
        success: true,
        url: url
      };
    } catch (error) {
      console.error(`Error navigating in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Click on an element
   */
  async click(sessionId, selector) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.page.click(selector);
      
      return {
        success: true,
        selector: selector
      };
    } catch (error) {
      console.error(`Error clicking in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Type text
   */
  async type(sessionId, selector, text) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.page.fill(selector, text);
      
      return {
        success: true,
        selector: selector,
        text: text
      };
    } catch (error) {
      console.error(`Error typing in session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Extract content from a page
   */
  async extract(sessionId, selector) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const html = await session.page.content();
      const pageInfo = await session.page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText,
        url: window.location.href
      }));

      if (selector) {
        const elementText = await session.page.$eval(selector, el => el.textContent);
        pageInfo.selection = elementText;
      }

      return {
        html,
        pageInfo
      };
    } catch (error) {
      console.error(`Error extracting from session ${sessionId}:`, error);
      throw error;
    }
  },

  /**
   * Take a screenshot
   */
  async screenshot(sessionId, fullPage = false) {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const screenshot = await session.page.screenshot({
        fullPage,
        type: 'jpeg',
        quality: 80
      });

      return screenshot.toString('base64');
    } catch (error) {
      console.error(`Error taking screenshot in session ${sessionId}:`, error);
      throw error;
    }
  }
};

module.exports = browserbaseConnector;
