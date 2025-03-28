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
    private sessionId: string | null = null;

    constructor() {
        // Get the API URL from environment or use default
        this.apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7789';
        console.log(`WebUI Client initialized with API URL: ${this.apiUrl}`);
    }

    async createSession(options: any = {}): Promise<SessionResponse> {
        console.log(`Creating new session with options:`, options);
        try {
            // First try with /api prefix
            const response = await fetch(`${this.apiUrl}/api/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options)
            });

            if (!response.ok) {
                console.warn(`Failed with /api/session, trying /session...`);
                // Try without /api prefix
                const fallbackResponse = await fetch(`${this.apiUrl}/session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(options)
                });

                if (!fallbackResponse.ok) {
                    const errorText = await fallbackResponse.text();
                    throw new Error(`Bridge server error: ${fallbackResponse.statusText}. ${errorText}`);
                }

                const data = await fallbackResponse.json();
                this.sessionId = data.sessionId;
                return data;
            }

            const data = await response.json();
            this.sessionId = data.sessionId;
            return data;
        } catch (error: unknown) {
            console.error(`Failed to create session:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to create session: ${errorMessage}`);
        }
    }

    async navigate(sessionId: string, url: string): Promise<{ status: string; title: string }> {
        console.log(`Navigating session ${sessionId} to ${url}`);
        const response = await fetch(`${this.apiUrl}/api/sessions/${sessionId}/navigate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error(`Failed to navigate: ${response.statusText}`);
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
            throw new Error(`Failed to run agent: ${response.statusText}`);
        }

        return response.json();
    }

    async handleIntent(intent: string, options: any = {}): Promise<any> {
        console.log(`Handling intent "${intent}"`);
        const response = await fetch(`${this.apiUrl}/api/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intent, options })
        });

        if (!response.ok) {
            throw new Error(`Failed to handle intent: ${response.statusText}`);
        }

        return response.json();
    }

    async closeSession(sessionId: string): Promise<{ status: string }> {
        console.log(`Closing session ${sessionId}`);
        const response = await fetch(`${this.apiUrl}/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Failed to close session: ${response.statusText}`);
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
