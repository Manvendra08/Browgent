import { describe, it, expect } from 'vitest';
import { parseModelResponse } from '../../src/background/llm/client';

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

  it('extracts batch of multiple actions from actions array', () => {    const output = `
\`\`\`json
{
  "thought": "I will select the radio option then click submit.",
  "actions": [
    { "action": "click", "elementId": 3 },
    { "action": "wait", "seconds": 0.5 },
    { "action": "click", "elementId": 5 }
  ]
}
\`\`\``;
    const decision = parseModelResponse(output);
    expect(decision.thought).toBe('I will select the radio option then click submit.');
    expect(decision.actions).toBeDefined();
    expect(decision.actions?.length).toBe(3);
    expect(decision.actions?.[0]).toEqual({ action: 'click', elementId: 3 });
    expect(decision.actions?.[1]).toEqual({ action: 'wait', seconds: 0.5 });
    expect(decision.actions?.[2]).toEqual({ action: 'click', elementId: 5 });
  });

  it('accepts the "index" alias for elementId so a prompt-shaped response never breaks the run', () => {
    const output = `
\`\`\`json
{
  "thought": "Batching the radio click and submit.",
  "actions": [
    { "action": "click", "index": 4 },
    { "action": "click", "index": 12 }
  ]
}
\`\`\``;
    const decision = parseModelResponse(output);
    expect(decision.actions?.[0]).toEqual({ action: 'click', elementId: 4 });
    expect(decision.actions?.[1]).toEqual({ action: 'click', elementId: 12 });
  });

  it('throws a named ActionParseError for an unusable action payload', () => {
    const output = '```json\n{ "thought": "click something", "action": { "action": "click" } }\n```';
    expect(() => parseModelResponse(output)).toThrowError(/elementId/);
    try {
      parseModelResponse(output);
    } catch (err) {
      expect((err as Error).name).toBe('ActionParseError');
    }
  });
});
