import {NativeModules} from 'react-native';
import {parseIntent, analyzeScreenAndAct} from './ClaudeService';
import {
  AgentState,
  AgentStatus,
  ActionLog,
  ActionResult,
  ActionType,
} from '../types';

const {ScreenCaptureModule, AccessibilityBridgeModule} = NativeModules;

const MAX_ACTIONS = 25;
const ACTION_DELAY_MS = 1500;

const CONFIRMATION_KEYWORDS = [
  'checkout',
  'pay',
  'confirm order',
  'place order',
  'proceed to checkout',
  'payment',
  'purchase',
];

function requiresConfirmation(text: string): boolean {
  const lower = text.toLowerCase();
  return CONFIRMATION_KEYWORDS.some(kw => lower.includes(kw));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type StatusListener = (state: AgentState) => void;

export class AgentController {
  private state: AgentState = {
    status: 'idle',
    goal: '',
    steps: [],
    completedSteps: [],
    actionCount: 0,
    currentStep: '',
    lastError: null,
    confirmationMessage: null,
  };

  private actionLog: ActionLog[] = [];
  private listeners: StatusListener[] = [];
  private stopped = false;
  private confirmResolve: ((confirmed: boolean) => void) | null = null;

  subscribe(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(patch: Partial<AgentState>) {
    this.state = {...this.state, ...patch};
    this.listeners.forEach(l => l({...this.state}));
  }

  getState(): AgentState {
    return {...this.state};
  }

  getLogs(): ActionLog[] {
    return [...this.actionLog];
  }

  stop() {
    this.stopped = true;
    this.confirmResolve?.(false);
    this.confirmResolve = null;
    this.emit({status: 'idle', goal: '', currentStep: '', confirmationMessage: null});
  }

  confirmAction(confirmed: boolean) {
    this.confirmResolve?.(confirmed);
    this.confirmResolve = null;
  }

  async run(voiceText: string): Promise<void> {
    this.stopped = false;
    this.actionLog = [];

    this.emit({
      status: 'thinking',
      goal: voiceText,
      steps: [],
      completedSteps: [],
      actionCount: 0,
      currentStep: 'Parsing command…',
      lastError: null,
      confirmationMessage: null,
    });

    // 1. Parse intent
    let plan;
    try {
      plan = await parseIntent(voiceText);
    } catch (e: any) {
      this.emit({status: 'failed', lastError: e.message});
      return;
    }

    if (this.stopped) return;

    this.emit({
      status: 'thinking',
      goal: plan.goal,
      steps: plan.steps,
      currentStep: plan.steps[0] ?? 'Starting…',
    });

    // 2. Agent loop
    let stepIndex = 0;
    const completedSteps: string[] = [];

    while (stepIndex < plan.steps.length && !this.stopped) {
      const currentStep = plan.steps[stepIndex];

      // Pre-check: does this step need confirmation?
      if (
        currentStep.startsWith('PAUSE_FOR_CONFIRMATION:') ||
        requiresConfirmation(currentStep)
      ) {
        const message = currentStep.replace('PAUSE_FOR_CONFIRMATION:', '').trim();
        const confirmed = await this.waitForConfirmation(message);
        if (!confirmed || this.stopped) {
          this.emit({status: 'failed', lastError: 'User cancelled at confirmation step'});
          return;
        }
      }

      if (this.stopped) return;

      this.emit({
        status: 'thinking',
        currentStep,
        completedSteps: [...completedSteps],
        actionCount: this.state.actionCount,
      });

      // Inner action loop for this step
      let stepDone = false;
      let stepFailed = false;

      while (!stepDone && !stepFailed && !this.stopped) {
        if (this.state.actionCount >= MAX_ACTIONS) {
          this.emit({status: 'failed', lastError: `Safety limit: max ${MAX_ACTIONS} actions reached`});
          return;
        }

        // Capture screenshot
        let screenshot: string;
        try {
          screenshot = await ScreenCaptureModule.captureScreen();
        } catch (e: any) {
          this.emit({status: 'failed', lastError: `Screenshot failed: ${e.message}`});
          return;
        }

        if (this.stopped) return;

        this.emit({status: 'thinking'});

        // Ask Claude what to do
        let action: ActionResult;
        try {
          action = await analyzeScreenAndAct(
            screenshot,
            plan.goal,
            completedSteps,
            currentStep,
          );
        } catch (e: any) {
          this.emit({status: 'failed', lastError: `Claude error: ${e.message}`});
          return;
        }

        if (this.stopped) return;

        this.log(action);
        this.emit({
          status: 'executing',
          actionCount: this.state.actionCount + 1,
        });

        // Handle confirm_with_user mid-loop
        if (action.action === 'confirm_with_user') {
          const confirmed = await this.waitForConfirmation(
            action.reason || 'About to proceed with a sensitive action.',
          );
          if (!confirmed || this.stopped) {
            this.emit({status: 'failed', lastError: 'User cancelled'});
            return;
          }
          continue;
        }

        if (action.action === 'done') {
          stepDone = true;
          completedSteps.push(currentStep);
          break;
        }

        if (action.action === 'failed') {
          stepFailed = true;
          this.emit({status: 'failed', lastError: action.reason || 'Agent could not complete step'});
          return;
        }

        // Execute the action
        await this.executeAction(action);
        await sleep(ACTION_DELAY_MS);
      }

      if (stepDone) {
        stepIndex++;
      }
    }

    if (!this.stopped) {
      this.emit({
        status: 'done',
        completedSteps,
        currentStep: 'Task completed!',
        confirmationMessage: null,
      });
    }
  }

  private async waitForConfirmation(message: string): Promise<boolean> {
    this.emit({
      status: 'waiting_confirmation',
      confirmationMessage: message,
    });

    return new Promise<boolean>(resolve => {
      this.confirmResolve = resolve;
    });
  }

  private async executeAction(action: ActionResult): Promise<void> {
    const {action: type, target_text, coordinates, type_value} = action;

    try {
      switch (type) {
        case 'tap':
          if (target_text) {
            await AccessibilityBridgeModule.tapByText(target_text);
          } else if (coordinates) {
            await AccessibilityBridgeModule.tapCoordinates(coordinates.x, coordinates.y);
          }
          break;

        case 'type':
          if (type_value !== undefined && type_value !== null) {
            await AccessibilityBridgeModule.typeText(target_text ?? '', type_value);
          }
          break;

        case 'scroll_down':
          await AccessibilityBridgeModule.scrollDown();
          break;

        case 'scroll_up':
          await AccessibilityBridgeModule.scrollUp();
          break;

        case 'wait':
          await sleep(2000);
          break;
      }
    } catch (e: any) {
      console.warn('executeAction error:', e.message);
    }
  }

  private log(action: ActionResult) {
    const entry: ActionLog = {
      timestamp: Date.now(),
      action: action.action,
      detail: action.reason,
      success: true,
    };
    this.actionLog.push(entry);
    console.log(`[AgentLog] ${new Date(entry.timestamp).toISOString()} | ${action.action} | ${action.reason}`);
  }
}

export const agentController = new AgentController();
