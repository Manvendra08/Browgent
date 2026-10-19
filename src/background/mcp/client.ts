export interface McpToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
}

const MCP_PROTOCOL_VERSION = '2025-03-26';

export class McpClient {
  private endpointUrl: string;
  private sessionId: string | null = null;
  private initialized: Promise<void> | null = null;

  constructor(endpointUrl: string) {
    this.endpointUrl = endpointUrl.trim();
  }

  public getUrl(): string {
    return this.endpointUrl;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    return headers;
  }

  private async post(body: unknown): Promise<Response> {
    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    const newSession = response.headers.get('mcp-session-id');
    if (newSession) {
      this.sessionId = newSession;
    }

    return response;
  }

  /**
   * MCP Streamable HTTP (JSON mode) handshake: initialize, capture the
   * Mcp-Session-Id, then send the initialized notification. Idempotent —
   * concurrent callers share the same in-flight initialization.
   */
  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.performInitialize().catch((err: unknown) => {
        // Allow a retry on the next call after a failed handshake
        this.initialized = null;
        throw err;
      });
    }
    return this.initialized;
  }

  private async performInitialize(): Promise<void> {
    const response = await this.post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'browgent', version: '0.1.0' },
      },
    });

    if (!response.ok) {
      throw new Error(`MCP initialize HTTP error: ${response.status}`);
    }

    await this.post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    if (!this.endpointUrl) {
      return [];
    }

    try {
      await this.ensureInitialized();

      const response = await this.post({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {},
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
    await this.ensureInitialized();

    const response = await this.post({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
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
