import { describe, it, expect } from 'vitest';
import { parseAgentAction } from '../../src/background/actions';

describe('Action Parser', () => {
  it('parses valid click action JSON', () => {
    const raw = JSON.stringify({ action: 'click', elementId: 3 });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'click', elementId: 3 });
  });

  it('parses type action with enter flag', () => {
    const raw = JSON.stringify({ action: 'type', elementId: 1, text: 'headphones', pressEnter: true });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'type', elementId: 1, text: 'headphones', pressEnter: true });
  });

  it('parses scroll action with defaults', () => {
    const raw = JSON.stringify({ action: 'scroll', direction: 'down' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'scroll', direction: 'down', amount: 500 });
  });

  it('parses navigate action', () => {
    const raw = JSON.stringify({ action: 'navigate', url: 'https://example.com' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'navigate', url: 'https://example.com' });
  });

  it('parses terminal finish action', () => {
    const raw = JSON.stringify({ action: 'finish', summary: 'Found the product price: $99' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'finish', summary: 'Found the product price: $99' });
  });

  it('extracts embedded JSON from markdown code fences', () => {
    const raw = `Here is my thought.
\`\`\`json
{
  "action": "click",
  "elementId": 7
}
\`\`\``;
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'click', elementId: 7 });
  });

  it('rejects invalid action schemas gracefully', () => {
    expect(() => parseAgentAction('invalid json')).toThrow();
    expect(() => parseAgentAction(JSON.stringify({ action: 'unknown_action' }))).toThrow();
  });

  it('parses mcp_call action with tool and args', () => {
    const raw = JSON.stringify({
      action: 'mcp_call',
      tool: 'weather.lookup',
      args: { city: 'Tokyo' },
    });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({
      action: 'mcp_call',
      tool: 'weather.lookup',
      args: { city: 'Tokyo' },
    });
  });

  it('defaults mcp_call args to empty object and rejects invalid shapes', () => {
    expect(parseAgentAction(JSON.stringify({ action: 'mcp_call', tool: 'search' }))).toEqual({
      action: 'mcp_call',
      tool: 'search',
      args: {},
    });
    expect(() => parseAgentAction(JSON.stringify({ action: 'mcp_call' }))).toThrow();
    expect(() => parseAgentAction(JSON.stringify({ action: 'mcp_call', tool: 'x', args: [1] }))).toThrow();
  });
});
