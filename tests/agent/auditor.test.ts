import { describe, it, expect } from 'vitest';
import { AuditorReflectionGate } from '../../src/background/auditor';
import { DOMState } from '../../src/content/types';

describe('AuditorReflectionGate', () => {
  const gate = new AuditorReflectionGate();

  const mockDOM: DOMState = {
    url: 'https://example.com/checkout',
    title: 'Checkout Page',
    elements: [
      {
        id: 1,
        tagName: 'INPUT',
        role: 'textbox',
        text: '',
        label: 'Email',
        rect: { x: 0, y: 0, width: 100, height: 20 },
      },
      {
        id: 2,
        tagName: 'BUTTON',
        role: 'button',
        text: 'Pay Now',
        disabled: true,
        rect: { x: 0, y: 30, width: 80, height: 25 },
      },
      {
        id: 3,
        tagName: 'BUTTON',
        role: 'button',
        text: 'Continue',
        disabled: false,
        rect: { x: 0, y: 60, width: 80, height: 25 },
      },
    ],
    formattedPrompt: '[1] input "Email"\n[2] button "Pay Now" [disabled]\n[3] button "Continue"',
    textExcerpt: 'Please complete your payment.',
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0, atBottom: false },
  };

  describe('Element Recovery & Stale Reference Check', () => {
    it('approves action when target element exists and is enabled', async () => {
      const verdict = await gate.reflect({
        goal: 'click continue',
        goalKind: 'action',
        action: { action: 'click', elementId: 3 },
        thought: 'Clicking continue',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('approved');
    });

    it('rejects action when target element is disabled', async () => {
      const verdict = await gate.reflect({
        goal: 'pay now',
        goalKind: 'action',
        action: { action: 'click', elementId: 2 },
        thought: 'Submitting payment',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('disabled');
      expect(verdict.correctionHint).toBeDefined();
    });

    it('rejects invalid elementId (e.g. 0 or negative)', async () => {
      const verdict = await gate.reflect({
        goal: 'click something',
        goalKind: 'action',
        action: { action: 'click', elementId: 0 },
        thought: 'Trying element 0',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Invalid element ID [0]');
    });

    it('identifies stale element reference and suggests substitute', async () => {
      const verdict = await gate.reflect({
        goal: 'enter email address',
        goalKind: 'action',
        action: { action: 'type', elementId: 99, text: 'user@example.com' },
        thought: 'Typing email',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Stale element reference');
      expect(verdict.suggestedAction).toEqual({
        action: 'type',
        elementId: 1,
        text: 'user@example.com',
      });
    });

    it('identifies stale element reference for click using initialElement fingerprint', async () => {
      const initialElements = [
        { id: 12, tagName: 'BUTTON', role: 'button', text: 'Continue', rect: { x: 0, y: 0, width: 80, height: 25 } },
      ];
      const verdict = await gate.reflect({
        goal: 'proceed',
        goalKind: 'action',
        action: { action: 'click', elementId: 12 },
        thought: 'Clicking continue',
        domState: mockDOM,
        elements: mockDOM.elements,
        initialElements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Stale element reference');
      expect(verdict.suggestedAction).toEqual({
        action: 'click',
        elementId: 3,
      });
    });

    it('identifies stale element reference using explicit expectedText anchor', async () => {
      const verdict = await gate.reflect({
        goal: 'proceed',
        goalKind: 'action',
        action: { action: 'click', elementId: 88, expectedText: 'Continue', tag: 'button' } as any,
        thought: 'Clicking continue button',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.suggestedAction).toEqual(expect.objectContaining({
        action: 'click',
        elementId: 3,
      }));
    });

    it('identifies stale element reference for select_option using label anchor', async () => {
      const selectDOM: DOMState = {
        ...mockDOM,
        elements: [
          ...mockDOM.elements,
          {
            id: 10,
            tagName: 'SELECT',
            label: 'Country',
            text: '',
            rect: { x: 0, y: 0, width: 100, height: 25 },
          },
        ],
      };
      const verdict = await gate.reflect({
        goal: 'choose country',
        goalKind: 'action',
        action: { action: 'select_option', elementId: 99, value: 'US', targetLabel: 'Country' } as any,
        thought: 'Selecting country',
        domState: selectDOM,
        elements: selectDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.suggestedAction).toEqual(expect.objectContaining({
        action: 'select_option',
        elementId: 10,
        value: 'US',
      }));
    });
  });

  describe('Action Drift & Boundary Check', () => {
    it('rejects navigation to restricted internal urls', async () => {
      const verdict = await gate.reflect({
        goal: 'open chrome settings',
        goalKind: 'action',
        action: { action: 'navigate', url: 'chrome://settings' },
        thought: 'Opening settings',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('restricted URL');
    });

    it('rejects redundant same-url navigation', async () => {
      const verdict = await gate.reflect({
        goal: 'go to checkout',
        goalKind: 'action',
        action: { action: 'navigate', url: 'https://example.com/checkout/' },
        thought: 'Reloading checkout',
        domState: mockDOM,
        elements: mockDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Redundant navigation');
    });

    it('rejects downward scroll when already at bottom of page', async () => {
      const bottomDOM: DOMState = {
        ...mockDOM,
        viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 1000, atBottom: true },
      };

      const verdict = await gate.reflect({
        goal: 'scroll down',
        goalKind: 'action',
        action: { action: 'scroll', direction: 'down' },
        thought: 'Scrolling further',
        domState: bottomDOM,
        elements: bottomDOM.elements,
        stepNumber: 1,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('already at the bottom');
    });

    it('rejects excessive consecutive waits', async () => {
      const verdict = await gate.reflect({
        goal: 'wait for something',
        goalKind: 'action',
        action: { action: 'wait', seconds: 2 },
        thought: 'Waiting again',
        domState: mockDOM,
        elements: mockDOM.elements,
        actionHistory: [
          { action: 'wait', seconds: 2 },
          { action: 'wait', seconds: 2 },
        ],
        stepNumber: 3,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Excessive consecutive wait');
    });

    it('rejects oscillating action loops (A -> B -> A -> B)', async () => {
      const actionA = { action: 'click' as const, elementId: 1 };
      const actionB = { action: 'click' as const, elementId: 3 };

      const verdict = await gate.reflect({
        goal: 'toggle options',
        goalKind: 'action',
        action: actionB,
        thought: 'Toggling back',
        domState: mockDOM,
        elements: mockDOM.elements,
        actionHistory: [actionA, actionB, actionA],
        stepNumber: 4,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('Oscillating action loop detected');
    });
  });

  describe('Goal Satisfaction & Early Finish Check', () => {
    it('detects on-page confirmation and returns early_finish verdict', async () => {
      const successDOM: DOMState = {
        ...mockDOM,
        textExcerpt: 'Thank you for your order! Your confirmation # is 12345.',
      };

      const verdict = await gate.reflect({
        goal: 'complete order',
        goalKind: 'action',
        action: { action: 'click', elementId: 3 },
        thought: 'Clicking button',
        domState: successDOM,
        elements: successDOM.elements,
        stepNumber: 2,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('early_finish');
      expect(verdict.reason).toContain('Goal satisfaction detected');
      expect(verdict.suggestedAction?.action).toBe('finish');
    });

    it('blocks finish when active form validation errors are present', async () => {
      const errorDOM: DOMState = {
        ...mockDOM,
        validationErrors: ['Please fill in credit card number', 'Postal code required'],
      };

      const verdict = await gate.reflect({
        goal: 'submit form',
        goalKind: 'action',
        action: { action: 'finish', summary: 'I submitted the form' },
        thought: 'Finishing up',
        domState: errorDOM,
        elements: errorDOM.elements,
        stepNumber: 3,
        maxSteps: 10,
      });

      expect(verdict.status).toBe('rejected');
      expect(verdict.reason).toContain('form validation errors detected');
    });
  });
});
