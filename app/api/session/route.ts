import { NextRequest, NextResponse } from "next/server";

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

// Bridge server URL
const BRIDGE_SERVER_URL = 'http://localhost:7789';

/**
 * Get session status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const sessionError = validateSessionId(sessionId || undefined);
    if (sessionError) return sessionError;

    try {
      // Check session status via bridge server
      const response = await fetch(`${BRIDGE_SERVER_URL}/health?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error(`Bridge server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return NextResponse.json({
        success: data.success,
        status: data.status || 'unknown',
        sessionId
      });
    } catch (error: any) {
      console.error("Error checking session with bridge server:", error);
      
      // Fall back to basic response if bridge server is not available
      return NextResponse.json({
        success: true,
        status: 'unknown',
        sessionId,
        warning: 'Bridge server connection failed, status may be inaccurate'
      });
    }
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const options = {
      timezone: body.timezone || 'UTC',
      contextId: body.contextId || '',
      settings: body.settings || {
        browserSettings: {
          headless: false,
          useExistingBrowser: false,
          keepBrowserOpen: true,
          keepBrowserOpenBetweenTasks: true,
          windowSize: { width: 1366, height: 768 },
          showBrowser: true,
          useOwnBrowser: false
        }
      }
    };

    console.log("Creating new session with options:", options);
    
    try {
      // Create session via bridge server
      const response = await fetch(`${BRIDGE_SERVER_URL}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        throw new Error(`Bridge server returned ${response.status}: ${response.statusText}`);
      }
      
      const sessionData = await response.json();
      
      if (!sessionData.success) {
        throw new Error(sessionData.error || 'Unknown bridge server error');
      }
      
      console.log("Session created:", {
        id: sessionData.sessionId,
        contextId: sessionData.contextId,
        url: sessionData.sessionUrl
      });

      return NextResponse.json({
        success: true,
        sessionId: sessionData.sessionId,
        sessionUrl: sessionData.sessionUrl,
        contextId: sessionData.contextId,
        settings: options.settings,
        connectUrl: sessionData.connectUrl || sessionData.wsUrl,
        debugUrl: sessionData.debugUrl
      });
    } catch (error: any) {
      console.error("Bridge server session creation failed:", error);
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Service connection error. Please ensure Bridge Server is running.',
            details: error.message
          },
          { status: 503 }
        );
      }
      
      throw error; // Re-throw for general error handling
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
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId as string;
    
    const sessionError = validateSessionId(sessionId);
    if (sessionError) return sessionError;

    console.log("Ending session:", sessionId);
    
    try {
      // End session via bridge server
      const response = await fetch(`${BRIDGE_SERVER_URL}/session`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });
      
      if (!response.ok) {
        throw new Error(`Bridge server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown bridge server error');
      }
      
      console.log("Session ended successfully");

      return NextResponse.json({ 
        success: true,
        message: "Session ended successfully"
      });
    } catch (error: any) {
      console.error("Bridge server session deletion failed:", error);
      
      // Return success even if bridge server fails, as this is a clean-up operation
      return NextResponse.json({ 
        success: true,
        message: "Session marked as ended (bridge server may have failed)",
        warning: error.message
      });
    }
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
