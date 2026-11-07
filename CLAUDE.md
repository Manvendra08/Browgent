# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Browgent is an autonomous native AI browser agent Chrome Extension (Manifest V3) with no backend or relay server. It controls Chrome directly via `chrome.sidePanel`, `chrome.debugger` (CDP v1.3), in-tab semantic DOM perception, and local/cloud LLMs (OmniRoute, OpenAI, Anthropic, Gemini) alongside an MCP client.

---

## 🛠️ Build & Development Commands

All commands are run from the project root:

```bash
# Build & Package
npm run dev             # Start Vite development server
npm run build           # Build extension into dist/ (background, sidepanel, and IIFE content script)
npm run package         # Build and create Chrome Web Store zip (uses node:zlib/node:fs, no zip CLI needed)

# Testing (Vitest + jsdom)
npm test                # Run all unit and integration tests
npm run test:watch      # Run tests in interactive watch mode
npm run test:coverage   # Run tests with v8 coverage and enforce thresholds (fails if below thresholds)

# Running Single Tests & Subsets
npx vitest run tests/background/restricted.test.ts  # Run a single test file
npx vitest run tests/agent/                         # Run all tests in a directory
npx vitest run -t "restricted URL"                 # Run tests matching a name pattern
npx vitest tests/background/restricted.test.ts      # Run a single test file in watch mode

# Code Quality & Formatting
npm run typecheck       # TypeScript type checking (tsc --noEmit)
npm run lint            # ESLint across entire codebase
npm run lint:fix        # Auto-fix ESLint issues
npx eslint src/background/agent.ts                  # Lint a single file
npm run format          # Format code with Prettier
npm run format:check    # Verify formatting with Prettier
```

> **Packaging Note:** `npm run package` runs `scripts/package-extension.mjs`, which uses Node.js built-ins (`node:zlib`, `node:fs`) to zip the contents of `dist/` with `manifest.json` at the root. It requires no OS-level `zip` binary, ensuring seamless execution on Windows.

---

## 🏗️ Big-Picture Architecture & Cross-Cutting Flows

Browgent operates across three MV3 environments (Service Worker, Sidepanel UI, and Content Script) connected via ports, messages, and CDP:

```
[Side Panel UI (React 18 + Tailwind)]
       │
       │ (chrome.runtime.Port: 'browgent-sidepanel' with 20s heartbeat)
       ▼
[Background Service Worker (agent.ts, index.ts)]
   ├── Perception: chrome.tabs.sendMessage -> dist/content.js (extractor.ts) + screenshot (captureVisibleTab / CDP)
   ├── Reasoning: client.ts -> OmniRoute / OpenAI / Anthropic / Gemini (via fetchLLM in net.ts)
   ├── Verification: auditor prompt gate in agent.ts (MAX_FINISH_REJECTIONS = 2)
   └── Execution:
          ├── CDP Actions: chrome.debugger v1.3 (cdp.ts -> mouse, keyboard, scroll, navigation)
          └── External Tools: McpClient (Streamable HTTP, JSON mode only)
```

### 1. Dual Bundling Pipeline (`vite.config.ts`)
- **Primary Vite Rollup**: Builds `src/background/index.ts` to `dist/background.js` (ESM) and `src/sidepanel/index.html` to `dist/sidepanel.html` and `dist/assets/*`.
- **Secondary IIFE Rollup (`buildContentScript`)**: `src/content/index.ts` MUST be bundled as an isolated IIFE (`dist/content.js`) without external chunk imports (`output.format = 'iife'`). MV3 content scripts cannot load dynamic ESM chunks without complex web-accessible resource declarations.
- **Asset Copy (`copyExtensionAssets`)**: Copies `src/manifest.json` and `public/icons/` into `dist/`.

### 2. Service Worker Keepalive & Tab Synchronization
- **Port Keepalive (`src/background/index.ts`)**: The sidepanel UI opens a `chrome.runtime.Port` named `browgent-sidepanel`. Background emits a 20-second heartbeat to prevent Chrome MV3 from terminating the service worker during lengthy LLM reasoning.
- **Active Tab Tracking**: `ActiveTabBar.tsx` and background track active tab switches (`chrome.tabs.onActivated`, `chrome.tabs.onUpdated`). CDP commands and content script perception calls dynamically route to the current active tab.

### 3. Perception-Action-Verification Agent Loop (`src/background/agent.ts`)
- **Perception**:
  - `src/content/extractor.ts` traverses the live DOM (including open Shadow DOMs, form validation states, and scroll bounds).
  - Assigns monotonic 1-based numeric element IDs (`[1]`, `[2]`, ...) cached in a `WeakMap`. Element IDs are never reused even across DOM replacements to prevent stale element targeting.
  - Viewport screenshots are downscaled to max 1280px at 0.65 JPEG quality (or bypassed for text-only models like Kilo).
- **Prompt Isolation & Injection Defense**:
  - Webpage content, conversation history, and attached files are treated as untrusted and wrapped in nonce tags: `<page_content nonce="...">`, `<prior_conversation nonce="...">`.
- **Action Batching & Quiescence**:
  - Supports executing up to 5 consecutive actions per LLM step (`MAX_BATCH_ACTIONS = 5`).
  - Uses event-driven DOM quiescence settlement instead of arbitrary sleep delays.
- **Verify-Before-Finish Gate**:
  - Before a `finish` action is accepted, an auditor prompt assesses the final page state (`classifyGoalKind`, `parseCompletionVerdict`).
  - Action goals require concrete mutation evidence on the page; question goals require verified page facts.
  - Rejects premature completion up to `MAX_FINISH_REJECTIONS = 2` times, feeding critique back into the reasoning loop.
- **Loop Detection**: Halts repeated or oscillating actions (3 identical trackable actions or repeating sequences of 6).

### 4. CDP Input Automation (`src/background/cdp.ts`)
- Attaches to `chrome.debugger` (protocol version 1.3) to issue trusted native mouse clicks (`Input.dispatchMouseEvent`), keystrokes (`Input.dispatchKeyEvent`), and scrolling.
- Automatically handles native JavaScript dialogs (`alert`, `confirm`, `prompt`, `beforeunload`) via `enableDialogHandling`.
- Restricts debugger attachment and navigation on internal/privileged schemes (`chrome://`, `chrome-extension://`, `devtools://`, `edge://`, `about:`, `file://`, `blob:`, `data:`) and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`) via `src/background/restricted.ts`.

### 5. Multi-Provider LLM Engine (`src/background/llm/`)
- Injects tool definitions as JSON schemas directly in the system prompt text (models reply with JSON actions; no native tool-calling payloads are used).
- Centralized `fetchLLM` in `net.ts` handles timeout aborts and error normalization across OmniRoute (`omniroute.ts`), OpenAI (`openai.ts`), Anthropic (`anthropic.ts` with ephemeral prompt caching headers), and Gemini (`gemini.ts`).

---

## 🔒 Security & Privacy Invariants

1. **Client-Side Only**: Browgent has no backend or relay server. All outbound network traffic goes strictly to the user-configured LLM endpoint or optional MCP server.
2. **Untrusted Data Boundaries**: Page DOM, selection text, and user-attached files are wrapped in nonce tags and must never be interpreted as agent instructions.
3. **Data Redaction**: Passwords, OTPs, CVVs, and sensitive field values are replaced with `[REDACTED]` prior to prompt injection and local storage persistence.
4. **Restricted Targets**: Never attach debugger or navigate to browser internal origins, file systems, or cloud metadata endpoints.

---

## 🧪 Testing Guidelines

- Tests mirror `src/` in `tests/` (`tests/agent/`, `tests/background/`, `tests/content/`, `tests/llm/`, `tests/sidepanel/`, `tests/skills/`, `tests/tools/`).
- Test runner: Vitest with `jsdom` environment.
- Mock Chrome Extension APIs cleanly using `vi.stubGlobal('chrome', ...)` or helper fixtures.
- Strict coverage thresholds in `vite.config.ts` must pass:
  - Statements: ≥ 69%
  - Branches: ≥ 67%
  - Functions: ≥ 63%
  - Lines: ≥ 69%
- When modifying agent actions, prompt parsing, or provider configurations, always add or update corresponding regression tests.

---

## 📐 Code Style & Conventions

- **Language**: TypeScript 5.7+ with strict type checking enabled.
- **UI**: React 18 functional components with hooks, Tailwind CSS, Lucide React icons.
- **Imports**: Explicit relative paths with proper module resolution.
- **Surgical Changes**: Keep diffs minimal and focused. Never introduce speculative abstractions.
- **Formatting**: Run `npm run lint` and `npm run format` to adhere to ESLint flat config and Prettier rules.
