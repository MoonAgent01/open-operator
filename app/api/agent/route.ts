import { NextResponse } from 'next/server';
import { stagehand, handleIntent } from '../../lib/stagehand-mock';
import { browserbase } from '../../lib/browserbase-mock';
import { debuglog } from 'util';

const debug = debuglog('agent-route');

interface ViewportSettings {
  width: number;
  height: number;
}

interface StealthSettings {
  enabled?: boolean;
  solveCaptchas?: boolean;
  fingerprint?: {
    browsers?: string[];
    devices?: string[];
    locales?: string[];
    operatingSystems?: string[];
  };
}

interface SessionSettings {
  viewport?: ViewportSettings;
  stealth?: StealthSettings;
  headless?: boolean;
  timeout?: number;
  metadata?: Record<string, any>;
}

interface Step {
  tool: string;
  args: Record<string, any>;
  reason?: string;
  metadata?: Record<string, any>;
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

// Helper function to check session status
async function checkSessionStatus(sessionId: string): Promise<boolean> {
  try {
    return await browserbase.checkSession(sessionId);
  } catch {
    return false;
  }
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { goal, sessionId, previousSteps = [], action, settings = {} } = body;

    debug('Processing request:', { action, sessionId, goal });
    
    // Validate session for all actions except START
    if (action !== 'START') {
      const sessionError = validateSession(sessionId);
      if (sessionError) return sessionError;

      // Check if session is still active
      const isActive = await checkSessionStatus(sessionId);
      if (!isActive) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Session is no longer active' 
          },
          { status: 400 }
        );
      }
    }

    // Handle different action types
    switch (action) {
      case 'START': {
        const goalError = validateGoal(goal);
        if (goalError) return goalError;

        debug('Starting new goal:', goal);
        
        try {
          // Set metadata for the goal if provided
          if (settings.metadata) {
            stagehand.setGoalMetadata(settings.metadata);
          }

          // Create a new session with enhanced settings
          const session = await browserbase.createSession({
            contextId: goal.substring(0, 32), // Use truncated goal as context ID
            settings: {
              viewport: settings.viewport,
              stealth: {
                enabled: true,
                solveCaptchas: true,
                fingerprint: settings.stealth?.fingerprint
              },
              headless: settings.headless ?? false,
              timeout: settings.timeout || 30000,
              metadata: settings.metadata
            }
          });

          // Start processing the intent
          const firstStep = await handleIntent(goal, stagehand);
          
          debug('Session created and first step generated:', {
            sessionId: session.id,
            step: firstStep
          });

          return NextResponse.json({ 
            success: true,
            sessionId: session.id,
            result: firstStep,
            steps: [firstStep],
            done: false,
            debugUrl: session.debugUrl
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

        debug('Getting next step:', { goal, previousSteps });

        try {
          // Get next action from Stagehand
          const nextStep = await stagehand.getNextStep(goal, previousSteps);
          const allSteps = stagehand.getHistory();
          
          debug('Next step generated:', nextStep);
          
          return NextResponse.json({
            success: true,
            result: nextStep,
            steps: allSteps,
            done: nextStep.tool === "CLOSE"
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

        debug('Executing step:', { sessionId, step });

        try {
          // Execute the step using Browserbase
          const extraction = await browserbase.executeStep(sessionId, step);

          debug('Step execution result:', extraction);

          return NextResponse.json({
            success: true,
            extraction,
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
