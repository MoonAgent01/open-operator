import { NextRequest, NextResponse } from "next/server";
import { browserbase } from '@/app/adapters/bridge-server/browserbase-connector';
import { BrowserType } from "../../atoms"; // Import the enum

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
 * Get session status (Placeholder - not fully implemented with direct API)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const sessionError = validateSessionId(sessionId || undefined);
    if (sessionError) return sessionError;

    // TODO: Implement status check via direct API if available, or keep as unknown
    return NextResponse.json({
      success: true,
      status: 'unknown', // Status check might not be available via direct API
      sessionId,
      warning: 'Session status check via direct API not implemented'
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
 * Create a new browser session using the direct API connector
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Read browserType from request body
    const browserType: BrowserType =
      body.browserType === BrowserType.Native
        ? BrowserType.Native
        : BrowserType.Browserbase; // Default to Browserbase/WebUI

    console.log(`[Session API] Creating session with browser type: ${browserType}`);

    // Base settings, potentially overridden by client request body.settings
    const defaultSettings = {
      headless: false,
      disableSecurity: true, // Common setting for automation
      browserSettings: { // Keep nested structure if needed by connector
        headless: false,
        useExistingBrowser: false,
        keepBrowserOpen: true,
        keepBrowserOpenBetweenTasks: true,
        windowSize: { width: 1366, height: 768 },
        showBrowser: true,
      }
    };

    // Merge default settings with any settings provided in the request body
    const finalSettings = {
      ...defaultSettings,
      ...(body.settings || {}),
    };

    const options = {
      timezone: body.timezone || 'UTC',
      contextId: body.contextId || '',
      settings: finalSettings, // Use the constructed settings
      width: finalSettings.browserSettings.windowSize.width, // Pass width/height directly if needed
      height: finalSettings.browserSettings.windowSize.height
    };

    console.log(`[Session API] Creating new session via direct API with options:`, options);
    
    // Use the direct browserbase connector
    const sessionData = await browserbase.createSession(options);
      
    if (!sessionData || !sessionData.id) {
      throw new Error('Failed to create session via direct API');
    }
      
    console.log("[Session API] Session created via direct API:", sessionData);

    // Return response compatible with frontend expectations
    return NextResponse.json({
      success: true,
      sessionId: sessionData.id,
      sessionUrl: sessionData.debug_url, // Use debug_url or construct if needed
      contextId: options.contextId, // Get contextId from the original options
      settings: options.settings,
      connectUrl: sessionData.connect_url,
      debugUrl: sessionData.debug_url,
      wsUrl: sessionData.ws_url
    });

  } catch (error: any) {
    console.error("Error creating session via direct API:", error);
    
    // Provide more specific error feedback if possible
    let status = 500;
    let errorMessage = `Failed to create session: ${error.message}`;
    if (error.message.includes('ECONNREFUSED')) {
      status = 503;
      errorMessage = 'Service connection error. Please ensure Web UI backend is running.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: error.message // Include original error message for debugging
      },
      { status }
    );
  }
}

/**
 * End a browser session using the direct API connector
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId as string;
    
    const sessionError = validateSessionId(sessionId);
    if (sessionError) return sessionError;

    console.log("[Session API] Ending session via direct API:", sessionId);
    
    // Use the direct browserbase connector
    await browserbase.closeSession(); // Assumes connector manages the active session ID internally
      
    console.log("[Session API] Session ended successfully via direct API");

    return NextResponse.json({ 
      success: true,
      message: "Session ended successfully"
    });

  } catch (error: any) {
    console.error("Error ending session via direct API:", error);
    // Return success even on error for cleanup, but include warning
    return NextResponse.json(
      { 
        success: true, // Still report success for cleanup attempt
        message: "Session cleanup attempted (may have failed)",
        warning: `Failed to end session: ${error.message}` 
      },
      { status: 200 } // Return 200 OK even if cleanup failed
    );
  }
}
