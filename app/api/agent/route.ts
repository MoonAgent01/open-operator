import { NextRequest, NextResponse } from 'next/server';
import browserbaseConnector from '../../adapters/bridge-server/browserbase-connector'; // Import the connector
// REMOVED: use_mcp_tool is globally available in the execution environment, no import needed.

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
          // Create session using the connector (which now uses MCP)
          const sessionInfo = await browserbaseConnector.createSession({
            contextId: goal,
            timezone: 'UTC', // Or get from request if needed
            // Pass other options if necessary (width, height, etc.)
          });
          
          const sessionId = sessionInfo.id;
          console.log('Session created via MCP connector:', sessionId);

          // Use Web UI's LLM to determine the first step
          const mcpResult = await use_mcp_tool({
            server_name: 'webui-browser',
            tool_name: 'determine_next_step',
            arguments: {
              session_id: sessionId,
              goal: goal,
              previous_steps: [] // No previous steps for first action
            }
          });

          if (!mcpResult || !mcpResult.tool) {
            throw new Error("Invalid first step returned from Web UI LLM");
          }

          // Convert MCP result to Step format
          const firstStep: Step = {
            tool: mcpResult.tool,
            args: mcpResult.args || {},
            text: mcpResult.text || `Execute ${mcpResult.tool}`,
            reasoning: mcpResult.reasoning || "Initial step determined by Web UI LLM",
            instruction: mcpResult.instruction || `Execute ${mcpResult.tool} with args: ${JSON.stringify(mcpResult.args)}`
          };

          return NextResponse.json({
            success: true,
            sessionId: sessionId,
            result: firstStep,
            steps: [firstStep],
            done: false,
            sessionUrl: sessionInfo.ws_url, // Use ws_url from connector
            debugUrl: sessionInfo.debug_url // Use debug_url from connector
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
          // Use the new MCP tool to determine the next step
          const mcpResult = await use_mcp_tool({
            server_name: 'webui-browser',
            tool_name: 'determine_next_step',
            arguments: {
              session_id: sessionId,
              goal: goal,
              previous_steps: previousSteps || []
            }
          });

          if (!mcpResult || !mcpResult.tool) {
            throw new Error("Invalid step returned from Web UI LLM");
          }

          // Convert MCP result to Step format if needed
          const nextAction: Step = {
            tool: mcpResult.tool,
            args: mcpResult.args || {},
            text: mcpResult.text || `Execute ${mcpResult.tool}`,
            reasoning: mcpResult.reasoning || "Determined by Web UI LLM",
            instruction: mcpResult.instruction || `Execute ${mcpResult.tool} with args: ${JSON.stringify(mcpResult.args)}`
          };

          // Check if this is a close session action
          const isTaskCompleted = nextAction.tool.toUpperCase() === 'CLOSE_SESSION';

          return NextResponse.json({
            success: true,
            result: nextAction,
            steps: [...previousSteps, nextAction],
            done: isTaskCompleted
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
          // Execute step using the connector (which now uses MCP)
          const executeResult = await browserbaseConnector.executeStep(sessionId, step);

          // The connector's executeStep now returns the direct result from the MCP tool
          // We need to adapt the response format if necessary.
          // Assuming the MCP tool result contains relevant info like 'extraction'.
          
          // Check if the tool executed was 'close_session'
          const isCloseTool = step.tool?.toLowerCase() === 'close_session';

          return NextResponse.json({
            success: true,
            // Pass through relevant parts of the MCP tool result
            extraction: executeResult.result?.extraction, // Example: pass extraction if present
            result: executeResult.result, // Pass the whole MCP result for potential use
            done: isCloseTool // Mark as done only if the tool was close_session
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
