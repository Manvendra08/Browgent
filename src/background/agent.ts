import { LLMConfig, LLMMessage, AgentDecision } from './llm/types';
import { queryLLM } from './llm/client';
import { AgentAction } from './types';
import { DOMState } from '../content/types';
import { executeAgentAction } from './actions';
import { ToolRegistry } from './tools/registry';
import { McpClient } from './mcp/client';
import { Skill } from './skills/types';
import { AttachedFile, formatAttachedFilesForPrompt } from './files/parser';
import { detachDebugger } from './cdp';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export interface AgentStepLog {
  step: number;
  thought: string;
  action: AgentAction;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface AgentOptions {
  llmConfig: LLMConfig;
  maxSteps?: number;
  skills?: Skill[];
  files?: AttachedFile[];
  mcpEndpoint?: string;
}

export class AgentController {
  private status: AgentStatus = 'idle';
  private currentStep: number = 0;
  private maxSteps: number;
  private llmConfig: LLMConfig;
  private skills: Skill[];
  private files: AttachedFile[];
  private mcpClient?: McpClient;
  private toolRegistry: ToolRegistry;
  private history: AgentStepLog[] = [];
  private stopRequested: boolean = false;
  private actionHistory: string[] = [];

  constructor(options: AgentOptions) {
    this.llmConfig = options.llmConfig;
    this.maxSteps = options.maxSteps ?? 15;
    this.skills = options.skills ?? [];
    this.files = options.files ?? [];
    this.toolRegistry = new ToolRegistry();

    if (options.mcpEndpoint && options.mcpEndpoint.trim() !== '') {
      this.mcpClient = new McpClient(options.mcpEndpoint);
    }
  }

  public getStatus(): AgentStatus {
    return this.status;
  }

  public getCurrentStep(): number {
    return this.currentStep;
  }

  public getHistory(): AgentStepLog[] {
    return [...this.history];
  }

  public stop(): void {
    this.stopRequested = true;
    this.status = 'stopped';
  }

  public checkLoop(action: AgentAction): boolean {
    const serialized = JSON.stringify(action);
    this.actionHistory.push(serialized);

    const len = this.actionHistory.length;
    if (len >= 3) {
      if (this.actionHistory[len - 1] === serialized &&
          this.actionHistory[len - 2] === serialized &&
          this.actionHistory[len - 3] === serialized) {
        return true;
      }
    }
    return false;
  }

  public async run(
    tabId: number,
    goal: string,
    onProgress: (event: {
      type: 'step' | 'thought' | 'action' | 'done' | 'error';
      data?: unknown;
    }) => void
  ): Promise<{ success: boolean; summary?: string; error?: string }> {
    this.status = 'running';
    this.stopRequested = false;
    this.currentStep = 0;
    this.history = [];
    this.actionHistory = [];

    // Initialize MCP tools if endpoint is provided
    if (this.mcpClient) {
      try {
        const mcpTools = await this.mcpClient.listTools();
        mcpTools.forEach((t) => this.toolRegistry.registerMcpTool(t));
      } catch (err: unknown) {
        console.warn('[Browgent Agent] Could not load MCP tools:', err);
      }
    }

    try {
      while (this.currentStep < this.maxSteps) {
        if (this.stopRequested) {
          await this.cleanup(tabId);
          return { success: false, error: 'Agent execution stopped by user.' };
        }

        this.currentStep++;
        onProgress({ type: 'step', data: { step: this.currentStep, maxSteps: this.maxSteps } });

        // 1. Perceive DOM State from content script
        const domState = await this.capturePageDOM(tabId);

        // 2. Build Prompt Messages
        const messages = this.buildPromptMessages(goal, domState);

        // 3. Query LLM
        let decision: AgentDecision;
        try {
          decision = await queryLLM(this.llmConfig, messages);
        } catch (llmErr: unknown) {
          const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
          throw new Error(`LLM Error at step ${this.currentStep}: ${msg}`);
        }

        onProgress({
          type: 'thought',
          data: { step: this.currentStep, thought: decision.thought },
        });

        onProgress({
          type: 'action',
          data: { step: this.currentStep, action: decision.action },
        });

        // 4. Check for repeating action loops
        if (this.checkLoop(decision.action)) {
          throw new Error(`Loop detected: Agent repeated the exact action 3 times consecutively (${JSON.stringify(decision.action)}). Aborting.`);
        }

        // 5. Execute Action
        let execResult: { success: boolean; error?: string; isTerminal?: boolean; summary?: string };

        if (decision.action.action === 'finish') {
          this.status = 'completed';
          this.history.push({
            step: this.currentStep,
            thought: decision.thought,
            action: decision.action,
            success: true,
            timestamp: Date.now(),
          });
          await this.cleanup(tabId);
          onProgress({ type: 'done', data: { summary: decision.action.summary } });
          return { success: true, summary: decision.action.summary };
        }

        if (decision.action.action === 'fail') {
          this.status = 'failed';
          this.history.push({
            step: this.currentStep,
            thought: decision.thought,
            action: decision.action,
            success: false,
            error: decision.action.reason,
            timestamp: Date.now(),
          });
          await this.cleanup(tabId);
          onProgress({ type: 'error', data: { error: decision.action.reason } });
          return { success: false, error: decision.action.reason };
        }

        execResult = await executeAgentAction(tabId, decision.action, domState.elements);

        this.history.push({
          step: this.currentStep,
          thought: decision.thought,
          action: decision.action,
          success: execResult.success,
          error: execResult.error,
          timestamp: Date.now(),
        });

        // Wait for page stabilization and DOM mutations
        await new Promise((r) => setTimeout(r, 1200));
      }

      // Max steps exceeded
      this.status = 'failed';
      await this.cleanup(tabId);
      const limitMsg = `Max step budget (${this.maxSteps}) reached without achieving goal.`;
      onProgress({ type: 'error', data: { error: limitMsg } });
      return { success: false, error: limitMsg };
    } catch (err: unknown) {
      this.status = 'failed';
      await this.cleanup(tabId);
      const errMsg = err instanceof Error ? err.message : String(err);
      onProgress({ type: 'error', data: { error: errMsg } });
      return { success: false, error: errMsg };
    }
  }

  private async ensureContentScript(tabId: number, url?: string): Promise<void> {
    if (url && (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('view-source:') ||
      url.includes('chromewebstore.google.com')
    )) {
      throw new Error(
        `Cannot automate internal browser page (${url}). Chrome restricts extensions on internal and Web Store pages. Please navigate to a standard public website (e.g. https://wikipedia.org or https://news.ycombinator.com).`
      );
    }

    if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        await new Promise((r) => setTimeout(r, 150));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('cannot be scripted') || msg.includes('Cannot access')) {
          throw new Error(`This page cannot be automated by Chrome extensions (${msg}). Please navigate to an open web page.`);
        }
      }
    }
  }

  private async capturePageDOM(tabId: number): Promise<DOMState> {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
      return {
        url: 'http://localhost/test',
        title: 'Mock Page',
        elements: [],
        formattedPrompt: 'No elements detected.',
        viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
      };
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('view-source:') ||
        tab.url.includes('chromewebstore.google.com')
      )) {
        throw new Error(
          `Cannot automate internal browser page (${tab.url}). Chrome blocks extension scripts on internal and Web Store pages. Please switch to a regular website (e.g. https://wikipedia.org) and try again.`
        );
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Cannot automate internal browser page')) {
        throw e;
      }
    }

    const sendMsg = (): Promise<DOMState> => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_DOM_STATE', showOverlay: true }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response?.error || 'Failed to capture DOM state'));
          }
          resolve(response.data);
        });
      });
    };

    try {
      return await sendMsg();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
        const tab = await chrome.tabs.get(tabId);
        await this.ensureContentScript(tabId, tab.url);
        return await sendMsg();
      }
      throw err;
    }
  }

  private buildPromptMessages(goal: string, domState: DOMState): LLMMessage[] {
    // 1. System Prompt Header
    const activeSkills = this.skills.filter((s) => s.isActive);
    let skillSection = '';
    if (activeSkills.length > 0) {
      skillSection = `\nActive Expert Skills:\n` +
        activeSkills.map((s) => `### Skill: ${s.name}\n${s.systemPrompt}`).join('\n\n');
    }

    const { textPrompt: attachedFilesText, images } = formatAttachedFilesForPrompt(this.files);
    let fileSection = '';
    if (attachedFilesText) {
      fileSection = `\nAttached User Files & Reference Data:\n${attachedFilesText}\n`;
    }

    const toolDocs = this.toolRegistry.formatPromptDocumentation();

    const systemPrompt = `You are Browgent, an elite autonomous AI browser automation agent operating inside Google Chrome.
Your task is to achieve the user's goal by navigating the browser and interacting with elements on the page.

${toolDocs}
${skillSection}
${fileSection}

INSTRUCTIONS:
1. Carefully observe the current page URL, title, and the numbered interactive elements list.
2. Formulate your reasoning and internal monologue in the "thought" field.
3. Choose EXACTLY ONE action to perform this turn.
4. FOR QUIZZES, FORMS & MULTIPLE-CHOICE TESTS:
   - Read the question and locate the corresponding answer option among the numbered elements.
   - You MUST FIRST CLICK the specific radio/choice element corresponding to your chosen answer BEFORE clicking "Submit" or "Next"!
   - Do not hallucinate that an option is selected without having clicked it.
   - After selecting the answer, click Submit (if required). Once the submission is confirmed, click Next to advance to subsequent questions.
5. If you have fulfilled the user goal, call the "finish" action with a thorough summary.
6. If the goal is impossible, call "fail" with the explanation.

RESPONSE FORMAT:
You MUST respond with a valid JSON block enclosed in \`\`\`json ... \`\`\`:
\`\`\`json
{
  "thought": "Your concise step reasoning here...",
  "action": {
    "action": "click" | "type" | "scroll" | "navigate" | "wait" | "finish" | "fail",
    ...action parameters...
  }
}
\`\`\``;

    // 2. History of past actions in this session
    let historySummary = 'No previous actions taken yet.';
    if (this.history.length > 0) {
      historySummary = this.history
        .map(
          (h) =>
            `Step ${h.step}: ${JSON.stringify(h.action)} -> ${h.success ? 'Success' : `Failed (${h.error})`}`
        )
        .join('\n');
    }

    // 3. User Message with active page state
    const userPrompt = `USER GOAL: "${goal}"

CURRENT PAGE:
- URL: ${domState.url}
- Title: ${domState.title}

INTERACTIVE ELEMENTS ON CURRENT VIEWPORT:
${domState.formattedPrompt}

PREVIOUS ACTIONS IN THIS SESSION:
${historySummary}

CURRENT STEP: ${this.currentStep} of ${this.maxSteps} max steps.
Output your next JSON action:`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt, images: images.length > 0 ? images : undefined },
    ];

    return messages;
  }

  private async cleanup(tabId: number): Promise<void> {
    try {
      await detachDebugger(tabId);
    } catch {
      // ignore
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.sendMessage) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_OVERLAYS' });
      } catch {
        // ignore
      }
    }
  }
}
