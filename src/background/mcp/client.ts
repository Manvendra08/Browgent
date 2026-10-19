export interface McpToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
}

export class McpClient {
  private endpointUrl: string;

  constructor(endpointUrl: string) {
    this.endpointUrl = endpointUrl.trim();
  }

  public getUrl(): string {
    return this.endpointUrl;
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    if (!this.endpointUrl) {
      return [];
    }

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`MCP list tools HTTP error: ${response.status}`);
      }

      const data = await response.json();
      if (data.result && Array.isArray(data.result.tools)) {
        return data.result.tools;
      }
      return [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Browgent MCP] Failed to query tools from ${this.endpointUrl}: ${msg}`);
      return [];
    }
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP tool call HTTP error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  }
}
