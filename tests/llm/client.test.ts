import { describe, it, expect } from 'vitest';
import { parseModelResponse, resolveOmniRouteModel } from '../../src/background/llm/client';

describe('LLM Response Parser', () => {
  it('extracts thought and action from markdown JSON block', () => {
    const output = `I see the search box on the screen.
\`\`\`json
{
  "thought": "I will click the search button to submit.",
  "action": {
    "action": "click",
    "elementId": 5
  }
}
\`\`\``;
    const decision = parseModelResponse(output);
    expect(decision.thought).toBe('I will click the search button to submit.');
    expect(decision.action).toEqual({ action: 'click', elementId: 5 });
  });

  it('handles flat JSON structure gracefully', () => {
    const output = JSON.stringify({
      thought: 'Navigating to website',
      action: 'navigate',
      url: 'https://news.ycombinator.com',
    });
    const decision = parseModelResponse(output);
    expect(decision.thought).toBe('Navigating to website');
    expect(decision.action).toEqual({
      action: 'navigate',
      url: 'https://news.ycombinator.com',
    });
  });

  it('resolves OmniRoute model aliases correctly', () => {
    expect(resolveOmniRouteModel('free')).toBe('Claude/Free');
    expect(resolveOmniRouteModel('kilo')).toBe('Claude/Kilo-Models');
    expect(resolveOmniRouteModel('anti')).toBe('Claude/Antigravity');
    expect(resolveOmniRouteModel('gp')).toBe('Claude/GP-Models');
    expect(resolveOmniRouteModel('bigp')).toBe('oc/big-pickle');
    expect(resolveOmniRouteModel('glm')).toBe('Claude/GL-Deep-Kim');
    expect(resolveOmniRouteModel('custom-model')).toBe('custom-model');
    expect(resolveOmniRouteModel('')).toBe('Claude/Antigravity');
  });
});
