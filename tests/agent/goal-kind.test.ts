import { describe, it, expect } from 'vitest';
import { classifyGoalKind } from '../../src/background/agent';

describe('classifyGoalKind', () => {
  it('treats informational goals as questions', () => {
    expect(classifyGoalKind('Why is linkedin showing me legal jobs?')).toBe('question');
    expect(classifyGoalKind('summarize this page')).toBe('question');
    expect(classifyGoalKind('explain what this chart shows')).toBe('question');
    expect(classifyGoalKind('what is the price')).toBe('question');
  });

  it('treats page-mutating goals as actions', () => {
    expect(classifyGoalKind('complete the course')).toBe('action');
    expect(classifyGoalKind('apply to the head of legal role')).toBe('action');
    expect(classifyGoalKind('type my email into the signup form')).toBe('action');
  });

  it('keeps action intent when the goal also asks a question', () => {
    expect(classifyGoalKind('click submit and tell me what happens')).toBe('action');
    expect(classifyGoalKind('fill the form, then explain the result')).toBe('action');
  });

  it('defaults unrecognised goals to action so the gate stays fail-closed', () => {
    expect(classifyGoalKind('linkedin jobs legal')).toBe('action');
    expect(classifyGoalKind('')).toBe('action');
  });
});
