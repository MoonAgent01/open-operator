import { NextResponse } from "next/server";
import { browserbase } from "../../lib/browserbase-mock";

interface SessionOptions {
  timezone?: string;
  contextId?: string;
  settings?: {
    headless?: boolean;
    timeout?: number;
  };
}

// Helper function to validate session ID
function validateSessionId(sessionId: string | undefined): NextResponse | null {
  if (!sessionId) {
    return NextResponse.json(
      { 
        success: false,
        error: "Missing sessionId in request body" 
      },
      { status: 400 }
    );
  }
  return null;
}

/**
 * Get session status
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const sessionError = validateSessionId(sessionId || undefined);
    if (sessionError) return sessionError;

    // For now just return success if session ID is provided
    // In the future we could add actual session status checking
    return NextResponse.json({
      success: true,
      status: 'active',
      sessionId
    });
  } catch (error: any) {
    console.error("Error checking session:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to check session: ${error.message}` 
      },
      { status: 500 }
    );
  }
}

/**
 * Create a new browser session
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const options: SessionOptions = {
      timezone: body.timezone || 'UTC',
      contextId: body.contextId,
      settings: body.settings || {}
    };

    console.log("Creating new session with options:", options);
    
    try {
      // Create a new session with Browserbase
      const session = await browserbase.createSession(options);
      
      console.log("Session created:", {
        id: session.id,
        contextId: session.contextId,
        url: session.url,
        connectUrl: session.connectUrl
      });

      return NextResponse.json({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
        contextId: session.contextId,
        settings: options.settings,
        connectUrl: session.connectUrl,
        debugUrl: session.debugUrl
      });
    } catch (browserError: any) {
      console.error("Browserbase session creation failed:", browserError);
      
      // Check for specific error types
      if (browserError.message.includes('port')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Service connection error. Please ensure Web UI and Bridge Server are running.',
            details: browserError.message
          },
          { status: 503 }
        );
      }
      
      if (browserError.message.includes('bridge server')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bridge server error. Please check if the service is running correctly.',
            details: browserError.message
          },
          { status: 502 }
        );
      }
      
      throw browserError; // Re-throw for general error handling
    }
  } catch (error: any) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to create session: ${error.message}` 
      },
      { status: 500 }
    );
  }
}

/**
 * End a browser session
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId as string;
    
    const sessionError = validateSessionId(sessionId);
    if (sessionError) return sessionError;

    console.log("Ending session:", sessionId);
    
    // End the session with Browserbase
    await browserbase.endSession(sessionId);
    
    console.log("Session ended successfully");

    return NextResponse.json({ 
      success: true,
      message: "Session ended successfully"
    });
  } catch (error: any) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to end session: ${error.message}` 
      },
      { status: 500 }
    );
  }
}
