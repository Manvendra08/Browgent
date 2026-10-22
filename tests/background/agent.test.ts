import { describe, it, expect } from 'vitest';
import { AgentController } from '../../src/background/agent';

describe('Agent Controller', () => {
  it('initializes in idle status', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });
    expect(controller.getStatus()).toBe('idle');
  });

  it('stops execution when stop() is called', async () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });

    controller.stop();
    expect(controller.getStatus()).toBe('stopped');
  });

  it('detects repeating loops and halts execution', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    const isLoop1 = controller.checkLoop({ action: 'click', elementId: 4 });
    const isLoop2 = controller.checkLoop({ action: 'click', elementId: 4 });
    const isLoop3 = controller.checkLoop({ action: 'click', elementId: 4 });

    expect(isLoop1).toBe(false);
    expect(isLoop2).toBe(false);
    expect(isLoop3).toBe(true);
  });

  it('does not flag consecutive scroll actions as loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    for (let i = 0; i < 5; i++) {
      expect(controller.checkLoop({ action: 'scroll', direction: 'down', amount: 500 })).toBe(false);
    }
  });

  it('does not flag consecutive wait actions as loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    for (let i = 0; i < 5; i++) {
      expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    }
  });

  it('detects trackable action loops even when non-trackable wait actions are interleaved', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(false);
    expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(false);
    expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(true);
  });

  it('detects alternating 2-action loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(true);
  });
});
