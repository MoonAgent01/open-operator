import { NextRequest, NextResponse } from 'next/server';

// Define the supported step types
interface Step {
  tool: string;
  args: Record<string, any>;
  text: string;
  reasoning: string;
  instruction: string;
}

// Helper function to validate session ID
function validateSession(sessionId: string | undefined): NextResponse | null {
  if (!sessionId) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Missing sessionId in request body' 
      },
      { status: 400 }
    );
  }
  return null;
}

// Helper function to validate goal
function validateGoal(goal: string | undefined): NextResponse | null {
  if (!goal) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Missing goal in request body' 
      },
      { status: 400 }
    );
  }
  return null;
}

// Helper function to validate step
function validateStep(step: Step | undefined): NextResponse | null {
  if (!step || !step.tool) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Missing or invalid step in request body' 
      },
      { status: 400 }
    );
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ 
    success: true,
    message: 'Agent API endpoint ready',
    version: '1.0.0',
    supportedTools: [
      'NAVIGATE',
      'CLICK',
      'TYPE',
      'SELECT',
      'SCROLL',
      'WAIT',
      'EXTRACT',
      'CLOSE'
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal, sessionId, previousSteps = [], action } = body;
    
    // Validate session for all actions except START
    if (action !== 'START') {
      const sessionError = validateSession(sessionId);
      if (sessionError) return sessionError;
    }

    // Handle different action types
    switch (action) {
      case 'START': {
        const goalError = validateGoal(goal);
        if (goalError) return goalError;

        console.log('Starting new session for goal:', goal);

        try {
          // Create a session by calling the bridge server
          const sessionResponse = await fetch('http://localhost:7789/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contextId: goal,
              timezone: 'UTC',
              settings: {
                browserSettings: {
                  headless: false,
                  useExistingBrowser: false,
                  keepBrowserOpen: true,
                  keepBrowserOpenBetweenTasks: true,
                  windowSize: { width: 1366, height: 768 },
                  showBrowser: true,
                  useOwnBrowser: false
                },
                metadata: { source: 'open-operator', version: '1.0.0' }
              }
            }),
          });

          const sessionData = await sessionResponse.json();
          
          if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create session');
          }

          console.log('Session created:', sessionData);

          // Get first step from bridge server
          const intentResponse = await fetch('http://localhost:7789/intent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              goal: goal,
              context: { isFirstStep: true }
            }),
          });

          const intentData = await intentResponse.json();
          
          if (!intentData.success) {
            throw new Error(intentData.error || 'Failed to get initial step');
          }

          return NextResponse.json({
            success: true,
            sessionId: sessionData.sessionId,
            result: intentData.result,
            steps: [intentData.result],
            done: false,
            sessionUrl: sessionData.sessionUrl,
            debugUrl: sessionData.debugUrl
          });
        } catch (error: any) {
          console.error('Error starting session:', error);
          return NextResponse.json(
            { 
              success: false,
              error: `Failed to start session: ${error.message}` 
            },
            { status: 500 }
          );
        }
      }

      case 'GET_NEXT_STEP': {
        const goalError = validateGoal(goal);
        if (goalError) return goalError;

        console.log('Getting next step for:', { goal, sessionId });
        console.log('Previous steps:', previousSteps);

        try {
          // Get next action from bridge server
          const intentResponse = await fetch('http://localhost:7789/intent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              goal,
              previousSteps,
              sessionId
            }),
          });

          const intentData = await intentResponse.json();
          
          if (!intentData.success) {
            throw new Error(intentData.error || 'Failed to get next step');
          }

          return NextResponse.json({
            success: true,
            result: intentData.result,
            steps: [...previousSteps, intentData.result],
            done: intentData.result.tool === "CLOSE"
          });
        } catch (error: any) {
          console.error('Error getting next step:', error);
          return NextResponse.json(
            { 
              success: false,
              error: `Failed to get next step: ${error.message}` 
            },
            { status: 500 }
          );
        }
      }

      case 'EXECUTE_STEP': {
        const { step } = body;
        const stepError = validateStep(step);
        if (stepError) return stepError;

        console.log('Executing step:', { sessionId, step });

        try {
          // Execute step via bridge server
          const executeResponse = await fetch('http://localhost:7789/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId,
              step
            }),
          });

          const executeData = await executeResponse.json();
          
          if (!executeData.success) {
            throw new Error(executeData.error || 'Failed to execute step');
          }

          return NextResponse.json({
            success: true,
            extraction: executeData.extraction,
            done: step.tool === "CLOSE"
          });
        } catch (error: any) {
          console.error('Error executing step:', error);
          return NextResponse.json(
            { 
              success: false,
              error: `Failed to execute step: ${error.message}` 
            },
            { status: 500 }
          );
        }
      }

      default:
        console.error(`Invalid action type: ${action}`);
        return NextResponse.json(
          { 
            success: false,
            error: `Invalid action type. Must be one of: START, GET_NEXT_STEP, EXECUTE_STEP` 
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Unhandled error in agent endpoint:', error);
    return NextResponse.json(
      { 
        success: false,
        error: `Internal server error: ${error.message}` 
      },
      { status: 500 }
    );
  }
}
