/**
 * Mock implementation of the Stagehand SDK
 * This redirects all calls to our bridge server
 */

import { WebUIConfig } from '../adapters/config';

// Get bridge server URL dynamically
async function getBridgeServerUrl(): Promise<string> {
  const bridgePort = await WebUIConfig.ports.bridge;
  return `http://localhost:${bridgePort}`;
}

// Supported tool types
const VALID_TOOLS = [
  'NAVIGATE',
  'CLICK',
  'TYPE',
  'SELECT',
  'SCROLL',
  'WAIT',
  'EXTRACT',
  'CLOSE'
] as const;

type ToolType = typeof VALID_TOOLS[number];

interface Step {
  tool: string;
  args: Record<string, any>;
  reason?: string;
  metadata?: Record<string, any>;
}

interface ValidatedStep extends Step {
  tool: ToolType;
}

interface StepResult {
  success: boolean;
  result: Step;
  error?: string;
}

interface StepContext {
  isFirstStep: boolean;
  lastStep?: Step;
  metadata?: Record<string, any>;
}

class StagehandMock {
  private currentGoal: string | null = null;
  private stepHistory: ValidatedStep[] = [];
  private goalMetadata: Record<string, any> = {};

  private validateTool(tool: string): ToolType {
    const upperTool = tool.toUpperCase() as ToolType;
    if (!VALID_TOOLS.includes(upperTool)) {
      throw new Error(`Invalid tool type: ${tool}. Must be one of: ${VALID_TOOLS.join(', ')}`);
    }
    return upperTool;
  }

  private validateStep(step: Step): ValidatedStep {
    // Validate tool type
    const validatedTool = this.validateTool(step.tool);

    // Validate arguments based on tool type
    const args = step.args || {};
    switch (validatedTool) {
      case 'NAVIGATE':
        if (!args.url || typeof args.url !== 'string') {
          throw new Error('NAVIGATE step requires a valid url argument');
        }
        break;
      case 'CLICK':
        if (!args.selector && !args.text) {
          throw new Error('CLICK step requires either selector or text argument');
        }
        break;
      case 'TYPE':
        if (!args.text || typeof args.text !== 'string') {
          throw new Error('TYPE step requires a valid text argument');
        }
        if (!args.selector && !args.label) {
          throw new Error('TYPE step requires either selector or label argument');
        }
        break;
      case 'SELECT':
        if (!args.value) {
          throw new Error('SELECT step requires a value argument');
        }
        if (!args.selector && !args.label) {
          throw new Error('SELECT step requires either selector or label argument');
        }
        break;
    }

    return {
      tool: validatedTool,
      args,
      reason: step.reason || 'Executing next action',
      metadata: step.metadata
    };
  }

  setGoalMetadata(metadata: Record<string, any>): void {
    this.goalMetadata = metadata;
  }

  async getNextStep(goal: string, previousSteps: Step[] = []): Promise<ValidatedStep> {
    try {
      // Update current goal if it's different
      if (this.currentGoal !== goal) {
        this.currentGoal = goal;
        this.stepHistory = [];
      }

      // Add any new validated previous steps to history
      const newSteps = previousSteps.filter(step => 
        !this.stepHistory.some(histStep => 
          histStep.tool === step.tool.toUpperCase() && 
          JSON.stringify(histStep.args) === JSON.stringify(step.args)
        )
      ).map(step => this.validateStep(step));

      this.stepHistory.push(...newSteps);

      // Prepare context for intent request
      const context: StepContext = {
        isFirstStep: this.stepHistory.length === 0,
        lastStep: this.stepHistory[this.stepHistory.length - 1],
        metadata: this.goalMetadata
      };

      const bridgeUrl = await getBridgeServerUrl();
      const response = await fetch(`${bridgeUrl}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          previousSteps: this.stepHistory,
          context
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get next step: ${response.statusText}`);
      }
      
      const data: StepResult = await response.json();
      
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Failed to get valid step from server');
      }

      // Validate and normalize the step
      const validatedStep = this.validateStep(data.result);
      
      // Add to history unless it's a CLOSE step
      if (validatedStep.tool !== 'CLOSE') {
        this.stepHistory.push(validatedStep);
      }

      return validatedStep;
    } catch (error: any) {
      console.error('Error getting next step:', error);
      throw new Error(`Failed to get next step: ${error?.message || 'Unknown error'}`);
    }
  }

  clearHistory(): void {
    this.currentGoal = null;
    this.stepHistory = [];
    this.goalMetadata = {};
  }

  getHistory(): ValidatedStep[] {
    return [...this.stepHistory];
  }
}

export const stagehand = new StagehandMock();

/**
 * Mock implementation of the handleIntent function from @browserbase/stagehand/intent
 * This is used for the initial step when starting a new goal
 */
export async function handleIntent(goal: string, stagehandInstance: StagehandMock): Promise<ValidatedStep> {
  try {
    // Clear any existing history when handling a new intent
    stagehandInstance.clearHistory();
    
    const bridgeUrl = await getBridgeServerUrl();
    const response = await fetch(`${bridgeUrl}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        goal,
        context: {
          isFirstStep: true,
          metadata: stagehandInstance['goalMetadata'] // Access private field
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to handle intent: ${response.statusText}`);
    }
    
    const data: StepResult = await response.json();
    
    if (!data.success || !data.result) {
      throw new Error(data.error || 'Failed to get valid step from server');
    }

    // Validate and normalize the step
    return stagehandInstance['validateStep'](data.result); // Access private method
  } catch (error: any) {
    console.error('Error handling intent:', error);
    throw new Error(`Failed to handle intent: ${error?.message || 'Unknown error'}`);
  }
}
