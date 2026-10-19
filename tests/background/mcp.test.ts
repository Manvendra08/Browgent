import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentController } from '../../src/background/agent';
import { McpClient } from '../../src/background/mcp/client';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM, queryLLMRaw } from '../../src/background/llm/client';

const mockedQueryLLM = vi.mocked(queryLLM);
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AgentController MCP dispatch', () => {
  it('executes registered MCP tool calls through the MCP client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { tools: [{ name: 'weather.lookup', description: 'Weather lookup', inputSchema: { type: 'object' } }] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mockedQueryLLMRaw.mockResolvedValue('```json\n{"confirmed": true, "evidence": "Result displayed on page"}\n```');

    const events: Array<{ type: string; data?: unknown }> = [];

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 3,
      mcpEndpoint: 'http://localhost:3000/mcp',
    });

    mockedQueryLLM
      .mockResolvedValueOnce({
        thought: 'Checking the weather via MCP tool',
        action: { action: 'mcp_call', tool: 'weather.lookup', args: { city: 'Tokyo' } },
      })
      .mockResolvedValueOnce({
        thought: 'Done',
        action: { action: 'finish', summary: 'Weather looked up' },
      });

    const result = await controller.run(1, 'check weather', (event) => events.push(event));

    expect(result.success).toBe(true);
    const callBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    const toolCall = callBodies.find((b) => b.method === 'tools/call');
    expect(toolCall).toBeTruthy();
    expect(toolCall.params.name).toBe('weather.lookup');
    expect(toolCall.params.arguments).toEqual({ city: 'Tokyo' });

    const actionResultEvents = events.filter((e) => e.type === 'action_result');
    expect(actionResultEvents.length).toBeGreaterThan(0);
  });

  it('returns a clean failure when an MCP tool is called without an endpoint', async () => {
    const events: Array<{ type: string; data?: unknown }> = [];

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 2,
    });

    mockedQueryLLM
      .mockResolvedValueOnce({
        thought: 'Trying MCP',
        action: { action: 'mcp_call', tool: 'some.tool', args: {} },
      })
      .mockResolvedValueOnce({
        thought: 'Retrying MCP',
        action: { action: 'mcp_call', tool: 'some.tool', args: {} },
      });

    const result = await controller.run(1, 'do thing', (event) => events.push(event));

    // Agent should not crash — the mcp_call step fails gracefully, then budget exhausts
    expect(result.success).toBe(false);
    expect(result.error).toContain('Max step budget');
    const lastActionError = events.filter((e) => e.type === 'action_result').pop();
    expect((lastActionError?.data as { error: string }).error).toContain('no MCP endpoint is configured');
  });
});

describe('McpClient handshake', () => {
  it('sends initialize + initialized notification and carries the session id', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.method === 'initialize') {
        return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } }), {
          status: 200,
          headers: { 'mcp-session-id': 'sess-123' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new McpClient('http://localhost:3000/mcp');
    await client.listTools();
    await client.callTool('ping', {});

    const methods = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).method);
    expect(methods[0]).toBe('initialize');
    expect(methods[1]).toBe('notifications/initialized');
    expect(methods[2]).toBe('tools/list');
    expect(methods[3]).toBe('tools/call');

    const toolCallHeaders = (fetchMock.mock.calls[3][1] as RequestInit).headers as Record<string, string>;
    expect(toolCallHeaders['Mcp-Session-Id']).toBe('sess-123');
  });
});
