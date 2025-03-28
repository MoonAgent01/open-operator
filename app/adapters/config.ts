/**
 * Configuration for the Web-UI adapter
 */
import fs from 'fs';
import net from 'net';
import path from 'path';
import os from 'os';

// Browser configuration types
export interface BrowserConfig {
  useExistingBrowser: boolean;
  keepBrowserOpen: boolean;
  keepBrowserOpenBetweenTasks: boolean;
  headless: boolean;
  windowSize: {
    width: number;
    height: number;
  };
}

export interface ViewportSettings {
  width: number;
  height: number;
}

export interface BrowserSettings {
  useExistingBrowser?: boolean;
  keepBrowserOpen?: boolean;
  keepBrowserOpenBetweenTasks?: boolean;
  headless?: boolean;
  useOwnBrowser?: boolean;
  showBrowser?: boolean;
  windowSize?: {
    width: number;
    height: number;
  };
}

export interface SessionSettings {
  headless?: boolean;
  timeout?: number;
  viewport?: ViewportSettings;
  stealth?: {
    enabled?: boolean;
    solveCaptchas?: boolean;
    fingerprint?: {
      browsers?: string[];
      devices?: string[];
      locales?: string[];
      operatingSystems?: string[];
    };
  };
  browserSettings?: BrowserSettings;
  metadata?: Record<string, any>;
}

export interface Session {
  id: string;
  url: string;
  contextId: string;
  sessionUrl: string;
  connectUrl: string;
  debugUrl?: string;
}

// Default browser configuration
export const defaultBrowserConfig: BrowserConfig = {
  useExistingBrowser: false,
  keepBrowserOpen: true,
  keepBrowserOpenBetweenTasks: true,
  headless: false,
  windowSize: {
    width: 1366,
    height: 768
  }
};

// Browser settings for the Web UI
export const browserSettings = {
  headless: false,
  windowWidth: 1366,
  windowHeight: 768,
  useOwnBrowser: false,
  keepBrowserOpen: true,
  showBrowser: true,
  openBrowser: true,
};

// Agent settings
export const agentSettings = {
  maxSteps: 50,
  useVision: true,
  maxActionsPerStep: 5,
};

// Default LLM settings
export const llmSettings = {
  provider: 'openai',
  modelName: 'gpt-4o',
  temperature: 0.7,
};

// Port ranges for service discovery
const PORT_RANGE = {
  min: 7700,
  max: 7800
};

// Check if a port is available
async function isPortAvailable(port: number): Promise<boolean> {
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

// Check if a service is responding on a port
async function isServiceResponding(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Get service port with retries
async function getServicePort(key: string, defaultPort: number): Promise<number> {
  // Check environment variables first
  const envPort = process.env[`${key.toUpperCase()}_PORT`];
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port) && port > 0) {
      if (await isServiceResponding(port)) {
        return port;
      }
    }
  }

  // Check port files
  const portFiles = [
    `.${key.toLowerCase()}-port`,
    path.join(process.cwd(), `.${key.toLowerCase()}-port`),
    path.join(os.tmpdir(), `${key.toLowerCase()}.port`)
  ];

  for (const file of portFiles) {
    try {
      if (fs.existsSync(file)) {
        const port = parseInt(fs.readFileSync(file, 'utf8'), 10);
        if (!isNaN(port) && port > 0 && await isServiceResponding(port)) {
          return port;
        }
      }
    } catch (error) {
      console.warn(`Failed to read port from ${file}:`, error);
    }
  }

  // Return default port
  return defaultPort;
}

// Port configuration
export const ports = {
  webUi: getServicePort('WEBUI', 7788),
  bridge: getServicePort('BRIDGE', 7789),
  frontend: getServicePort('FRONTEND', 3000)
};

// Endpoint configuration
export const endpoints = {
  runAgent: '/run_agent',
  session: '/session',
  intent: '/intent',
  llmConfig: '/llm-config',
  health: '/health',
  getScreenshot: '/screenshot'
};

// Base URL for Web UI API
export const baseUrl = ports.webUi.then(port => `http://localhost:${port}`);

// Export configuration object
export const WebUIConfig = {
  ports,
  endpoints,
  baseUrl,
  browserSettings,
  agentSettings,
  llmSettings
};
