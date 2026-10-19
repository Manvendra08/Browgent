import { McpToolDefinition } from '../mcp/client';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  isMcp?: boolean;
}

export const CORE_BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'click',
    description: 'Click on a visible interactive element identified by its numeric ID.',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'number', description: 'The numeric ID of the element to click (e.g. 5)' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input field or textarea identified by its numeric ID.',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'number', description: 'The numeric ID of the input element' },
        text: { type: 'string', description: 'The string text to type into the field' },
        pressEnter: { type: 'boolean', description: 'Whether to press Enter after typing' },
      },
      required: ['elementId', 'text'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the active webpage viewport up or down.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Pixel distance to scroll (default 500)' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the active tab to a target HTTP or HTTPS URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'wait',
    description: 'Pause execution for a given number of seconds to allow async operations or page loading.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Seconds to wait (default 2)' },
      },
    },
  },
  {
    name: 'finish',
    description: 'Declare the user goal successfully completed with a summary of the outcome.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Detailed summary of findings, data extracted, or actions completed' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'fail',
    description: 'Declare that the goal cannot be completed with an explanation.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for task failure or blockage' },
      },
      required: ['reason'],
    },
  },
];

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerCoreTools();
  }

  private registerCoreTools(): void {
    CORE_BROWSER_TOOLS.forEach((tool) => {
      this.tools.set(tool.name, tool);
    });
  }

  public registerMcpTool(mcpTool: McpToolDefinition): void {
    this.tools.set(mcpTool.name, {
      name: mcpTool.name,
      description: mcpTool.description || 'External MCP tool',
      parameters: (mcpTool.parameters || mcpTool.inputSchema || { type: 'object' }) as Record<string, unknown>,
      isMcp: true,
    });
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public formatPromptDocumentation(): string {
    const list = Array.from(this.tools.values()).map((tool) => {
      const paramStr = JSON.stringify(tool.parameters);
      return `- **${tool.name}**${tool.isMcp ? ' [MCP Tool]' : ''}: ${tool.description}\n  Schema: ${paramStr}`;
    });

    return `Available Tools:\n${list.join('\n')}`;
  }
}
