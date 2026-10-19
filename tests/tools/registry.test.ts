import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/background/tools/registry';

describe('Tool Registry', () => {
  it('registers core browser tools by default', () => {
    const registry = new ToolRegistry();
    const tools = registry.getDefinitions();
    const names = tools.map((t) => t.name);

    expect(names).toContain('click');
    expect(names).toContain('type');
    expect(names).toContain('scroll');
    expect(names).toContain('navigate');
    expect(names).toContain('wait');
    expect(names).toContain('finish');
  });

  it('allows registering external MCP tools', () => {
    const registry = new ToolRegistry();
    registry.registerMcpTool({
      name: 'notion_search',
      description: 'Search Notion workspace pages',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    });

    const tool = registry.getTool('notion_search');
    expect(tool).toBeDefined();
    expect(tool?.isMcp).toBe(true);
  });

  it('formats tool instructions for LLM system prompt', () => {
    const registry = new ToolRegistry();
    const promptDoc = registry.formatPromptDocumentation();

    expect(promptDoc).toContain('click');
    expect(promptDoc).toContain('type');
    expect(promptDoc).toContain('finish');
  });
});
