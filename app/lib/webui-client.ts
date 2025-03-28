/**
 * Client for connecting to WebUI bridge server
 */

export interface SessionResponse {
    success: boolean;
    sessionId: string;
    contextId: string;
    sessionUrl: string;
    connectUrl: string;
    wsUrl: string;
    debugUrl: string;
}

export interface AgentRunResponse {
    success: boolean;
    result: {
        finalResult: string;
        errors: string;
        actions: string;
        thoughts: string;
        recording?: string;
        trace?: string;
        history?: string;
    };
}

export class WebUIClient {
    private apiUrl: string;

    constructor() {
        this.apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7789';
        console.log(`WebUI Client initialized with API URL: ${this.apiUrl}`);
    }

    async createSession(options: { contextId?: string; settings?: any } = {}): Promise<SessionResponse> {
        console.log(`Creating new session with options: ${JSON.stringify(options)}`);
        const response = await fetch(`${this.apiUrl}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contextId: options.contextId || '',
                settings: options.settings || {}
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to create session: ${errorText}`);
            throw new Error(`Failed to create session: ${errorText}`);
        }

        const data = await response.json();
        console.log('Session created successfully:', data);
        return data;
    }

    async navigate(sessionId: string, url: string): Promise<{ status: string; title: string }> {
        console.log(`Navigating session ${sessionId} to ${url}`);
        const response = await fetch(`${this.apiUrl}/api/sessions/${sessionId}/navigate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to navigate: ${errorText}`);
            throw new Error(`Failed to navigate: ${errorText}`);
        }

        return response.json();
    }

    async runAgent(sessionId: string, task: string, config?: any): Promise<AgentRunResponse> {
        console.log(`Running agent in session ${sessionId} with task: ${task}`);
        const response = await fetch(`${this.apiUrl}/api/sessions/${sessionId}/agent/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task, config })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to run agent: ${errorText}`);
            throw new Error(`Failed to run agent: ${errorText}`);
        }

        return response.json();
    }

    async closeSession(sessionId: string): Promise<{ status: string }> {
        console.log(`Closing session ${sessionId}`);
        const response = await fetch(`${this.apiUrl}/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to close session: ${errorText}`);
            throw new Error(`Failed to close session: ${errorText}`);
        }

        return response.json();
    }

    async healthCheck(): Promise<{ status: string }> {
        const response = await fetch(`${this.apiUrl}/health`);

        if (!response.ok) {
            throw new Error('Bridge server is not responding');
        }

        return response.json();
    }
}

// Create singleton instance
export const webuiClient = new WebUIClient();
