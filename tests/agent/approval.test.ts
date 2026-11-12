import { describe, it, expect } from 'vitest';
import { evaluateDestructiveAction } from '../../src/background/approval';
import { AgentAction } from '../../src/background/types';
import { PerceivedElement } from '../../src/content/types';

describe('evaluateDestructiveAction', () => {
  const sampleElements: PerceivedElement[] = [
    {
      id: 1,
      tagName: 'BUTTON',
      text: 'Pay Now $99.00',
      rect: { x: 0, y: 0, width: 100, height: 40 },
    },
    {
      id: 2,
      tagName: 'BUTTON',
      text: 'Delete Account',
      rect: { x: 0, y: 50, width: 100, height: 40 },
    },
    {
      id: 3,
      tagName: 'BUTTON',
      text: 'Search',
      rect: { x: 0, y: 100, width: 100, height: 40 },
    },
    {
      id: 4,
      tagName: 'BUTTON',
      text: 'Remove Filter',
      rect: { x: 0, y: 150, width: 100, height: 40 },
    },
    {
      id: 5,
      tagName: 'A',
      text: 'Cancel Subscription',
      rect: { x: 0, y: 200, width: 120, height: 30 },
    },
    {
      id: 6,
      tagName: 'BUTTON',
      text: 'Place Order',
      ariaLabel: 'Complete purchase and place order',
      rect: { x: 0, y: 250, width: 120, height: 40 },
    },
    {
      id: 7,
      tagName: 'BUTTON',
      text: 'Permanently Delete All Files',
      rect: { x: 0, y: 300, width: 150, height: 40 },
    },
    {
      id: 8,
      tagName: 'BUTTON',
      text: 'Wire Transfer',
      rect: { x: 0, y: 350, width: 120, height: 40 },
    },
  ];

  it('detects payment and checkout actions as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 1 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
    expect(result.reason).toContain('Pay Now');
  });

  it('detects place order / purchase as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 6 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
    expect(result.reason?.toLowerCase()).toContain('order');
  });

  it('detects account and data deletion as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 2 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
    expect(result.reason).toContain('Delete Account');
  });

  it('detects permanent deletion as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 7 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
  });

  it('detects subscription cancellation as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 5 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
    expect(result.reason).toContain('Cancel Subscription');
  });

  it('detects fund transfers as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 8 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(true);
  });

  it('does NOT flag benign search clicks as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 3 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(false);
  });

  it('does NOT flag benign UI operations like "Remove Filter" as destructive', () => {
    const action: AgentAction = { action: 'click', elementId: 4 };
    const result = evaluateDestructiveAction(action, sampleElements);

    expect(result.isDestructive).toBe(false);
  });

  it('does NOT flag scroll, wait, or finish actions as destructive', () => {
    expect(evaluateDestructiveAction({ action: 'scroll', direction: 'down' }).isDestructive).toBe(false);
    expect(evaluateDestructiveAction({ action: 'wait', seconds: 5 }).isDestructive).toBe(false);
    expect(evaluateDestructiveAction({ action: 'finish', summary: 'Done' }).isDestructive).toBe(false);
  });
});
