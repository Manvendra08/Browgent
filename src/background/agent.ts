import { LLMConfig, LLMMessage, AgentDecision } from './llm/types';
import { queryLLM, queryLLMRaw } from './llm/client';
import { AgentAction, McpCallAction, ActionResult } from './types';
import { DOMState } from '../content/types';
import { executeAgentAction } from './actions';
import { ToolRegistry } from './tools/registry';
import { McpClient } from './mcp/client';
import { Skill } from './skills/types';
import { AttachedFile, formatAttachedFilesForPrompt } from './files/parser';
import { detachDebugger } from './cdp';
import { isRestrictedUrl, RESTRICTED_URL_HINT } from './restricted';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export const MAX_FINISH_REJECTIONS = 2;

interface CompletionVerdict {
  confirmed: boolean;
  evidence: string;
}

function parseCompletionVerdict(raw: string): CompletionVerdict {
  const text = raw.trim();
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = (fenced ? fenced[1] : text);
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      if (obj && typeof obj === 'object') {
        const confirmed = obj.confirmed === true || obj.complete === true || obj.verdict === 'complete';
        const evidence = typeof obj.evidence === 'string' && obj.evidence.trim() !== ''
          ? obj.evidence.trim()
          : JSON.stringify(obj).slice(0, 300);
        return { confirmed, evidence };
      }
    }
  } catch {
    // fall through to failsafe
  }
  return { confirmed: true, evidence: `Audit response was not parseable JSON: "${text.slice(0, 200)}"` };
}

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
  private finishRejections: number = 0;

  constructor(options: AgentOptions) {
    this.llmConfig = options.llmConfig;
    this.maxSteps = options.maxSteps ?? 25;
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
    // scroll/wait repeat legitimately on long pages; only track state-changing actions
    const isTrackable =
      action.action === 'click' ||
      action.action === 'type' ||
      action.action === 'navigate' ||
      action.action === 'mcp_call';

    const serialized = JSON.stringify(action);
    this.actionHistory.push(serialized);

    if (!isTrackable) {
      return false;
    }

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
      type: 'step' | 'thought' | 'action' | 'action_result' | 'done' | 'error';
      data?: unknown;
    }) => void
  ): Promise<{ success: boolean; summary?: string; error?: string }> {
    this.status = 'running';
    this.stopRequested = false;
    this.currentStep = 0;
    this.history = [];
    this.actionHistory = [];
    this.finishRejections = 0;

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

        // 4. Execute Action Batch (supports single action or multi-action chaining)
        const actionsToExecute = (decision.actions && decision.actions.length > 0)
          ? decision.actions
          : [decision.action];

        let terminalReached = false;

        for (let i = 0; i < actionsToExecute.length; i++) {
          const action = actionsToExecute[i];

          onProgress({
            type: 'action',
            data: { step: this.currentStep, action, subIndex: i, total: actionsToExecute.length },
          });

          // Check for repeating action loops
          if (this.checkLoop(action)) {
            throw new Error(`Loop detected: Agent repeated the exact action 3 times consecutively (${JSON.stringify(action)}). Aborting.`);
          }

          if (action.action === 'finish') {
            const claimedSummary = action.summary || '';
            const verdict = await this.verifyCompletion(tabId, goal, claimedSummary);

            const canRejectAgain = this.finishRejections < MAX_FINISH_REJECTIONS && (this.currentStep + 1 < this.maxSteps);
            if (!verdict.confirmed && canRejectAgain) {
              this.finishRejections++;
              this.history.push({
                step: this.currentStep,
                thought: decision.thought,
                action,
                success: false,
                error: `Finish rejected by completion verifier: ${verdict.evidence}`,
                timestamp: Date.now(),
              });
              onProgress({
                type: 'action_result',
                data: {
                  step: this.currentStep,
                  success: false,
                  error: `Premature finish blocked: ${verdict.evidence} — continuing task`,
                },
              });
              await this.stabilizePage(tabId, action);
              terminalReached = true;
              break;
            }

            this.status = 'completed';
            const finalSummary = verdict.confirmed
              ? claimedSummary
              : `${claimedSummary} (accepted without verified on-page confirmation: ${verdict.evidence})`;
            this.history.push({
              step: this.currentStep,
              thought: decision.thought,
              action,
              success: true,
              timestamp: Date.now(),
            });
            await this.cleanup(tabId);
            onProgress({ type: 'done', data: { summary: finalSummary } });
            return { success: true, summary: finalSummary };
          }

          if (action.action === 'fail') {
            this.status = 'failed';
            this.history.push({
              step: this.currentStep,
              thought: decision.thought,
              action,
              success: false,
              error: action.reason,
              timestamp: Date.now(),
            });
            await this.cleanup(tabId);
            onProgress({ type: 'error', data: { error: action.reason } });
            return { success: false, error: action.reason };
          }

          const execResult = await this.dispatchAction(tabId, action, domState.elements);

          onProgress({
            type: 'action_result',
            data: {
              step: this.currentStep,
              success: execResult.success,
              error: execResult.error,
            },
          });

          this.history.push({
            step: this.currentStep,
            thought: i === 0 ? decision.thought : `Chained action ${i + 1}/${actionsToExecute.length}`,
            action,
            success: execResult.success,
            error: execResult.error,
            timestamp: Date.now(),
          });

          // Short 100ms pause between chained sub-actions
          if (i < actionsToExecute.length - 1) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        if (terminalReached) {
          continue;
        }

        // Adaptive DOM stabilization between turns (250ms default or tab load wait)
        const lastAction = actionsToExecute[actionsToExecute.length - 1];
        await this.stabilizePage(tabId, lastAction);
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
    if (isRestrictedUrl(url)) {
      throw new Error(
        `Cannot automate internal browser page (${url}). ${RESTRICTED_URL_HINT}`
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

    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedUrl(tab.url)) {
      throw new Error(
        `Cannot automate internal browser page (${tab.url}). ${RESTRICTED_URL_HINT}`
      );
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
3. Choose an action to perform, OR provide an array of actions in "actions" if you can execute sequential chained steps safely without needing intermediate visual re-evaluation (e.g. click radio option [index 4] then click submit [index 12]).
4. FOR QUIZZES, FORMS & MULTIPLE-CHOICE TESTS:
   - Read the question and locate the corresponding answer option among the numbered elements.
   - You MUST FIRST CLICK the specific radio/choice element corresponding to your chosen answer BEFORE clicking "Submit" or "Next"! (Tip: you can batch both clicks into "actions: [...]" in a single turn).
   - Do not hallucinate that an option is selected without having clicked it.
   - After selecting the answer, click Submit (if required). Once the submission is confirmed, click Next to advance to subsequent questions.
   - In multi-question quizzes, EVERY question must be visited and answered: if question-number pills, pagination dots, or a list shows any UNANSWERED items (grey/unselected numbers), navigate to them and answer them BEFORE submitting or finishing.
   - NEVER claim from memory that "all responses have been entered" — verify on the page itself.
5. Only call "finish" with concrete on-page evidence of completion in the summary (e.g. completion banner, score screen, all questions marked answered). An auditor re-reads the live page when finish is called; premature finishes are rejected and cost extra steps, so revisit unanswered items first.
6. If the goal is impossible, call "fail" with the explanation.

RESPONSE FORMAT:
You MUST respond with a valid JSON block enclosed in \`\`\`json ... \`\`\`:
\`\`\`json
{
  "thought": "Your concise step reasoning here...",
  "action": {
    "action": "click" | "type" | "scroll" | "navigate" | "wait" | "finish" | "fail" | "mcp_call",
    ...action parameters...
  }
}
\`\`\`
OR for chained actions in a single turn (greatly speeds up execution):
\`\`\`json
{
  "thought": "Your concise step reasoning here...",
  "actions": [
    { "action": "click", "index": 4 },
    { "action": "click", "index": 12 }
  ]
}
\`\`\`
For tools marked [MCP Tool], use {"action": "mcp_call", "tool": "<tool name>", "args": {...}}.`;

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

  private async dispatchAction(
    tabId: number,
    action: AgentAction,
    elements: DOMState['elements']
  ): Promise<ActionResult> {
    if (action.action === 'mcp_call') {
      return this.executeMcpCall(action);
    }
    return executeAgentAction(tabId, action, elements);
  }

  private async executeMcpCall(action: McpCallAction): Promise<ActionResult> {
    if (!this.mcpClient) {
      return {
        success: false,
        error: `MCP tool "${action.tool}" requested but no MCP endpoint is configured in Settings.`,
      };
    }

    const tool = this.toolRegistry.getTool(action.tool);
    if (!tool || !tool.isMcp) {
      return {
        success: false,
        error: `MCP tool "${action.tool}" is not registered on the configured endpoint.`,
      };
    }

    try {
      await this.mcpClient.callTool(action.tool, action.args || {});
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `MCP tool "${action.tool}" failed: ${msg}` };
    }
  }

  private buildVerificationMessages(
    goal: string,
    summary: string,
    domState: DOMState
  ): LLMMessage[] {
    const systemPrompt = `You are an independent completion auditor for a browser automation run.
Decide whether the USER GOAL is verifiably complete, based ONLY on the CURRENT PAGE STATE provided.
Do NOT trust the agent's claims. Look for hard on-page evidence of completion: success/completion banners, score or result screens, submission confirmation messages, or all progress indicators marked answered/done.
Unfinished quizzes, tests, assessment flows, or multi-step forms (e.g. unselected pagination dots, question numbers still without an answered/highlighted state, a visible question with unanswered inputs, or NEXT/SUBMIT buttons still waiting for input) mean the goal is NOT complete.
Respond ONLY with a JSON object in this exact format:
\`\`\`json
{"confirmed": true | false, "evidence": "<what you actually see that proves or disproves completion>"}
\`\`\``;

    const userPrompt = `USER GOAL: "${goal}"

AGENT'S FINAL CLAIM: "${summary}"

CURRENT PAGE:
- URL: ${domState.url}
- Title: ${domState.title}

PAGE ELEMENTS CURRENTLY VISIBLE:
${domState.formattedPrompt}`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  private async verifyCompletion(tabId: number, goal: string, summary: string): Promise<CompletionVerdict> {
    let domState: DOMState;
    try {
      domState = await this.capturePageDOM(tabId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { confirmed: true, evidence: `Could not re-read page for verification (${msg}) — accepting finish` };
    }

    try {
      const messages = this.buildVerificationMessages(goal, summary, domState);
      const raw = await queryLLMRaw(this.llmConfig, messages);
      return parseCompletionVerdict(raw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { confirmed: true, evidence: `Verification LLM call failed (${msg}) — accepting finish` };
    }
  }

  private async stabilizePage(tabId: number, lastAction?: AgentAction): Promise<void> {
    if (lastAction?.action === 'navigate') {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        for (let i = 0; i < 15; i++) {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === 'complete') break;
          } catch {
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    } else {
      // Fast adaptive settle: 250ms (replaces hardcoded 1200ms delay)
      await new Promise((r) => setTimeout(r, 250));
    }
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
