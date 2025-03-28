import { NextRequest, NextResponse } from 'next/server';
import { webuiClient } from '@/app/lib/webui-client';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, sessionId, data } = body;
        console.log(`WebUI API Request: ${action}`, { sessionId, data });

        switch (action) {
            case 'createSession': {
                const session = await webuiClient.createSession({
                    contextId: data?.contextId,
                    settings: data?.settings
                });
                return NextResponse.json(session);
            }

            case 'navigate': {
                if (!sessionId || !data?.url) {
                    return NextResponse.json(
                        { error: 'Missing sessionId or url' },
                        { status: 400 }
                    );
                }
                const result = await webuiClient.navigate(sessionId, data.url);
                return NextResponse.json(result);
            }

            case 'runAgent': {
                if (!sessionId || !data?.task) {
                    return NextResponse.json(
                        { error: 'Missing sessionId or task' },
                        { status: 400 }
                    );
                }
                const result = await webuiClient.runAgent(
                    sessionId,
                    data.task,
                    data.config
                );
                return NextResponse.json(result);
            }

            case 'closeSession': {
                if (!sessionId) {
                    return NextResponse.json(
                        { error: 'Missing sessionId' },
                        { status: 400 }
                    );
                }
                const result = await webuiClient.closeSession(sessionId);
                return NextResponse.json(result);
            }

            case 'healthCheck': {
                const result = await webuiClient.healthCheck();
                return NextResponse.json(result);
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid action' },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        console.error('WebUI API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

// Also handle GET requests for health checks
export async function GET(req: NextRequest) {
    try {
        const result = await webuiClient.healthCheck();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Health check error:', error);
        return NextResponse.json(
            { error: error.message || 'Bridge server not available' },
            { status: 503 }
        );
    }
}
