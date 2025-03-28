/**
 * Mock implementation of the Browserbase SDK
 * This redirects all calls to our bridge server
 */

import { 
  WebUIConfig, 
  type SessionSettings, 
  type Session,
  type ViewportSettings,
  type BrowserSettings
} from '../adapters/config';

interface SessionOptions {
  timezone?: string;
  contextId?: string;
  settings?: SessionSettings;
}

class BrowserbaseMock {
  private activeSession: Session | null = null;
  private defaultViewport: ViewportSettings = { width: 1366, height: 768 };

  private validateViewport(viewport: ViewportSettings): ViewportSettings {
    const supportedSizes = [
      { width: 1920, height: 1080 }, // Full HD
      { width: 1366, height: 768 },  // Default
      { width: 1536, height: 864 },  // High-Res Laptop
      { width: 1280, height: 720 },  // Small Desktop
      { width: 1024, height: 768 },  // Min Desktop
      { width: 414, height: 896 },   // iPhone 11
      { width: 390, height: 844 },   // iPhone 12+
      { width: 375, height: 812 },   // iPhone X
      { width: 360, height: 800 },   // Android
      { width: 320, height: 568 },   // iPhone SE
    ];

    return supportedSizes.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.width - viewport.width) + Math.abs(prev.height - viewport.height);
      const currDiff = Math.abs(curr.width - viewport.width) + Math.abs(curr.height - viewport.height);
      return currDiff < prevDiff ? curr : prev;
    });
  }

  private mergeBrowserSettings(settings?: SessionSettings): BrowserSettings {
    return {
      headless: settings?.headless ?? false,
      useExistingBrowser: settings?.browserSettings?.useExistingBrowser ?? false,
      keepBrowserOpen: settings?.browserSettings?.keepBrowserOpen ?? true,
      keepBrowserOpenBetweenTasks: settings?.browserSettings?.keepBrowserOpenBetweenTasks ?? true,
      windowSize: this.validateViewport(settings?.viewport || this.defaultViewport),
      showBrowser: settings?.browserSettings?.showBrowser ?? true,
      useOwnBrowser: settings?.browserSettings?.useOwnBrowser ?? false
    };
  }

  async createSession(options: SessionOptions = {}): Promise<Session> {
    try {
      console.log('Creating browser session:', options);
      
      // Get dynamic port configuration
      let bridgePort: number | undefined;
      
      try {
        bridgePort = await WebUIConfig.ports.bridge;
      } catch (error) {
        console.error('Failed to resolve bridge port:', error);
        throw new Error('Bridge server port resolution failed. Make sure the bridge server is running.');
      }

      if (!bridgePort) {
        throw new Error('Failed to get bridge server port. Check if the service is running.');
      }

      // Verify bridge server is accessible
      try {
        const healthCheck = await fetch(`http://localhost:${bridgePort}/health`);
        if (!healthCheck.ok) {
          throw new Error(`Bridge server health check failed: ${healthCheck.statusText}`);
        }
      } catch (error) {
        console.error('Bridge server health check failed:', error);
        throw new Error('Unable to connect to bridge server. Make sure it is running.');
      }

      // Prepare browser settings
      const browserSettings = this.mergeBrowserSettings(options.settings);
      const sessionRequest = {
        timezone: options.timezone || 'UTC',
        contextId: options.contextId,
        settings: {
          ...options.settings,
          browserSettings,
          metadata: {
            source: 'open-operator',
            version: '1.0.0'
          }
        }
      };

      console.log('Sending session request to bridge server:', sessionRequest);

      // Create session through bridge server
      const bridgeResponse = await fetch(`http://localhost:${bridgePort}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionRequest)
      });

      if (!bridgeResponse.ok) {
        const errorText = await bridgeResponse.text();
        throw new Error(`Bridge server error: ${bridgeResponse.statusText}. ${errorText}`);
      }

      const bridgeData = await bridgeResponse.json();
      console.log('Bridge server response:', bridgeData);

      if (!bridgeData.success || !bridgeData.sessionId) {
        throw new Error('Failed to create session: Bridge server returned invalid response');
      }

      // Create session object
      const session = {
        id: bridgeData.sessionId,
        url: bridgeData.sessionUrl,
        contextId: bridgeData.contextId || options.contextId || '',
        sessionUrl: bridgeData.sessionUrl,
        connectUrl: bridgeData.connectUrl,
        debugUrl: bridgeData.debugUrl || bridgeData.sessionUrl
      };

      this.activeSession = session;
      return session;
    } catch (error: any) {
      console.error('Error creating session:', error);
      throw new Error(`Failed to create session: ${error?.message || 'Unknown error'}`);
    }
  }
  
  async endSession(sessionId: string): Promise<void> {
    try {
      console.log('Ending session:', sessionId);
      
      const bridgePort = await WebUIConfig.ports.bridge;
      if (!bridgePort) {
        throw new Error('Failed to get bridge port configuration');
      }

      // Only attempt to end session if it matches the active session
      if (this.activeSession && this.activeSession.id === sessionId) {
        const response = await fetch(`http://localhost:${bridgePort}/session`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to end session: ${response.statusText}`);
        }

        console.log('Session ended successfully');
        this.activeSession = null;
      } else {
        console.warn('Session not found or does not match active session:', sessionId);
      }
    } catch (error: any) {
      console.error('Error ending session:', error);
      throw new Error(`Failed to end session: ${error?.message || 'Unknown error'}`);
    }
  }

  async executeStep(sessionId: string, tool: string, args: Record<string, any>): Promise<any> {
    try {
      if (!this.activeSession || this.activeSession.id !== sessionId) {
        throw new Error('No active session found for step execution');
      }

      const bridgePort = await WebUIConfig.ports.bridge;
      if (!bridgePort) {
        throw new Error('Failed to get bridge port configuration');
      }

      console.log('Executing step:', { sessionId, tool, args });

      const response = await fetch(`http://localhost:${bridgePort}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId,
          step: {
            tool: tool.toUpperCase(),
            args: args || {}
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to execute step: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Step execution failed');
      }

      console.log('Step executed successfully:', data);
      return data.extraction;
    } catch (error: any) {
      console.error('Error executing step:', error);
      throw new Error(`Failed to execute step: ${error?.message || 'Unknown error'}`);
    }
  }

  async checkSession(sessionId: string): Promise<boolean> {
    try {
      const bridgePort = await WebUIConfig.ports.bridge;
      if (!bridgePort) {
        throw new Error('Failed to get bridge port configuration');
      }

      const response = await fetch(`http://localhost:${bridgePort}/health?sessionId=${sessionId}`);
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      return data.success && data.status === 'active';
    } catch {
      return false;
    }
  }
}

export const browserbase = new BrowserbaseMock();
