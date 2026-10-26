export type ActionType =
  | 'click'
  | 'type'
  | 'select_option'
  | 'press_key'
  | 'hover'
  | 'scroll'
  | 'navigate'
  | 'wait'
  | 'finish'
  | 'fail'
  | 'mcp_call';

export interface ClickAction {
  action: 'click';
  elementId: number;
}

export interface TypeAction {
  action: 'type';
  elementId: number;
  text: string;
  pressEnter?: boolean;
}

export interface SelectOptionAction {
  action: 'select_option';
  elementId: number;
  value: string;
}

export interface PressKeyAction {
  action: 'press_key';
  key: string;
}

export interface HoverAction {
  action: 'hover';
  elementId: number;
}

export interface ScrollAction {
  action: 'scroll';
  direction: 'up' | 'down';
  amount?: number;
}

export interface NavigateAction {
  action: 'navigate';
  url: string;
}

export interface WaitAction {
  action: 'wait';
  seconds?: number;
}

export interface FinishAction {
  action: 'finish';
  summary: string;
}

export interface FailAction {
  action: 'fail';
  reason: string;
}

export interface McpCallAction {
  action: 'mcp_call';
  tool: string;
  args?: Record<string, unknown>;
}

export type AgentAction =
  | ClickAction
  | TypeAction
  | SelectOptionAction
  | PressKeyAction
  | HoverAction
  | ScrollAction
  | NavigateAction
  | WaitAction
  | FinishAction
  | FailAction
  | McpCallAction;

export interface ActionResult {
  success: boolean;
  error?: string;
  isTerminal?: boolean;
  summary?: string;
  data?: unknown;
}

export interface StepTimings {
  totalMs: number;
  domMs: number;
  screenshotMs: number;
  llmMs: number;
  actionMs: number;
  settleMs: number;
}
