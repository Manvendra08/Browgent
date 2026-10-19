# Browgent Native Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Browgent", a native Manifest V3 Chrome sidebar extension that autonomously drives the browser using Chrome DevTools Protocol (CDP), semantic DOM tagging, and direct LLM API calls with zero Python or MCP runtime dependencies.

**Architecture:** Client-side extension with a React 18 side panel console (`chrome.sidePanel`), an injected content-script perception engine that annotates interactive DOM elements with numeric badges, a background service worker agent loop orchestrator, and low-level CDP automation (`chrome.debugger`) for authentic input dispatch.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Tailwind CSS, Chrome Extensions API (Manifest V3), Vitest for unit testing.

**Spec:** [docs/spec.md](file:///C:/Users/manve/VibeProjects/Browgent/docs/spec.md)

## Global Constraints

- Manifest Version: V3.
- No Python, no Playwright server, no MCP bridge. Pure TypeScript client-side execution.
- LLM Keys and configurations stored strictly in `chrome.storage.local`.
- Background service worker must maintain a persistent port with the side panel to avoid idle timeouts during agent loops.
- Action execution must prioritize `chrome.debugger` (CDP) for clicks and typing, falling back to script injection only when necessary.

---

### Task 1: Project Scaffolding & Build Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/manifest.json`
- Create: `public/icon16.png`, `public/icon48.png`, `public/icon128.png` (or placeholder SVGs)
- Test: `tests/setup.test.ts`

**Interfaces:**
- Consumes: Node runtime, npm scripts
- Produces: Compiled `dist/` directory ready to be unpacked into Chrome via `chrome://extensions`

- [ ] **Step 1: Write setup test**

Create `tests/setup.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('Browgent Environment', () => {
  it('should initialize test runner successfully', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Create package.json and project config files**

Create `package.json` with scripts (`build`, `dev`, `test`), dependencies (`react`, `react-dom`, `lucide-react`), devDependencies (`vite`, `typescript`, `@types/chrome`, `@types/react`, `@types/react-dom`, `vitest`, `tailwindcss`, `postcss`, `autoprefixer`).

- [ ] **Step 3: Create vite.config.ts for multi-entry extension build**

Configure multi-entry points: `sidepanel/index.html`, `background/index.ts`, `content/index.ts`. Add asset copying for `manifest.json` and static icons.

- [ ] **Step 4: Verify test runner passes and build succeeds**

Run: `npm install && npm test` and `npm run build`
Expected: Tests pass and `dist/` folder is produced with `manifest.json`.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts src/ tests/
git commit -m "chore: scaffold Browgent extension project with Vite and Vitest"
```

---

### Task 2: DOM Perception & Interactive Element Tagging Engine

**Files:**
- Create: `src/content/types.ts`
- Create: `src/content/extractor.ts`
- Create: `src/content/overlay.ts`
- Create: `src/content/index.ts`
- Test: `tests/content/extractor.test.ts`

**Interfaces:**
- Consumes: Active DOM state from browser tab
- Produces: `PerceivedElement[]` and compact textual representation `<tag id="N">label</tag>` for LLM context, plus numeric badge overlay on page

- [ ] **Step 1: Write failing unit tests for DOM extractor**

Create `tests/content/extractor.test.ts` testing extraction of interactive tags, filtering of hidden nodes, and generation of the prompt-ready string:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { extractInteractiveElements, formatElementsForPrompt } from '../../src/content/extractor';

describe('DOM Extractor', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <h1>Welcome</h1>
        <button id="btn1">Submit Order</button>
        <a href="/login" id="link1">Sign In</a>
        <input type="text" placeholder="Search products..." id="inp1" />
        <div style="display:none"><button id="hidden">Hidden</button></div>
      </div>
    `;
  });

  it('extracts visible interactive elements with assigned sequential IDs', () => {
    const elements = extractInteractiveElements(document);
    expect(elements.length).toBe(3);
    expect(elements[0].text).toContain('Submit Order');
    expect(elements[1].text).toContain('Sign In');
    expect(elements[2].placeholder).toContain('Search products');
  });

  it('formats elements into compact token-efficient markdown', () => {
    const elements = extractInteractiveElements(document);
    const formatted = formatElementsForPrompt(elements);
    expect(formatted).toContain('[1] <button> Submit Order');
    expect(formatted).toContain('[2] <a> Sign In');
    expect(formatted).toContain('[3] <input> placeholder="Search products..."');
  });
});
```

- [ ] **Step 2: Implement extractor and overlay functions**

Implement `src/content/types.ts`, `src/content/extractor.ts` (DOM traversal, viewport calculation, text normalization), and `src/content/overlay.ts` (canvas/DOM badges showing `[1]`, `[2]`, `[3]` in bright yellow with black text directly over elements).

- [ ] **Step 3: Run tests and verify PASS**

Run: `npx vitest run tests/content/extractor.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Wire content script message listener in `src/content/index.ts`**

Listen for `GET_DOM_STATE` and `CLEAR_OVERLAYS` messages from the background script.

- [ ] **Step 5: Commit**

```bash
git add src/content/ tests/content/
git commit -m "feat(content): implement interactive DOM extractor and visual overlay engine"
```

---

### Task 3: CDP & Browser Action Dispatcher

**Files:**
- Create: `src/background/types.ts`
- Create: `src/background/cdp.ts`
- Create: `src/background/actions.ts`
- Test: `tests/background/actions.test.ts`

**Interfaces:**
- Consumes: `ActionPlan` (`click`, `type`, `scroll`, `navigate`, `wait`)
- Produces: Dispatched CDP events via `chrome.debugger.sendCommand` (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`) and tab controls

- [ ] **Step 1: Write unit tests for action parser and validation**

Create `tests/background/actions.test.ts`:
```typescript
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

  it('rejects invalid action schemas gracefully', () => {
    const raw = 'not-json';
    expect(() => parseAgentAction(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Implement CDP client wrapper and action executor**

Implement `src/background/cdp.ts`:
- `attachDebugger(tabId)`
- `detachDebugger(tabId)`
- `dispatchClick(tabId, x, y)`
- `dispatchType(tabId, text, pressEnter)`
- `dispatchScroll(tabId, deltaY)`

Implement `src/background/actions.ts` which resolves element IDs to coordinates and runs the action sequence.

- [ ] **Step 3: Run action tests**

Run: `npx vitest run tests/background/actions.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/background/cdp.ts src/background/actions.ts src/background/types.ts tests/background/
git commit -m "feat(background): implement CDP action dispatcher and input automation"
```

---

### Task 4: Unified Multi-Provider LLM Client with OmniRoute Support

**Files:**
- Create: `src/background/llm/types.ts`
- Create: `src/background/llm/gemini.ts`
- Create: `src/background/llm/openai.ts`
- Create: `src/background/llm/anthropic.ts`
- Create: `src/background/llm/omniroute.ts`
- Create: `src/background/llm/client.ts`
- Test: `tests/llm/client.test.ts`

**Interfaces:**
- Consumes: User prompt, page DOM state, attached file context, active skills, tools schema
- Produces: Structured `AgentDecision` (`thought`, `action`, `params`, `isTerminal`)

- [ ] **Step 1: Write mock tests for LLM client decision parser**

Create `tests/llm/client.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseModelResponse } from '../../src/background/llm/client';

describe('LLM Response Parser', () => {
  it('extracts thought and action from JSON block', () => {
    const output = `Thinking about finding the item.
\`\`\`json
{
  "thought": "I will click the search button.",
  "action": "click",
  "elementId": 5
}
\`\`\``;
    const decision = parseModelResponse(output);
    expect(decision.thought).toBe('I will click the search button.');
    expect(decision.action).toBe('click');
    expect(decision.elementId).toBe(5);
  });
});
```

- [ ] **Step 2: Implement Gemini, OpenAI, Anthropic, and OmniRoute API callers**

Support standard endpoints without external SDK dependencies using native `fetch`:
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- OpenAI / OpenRouter / Ollama: `/v1/chat/completions`
- OmniRoute: Local preset `http://localhost:20128/v1/chat/completions` with support for aliases (`free`, `kilo`, `anti`, `gp`, `glm`, `bigp`).
- Anthropic: `https://api.anthropic.com/v1/messages`

- [ ] **Step 3: Run tests and verify PASS**

Run: `npx vitest run tests/llm/client.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/background/llm/ tests/llm/
git commit -m "feat(llm): implement multi-provider client with OmniRoute, Gemini, OpenAI, and Anthropic"
```

---

### Task 5: Skills, Files Context Ingestion & Extensible MCP Tool Registry

**Files:**
- Create: `src/background/skills/types.ts`
- Create: `src/background/skills/manager.ts`
- Create: `src/background/files/parser.ts`
- Create: `src/background/mcp/client.ts`
- Create: `src/background/tools/registry.ts`
- Test: `tests/tools/registry.test.ts`
- Test: `tests/skills/manager.test.ts`

**Interfaces:**
- Consumes: User-uploaded files (text, CSV, JSON, images), custom skill markdown files, remote MCP server URL
- Produces: Aggregated prompt context, dynamic tool definition schemas for LLM, and tool call dispatching

- [ ] **Step 1: Write unit tests for Skills manager and Tool registry**

Create `tests/skills/manager.test.ts` and `tests/tools/registry.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/background/tools/registry';
import { parseSkillMarkdown } from '../../src/background/skills/manager';

describe('Tool Registry', () => {
  it('registers native browser tools and formats for LLM schema', () => {
    const registry = new ToolRegistry();
    const tools = registry.getDefinitions();
    expect(tools.some(t => t.name === 'click')).toBe(true);
    expect(tools.some(t => t.name === 'type')).toBe(true);
  });
});

describe('Skills Manager', () => {
  it('parses markdown skill with frontmatter', () => {
    const raw = `---
name: form-filler
description: Expert form filler
---
Fill all input forms meticulously.`;
    const skill = parseSkillMarkdown(raw);
    expect(skill.name).toBe('form-filler');
    expect(skill.systemPrompt).toContain('Fill all input forms');
  });
});
```

- [ ] **Step 2: Implement Skills manager, File parser, and MCP SSE client**

1. Implement `src/background/skills/manager.ts`: parses and stores custom skills in `chrome.storage.local`.
2. Implement `src/background/files/parser.ts`: reads text, CSV, JSON, and base64 encodes images for vision prompts.
3. Implement `src/background/mcp/client.ts`: Connects to MCP servers over SSE/HTTP (`/sse`), queries `tools/list`, and invokes `tools/call`.
4. Implement `src/background/tools/registry.ts`: Combines built-in browser tools + dynamic MCP tools.

- [ ] **Step 3: Run tests and verify PASS**

Run: `npx vitest run tests/tools/registry.test.ts tests/skills/manager.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/background/skills/ src/background/files/ src/background/mcp/ src/background/tools/ tests/
git commit -m "feat(extensibility): implement skills manager, file parser, and MCP tool registry"
```

---

### Task 6: Autonomous Agent Controller & Keepalive Loop

**Files:**
- Create: `src/background/agent.ts`
- Modify: `src/background/index.ts`
- Test: `tests/background/agent.test.ts`

**Interfaces:**
- Consumes: Goal message, active skills, attached files, tab updates
- Produces: Step-by-step progress events streamed over `chrome.runtime.Port`, loop termination, safety guards

- [ ] **Step 1: Write agent state machine tests**

Create `tests/background/agent.test.ts` verifying step budget limit enforcement (e.g. stops after maxSteps), loop detection, and stop signal abort handling.

- [ ] **Step 2: Implement agent loop controller**

Implement `AgentController` in `src/background/agent.ts`:
- Step 1: Ingest active skills and attached files into system prompt.
- Step 2: Capture DOM & visible interactive elements from content script.
- Step 3: Query active LLM (OmniRoute/Gemini/OpenAI/Anthropic) with goal, DOM state, and available tool schemas.
- Step 4: Broadcast current thought and planned action to sidepanel.
- Step 5: Dispatch action (CDP click/type/scroll or MCP tool call).
- Step 6: Wait for DOM stabilization / navigation.
- Step 7: Repeat until `finish`, `fail`, user cancellation, or max steps reached.
- Keepalive ping over Port to prevent service worker death.

- [ ] **Step 3: Run agent tests**

Run: `npx vitest run tests/background/agent.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/background/agent.ts src/background/index.ts tests/background/agent.test.ts
git commit -m "feat(agent): implement autonomous agent controller with keepalive and tool routing"
```

---

### Task 7: Modern React Side Panel UI with Skills, Files & MCP Controls

**Files:**
- Create: `src/sidepanel/index.html`
- Create: `src/sidepanel/index.tsx`
- Create: `src/sidepanel/App.tsx`
- Create: `src/sidepanel/components/GoalInput.tsx`
- Create: `src/sidepanel/components/StepFeed.tsx`
- Create: `src/sidepanel/components/SettingsModal.tsx`
- Create: `src/sidepanel/components/SkillSelector.tsx`
- Create: `src/sidepanel/components/FileAttachment.tsx`
- Create: `src/sidepanel/components/McpConfig.tsx`
- Create: `src/sidepanel/styles.css`
- Test: `tests/sidepanel/App.test.tsx`

**Interfaces:**
- Consumes: User inputs, file drops, skill toggles, MCP endpoints, agent event stream
- Produces: Interactive sidebar with live step feed, collapsible thoughts, pause/stop buttons, skill manager, and MCP status

- [ ] **Step 1: Write UI component render test**

Create `tests/sidepanel/App.test.tsx` verifying goal submission input, file dropzone, and settings modal render.

- [ ] **Step 2: Build Side Panel UI with Tailwind & Lucide icons**

Build clean, dark/light mode adaptable UI:
- Header: Browgent badge, status badge (Idle / Running / Paused / Done), Settings button.
- Context Bar: Active skill chips, attached files badges, MCP connection status.
- Main area: Step feed with collapsible thinking blocks, executed actions/tools, and error warnings.
- Footer: File attach button, Goal textarea, Run button, Stop button.
- Settings modal: OmniRoute/OpenAI/Gemini/Anthropic provider selection, API keys/base URLs, custom model name, MCP server URL (`http://localhost:.../sse`), custom skills editor.

- [ ] **Step 3: Run UI tests and verify PASS**

Run: `npx vitest run tests/sidepanel/App.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/ tests/sidepanel/
git commit -m "feat(ui): implement modern React side panel with Skills, Files, and MCP controls"
```

---

### Task 8: Build Verification & Extension Packaging

**Files:**
- Create: `scripts/build.js` (or Vite build script)
- Verify: `dist/manifest.json`, `dist/sidepanel.html`, `dist/background.js`, `dist/content.js`

- [ ] **Step 1: Execute full build**

Run: `npm run build`
Verify all assets in `dist/` exist and match Manifest V3 requirements.

- [ ] **Step 2: Verify all unit tests pass**

Run: `npm test`
Expected: 100% test pass rate across all modules.

- [ ] **Step 3: Final commit and documentation**

```bash
git add .
git commit -m "chore: complete Browgent extension build verification and documentation"
```

