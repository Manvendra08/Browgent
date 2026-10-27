# Browgent — Autonomous AI Browser Agent

Browgent is an autonomous native AI browser agent Chrome Extension (Manifest V3) powered by local and cloud LLMs via OmniRoute, direct provider integrations (Anthropic, OpenAI, Gemini), Chrome DevTools Protocol (CDP), Model Context Protocol (MCP), and extensible skills.

---

## 🛠️ Build & Development Commands

All commands are run from the project root:

```bash
# Development & Build
npm run dev             # Start Vite development server
npm run build           # Build extension into dist/ (outputs MV3 background, sidepanel, and IIFE content script)
npm run package         # Build and create Chrome Web Store zip archive via scripts/package-extension.mjs

# Quality & Testing
npm test                # Run all unit and integration tests (Vitest)
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with v8 coverage and enforce thresholds
npm run typecheck       # Verify TypeScript types without emitting files (tsc --noEmit)
npm run lint            # Run ESLint across the codebase
npm run lint:fix        # Automatically fix ESLint errors
npm run format          # Format code with Prettier
npm run format:check    # Verify formatting with Prettier
```

> **Note on Packaging:** `npm run package` uses Node.js built-ins (`node:zlib`, `node:fs`) in `scripts/package-extension.mjs` and requires no external CLI tools (e.g. `zip`), ensuring native cross-platform execution on Windows, macOS, and Linux.

---

## 🏗️ Architecture & Core Components

Browgent follows Chrome Extension Manifest V3 architecture with three primary subsystems:

### 1. Background Service Worker (`src/background/`)
- **Lifecycle & Heartbeat (`index.ts`)**: Manages service worker keep-alive (20s heartbeat to sidepanel port), context menu actions (`browgent-ask-selection`), keyboard shortcuts (`Alt+B`), and tab navigation synchronization (`waitForTabLoaded`).
- **Agent Controller (`agent.ts`)**:
  - Implements the agent reasoning loop: Perception (DOM + Screenshot) → LLM Decision → Action Execution → DOM Quiescence Settle.
  - **Action Batching**: Supports executing up to 5 consecutive actions per LLM step (`MAX_BATCH_ACTIONS = 5`) to minimize latency on predictable sequences.
  - **DOM Quiescence**: Uses event-driven settlement instead of fixed arbitrary sleeps.
  - **Screenshot Optimization**: Downscales viewport screenshots to a max dimension of 1280px at 0.65 JPEG quality before sending to multimodal LLMs.
  - **Text-Only Fallback**: Automatically bypasses screenshot capture for text-only models (e.g. Kilo, OpenRouter text variants) via `isModelTextOnly`.
  - **Verification Gate**: Employs an auditor prompt with fail-closed rules (`classifyGoalKind`, `parseCompletionVerdict`, `MAX_FINISH_REJECTIONS = 2`) requiring concrete mutation evidence for action goals or verified page facts for question goals.
  - **Loop Detection**: Halts repeated or oscillating actions (3 identical trackable actions or repeating patterns of 6).
  - **Prompt Injection Defense**: Wraps page content and conversational context in nonce-tagged tags (`<page_content nonce="...">`, `<prior_conversation nonce="...">`) and instructs models to treat page content and attached files as untrusted data.
  - **Ask Mode**: Provides single-call fast markdown answers (`agent.answer(...)`) without multi-step autonomous browsing.
- **CDP Automation (`cdp.ts`)**:
  - Attaches to Chrome DevTools Protocol (`chrome.debugger` v1.3) for trusted, native browser input events: click, type, keypress, scroll, hover, navigation.
  - Handles native JavaScript dialogs (`alert`, `confirm`, `prompt`, `beforeunload`) via `enableDialogHandling`.
- **Action Dispatcher (`actions.ts`)**:
  - Parses and validates action JSON schemas: `click`, `type`, `select_option`, `press_key`, `hover`, `scroll`, `navigate`, `wait`, `finish`, `fail`, `mcp_call`.
  - Enforces 1-based numeric element IDs (`elementId >= 1`).
- **URL Boundaries (`restricted.ts`)**:
  - Blocks navigation and inspection of internal/privileged schemes (`chrome://`, `chrome-extension://`, `devtools://`, `edge://`, `about:`, `file://`, `blob:`, `data:`) and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
- **Skills System (`skills/`)**:
  - Built-in skills (`manager.ts`): Form Filler, Web Researcher, E-commerce Shopper, UI/UX Bug Auditor, Data Extractor, and specialized LinkedIn workflows (Job Scout, People Research, Post Drafter, Inbox Assistant).
  - Custom skills loaded via Markdown frontmatter (`parseSkillMarkdown`).
- **File Parser (`files/parser.ts`)**:
  - Handles user-attached text and image files, injecting them into prompts as untrusted reference data.
- **MCP Client (`mcp/client.ts` & `tools/registry.ts`)**:
  - Communicates with external Model Context Protocol endpoints to register external tool definitions and execute remote tool calls.

### 2. Side Panel React UI (`src/sidepanel/`)
- **React 18 + Tailwind CSS** running inside the Chrome Side Panel API (`index.html`, `App.tsx`).
- **Conversational Threads (`threads.ts`, `ChatThread.tsx`, `ThreadList.tsx`)**:
  - Multi-turn conversation history supporting up to 20 threads and 30 turns per thread.
  - Ephemeral thought scrubbing: model reasoning and internal monologue are not persisted to long-term storage.
  - Redaction: sensitive typed text is redacted (`[N chars redacted]`) and URLs are scrubbed before storage.
- **Dual Execution Modes**:
  - **Agent Mode**: Autonomous multi-step execution with full CDP action capabilities.
  - **Ask Mode**: Rapid single-turn Q&A against current page content with markdown rendering.
- **Provider & Model Configuration (`providerConfigs.ts`, `SettingsModal.tsx`)**:
  - Multi-provider configuration supporting OmniRoute, OpenAI, OpenAI-Compatible, Google Gemini, and Anthropic.
  - Multi-account management per provider with backward-compatible schema normalization.
- **Step Feed (`StepFeed.tsx`)**:
  - Displays real-time agent thoughts, action previews, action results, and per-phase latency telemetry (`StepTimings`: DOM, Screenshot, LLM, Action, Total).
- **Active Tab Bar (`ActiveTabBar.tsx`)**:
  - Tracks and displays current tab status, favicon, URL, and warns when on restricted pages.

### 3. Content Script (`src/content/`)
- **Self-Contained IIFE (`index.ts`, `extractor.ts`, `overlay.ts`)**:
  - Bundled as an isolated IIFE (`dist/content.js`) without ESM chunk imports to ensure compatibility across all web pages and frames.
  - Extracts visible, interactive DOM elements (buttons, links, inputs, contenteditables, ARIA roles).
  - Assigns monotonic 1-based element IDs using `WeakMap` caches; IDs are never reused even across DOM replacements to prevent stale element targeting.
  - Ranks elements by viewport priority and visibility.
  - Provides a debug overlay to visually highlight and label detected elements.

---

## 🤖 LLM Integrations & Wire Formats (`src/background/llm/`)

- **OmniRoute (`omniroute.ts`)**: Local routing proxy default (`http://localhost:20128/v1/chat/completions`).
- **OpenAI & Compatible (`openai.ts`)**: Standard OpenAI chat completions format; supports Groq, DeepSeek, Ollama, OpenRouter, Kilo, and custom base URLs.
- **Anthropic (`anthropic.ts`)**: Native Messages API format with ephemeral prompt caching headers (`cache_control: { type: 'ephemeral' }`) on system prompts and tools.
- **Google Gemini (`gemini.ts`)**: Google GenAI REST API format with inline image parts.
- **Networking (`net.ts`)**: Centralized `fetchLLM` with timeout abort controllers, retry mechanisms, and normalized error extraction.

---

## 🔒 Security & Privacy Invariants

1. **Prompt Injection Isolation**:
   - Web page content and attached documents are ALWAYS wrapped in unique nonce tags and explicitly marked as untrusted data.
   - The agent system prompt strictly forbids following instructions contained within the inspected webpage or attachments.
2. **Action Gate & Fail-Closed Auditing**:
   - Destructive or irreversible actions (payments, form submissions, deletions) require confirmation.
   - Verification auditor validates that user-requested goal criteria are demonstrably met before `finish` is accepted.
3. **Data Redaction**:
   - Passwords and input values typed by the agent are redacted before persisting turns to disk.
   - URL query parameters containing credentials or tokens are scrubbed.
4. **Restricted Origins**:
   - Never attach debugger or execute scripts on browser internal pages (`chrome://*`, `about:*`), extension origins, or cloud metadata endpoints.

---

## 🧪 Testing Guidelines

- Tests live in `tests/` and mirror the structure of `src/` (e.g. `tests/agent/`, `tests/background/`, `tests/content/`, `tests/llm/`, `tests/sidepanel/`, `tests/skills/`).
- Use Vitest with `jsdom` environment.
- Mock `chrome.*` globals cleanly using `vi.stubGlobal('chrome', ...)` or helper fixtures.
- Maintain test coverage above project thresholds specified in `vite.config.ts`:
  - Statements: ≥ 69%
  - Branches: ≥ 67%
  - Functions: ≥ 63%
  - Lines: ≥ 69%
- When modifying agent actions, prompt parsing, or provider configurations, always add or update corresponding regression tests.

---

## 📐 Code Style & Conventions

- **Language**: TypeScript 5.7+ configured with strict type checking.
- **React**: Functional components with hooks; Tailwind CSS for styling; Lucide React for icons.
- **Surgical Changes**: Keep diffs minimal, focused, and well-targeted. Never introduce speculative abstractions.
- **Imports**: Use explicit relative paths with proper module resolution.
- **Formatting**: Adhere to ESLint and Prettier rules (`npm run lint`, `npm run format`).
