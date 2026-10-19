export type ActionType = 'click' | 'type' | 'scroll' | 'navigate' | 'wait' | 'finish' | 'fail';

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

export type AgentAction =
  | ClickAction
  | TypeAction
  | ScrollAction
  | NavigateAction
  | WaitAction
  | FinishAction
  | FailAction;

export interface ActionResult {
  success: boolean;
  error?: string;
  isTerminal?: boolean;
  summary?: string;
}
