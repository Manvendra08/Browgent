import { describe, it, expect, vi } from 'vitest';
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
});
