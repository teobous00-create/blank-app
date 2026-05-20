export type AgentStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'executing'
  | 'waiting_confirmation'
  | 'done'
  | 'failed';

export type ActionType =
  | 'tap'
  | 'type'
  | 'scroll_down'
  | 'scroll_up'
  | 'wait'
  | 'done'
  | 'failed'
  | 'confirm_with_user';

export interface ActionResult {
  action: ActionType;
  target_text?: string;
  coordinates?: { x: number; y: number };
  type_value?: string;
  reason: string;
  confidence: number;
}

export interface IntentPlan {
  goal: string;
  app_package: string | null;
  steps: string[];
}

export interface AgentState {
  status: AgentStatus;
  goal: string;
  steps: string[];
  completedSteps: string[];
  actionCount: number;
  currentStep: string;
  lastError: string | null;
  confirmationMessage: string | null;
}

export interface ActionLog {
  timestamp: number;
  action: ActionType;
  detail: string;
  success: boolean;
}
