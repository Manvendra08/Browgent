# Browgent: Architecture Specification

**Project:** Browgent — Autonomous Native AI Browser Agent  
**Target Platform:** Chrome Extension (Manifest V3)  
**Execution Runtime:** Pure TypeScript / JavaScript (No Python; talks to MCP servers over HTTP)  

---

## 1. Executive Summary

Browgent is a client-side autonomous web agent with **no backend and no relay server**, built as a native Chrome Manifest V3 side panel extension. It eliminates out-of-process overheads (Python, Playwright, proxy bridges) by directly driving the browser via `chrome.sidePanel`, `chrome.debugger` (Chrome DevTools Protocol), and injected content scripts. The extension does talk to external services, but only to the LLM and MCP endpoints the user configures — never to a server operated by the project.

---

## 2. Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       CHROME BROWSER                        │
│                                                             │
│  ┌───────────────────────┐       ┌────────────────────────┐ │
│  │   Side Panel (React)  │       │   Active Tab (Webpage) │ │
│  │   - Goal Input        │       │   - Injected Extractor │ │
│  │   - Reasoning Trace   │       │   - Element Tagging    │ │
│  │   - Action History    │       │   - Numeric Overlay    │ │
│  │   - Settings & Keys   │       │   - CDP Target         │ │
│  └───────────┬───────────┘       └───────────▲────────────┘ │
│              │ Port (Heartbeat & IPC)        │              │
│              ▼                               │              │
│  ┌───────────────────────────────────────────┴────────────┐ │
│  │       Background Service Worker (TypeScript)           │ │
│  │                                                        │ │
│  │   ┌────────────────────────────────────────────────┐   │ │
│  │   │                Agent Controller                │   │ │
│  │  │  - State Machine (IDLE -> RUNNING -> DONE)      │   │ │
│  │   │  - Execution Step Budget & Safety Loop         │   │ │
│  │   └──────┬──────────────────────────────────▲──────┘   │ │
│  │          │                                  │          │ │
│  │          ▼                                  │          │ │
│  │   ┌──────────────┐                  ┌───────┴──────┐   │ │
│  │   │  Action CDP  │                  │  LLM Engine  │   │ │
│  │   │  Dispatcher  │                  │  (OpenAI /   │   │ │
│  │   │  (Input/DOM) │                  │   Gemini /   │   │ │
│  │   │              │                  │   Anthropic) │   │ │
│  │   └──────────────┘                  └──────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Breakdown

### 3.1. Side Panel UI (`src/sidepanel/`)
- **Technology:** React 18/19, TypeScript, Tailwind CSS, Lucide icons.
- **Role:** Interactive operator console.
- **Features:**
  - Mission / Goal prompt box with drag-and-drop file attachments (images and text).
  - Live execution timeline with expandable step reasoning, executed tool calls, and error alerts.
  - Active-tab bar above the prompt box showing the URL and title of the tab the agent is operating on.
  - Emergency Stop (`AbortController`) to halt the run immediately, including an in-flight LLM request.
  - Light/dark theme toggle, persisted in `chrome.storage.local`.
  - Settings panel: Provider selector (OmniRoute, OpenAI, OpenAI Compatible, Gemini, Anthropic), API key, base URL, model name with per-provider model auto-fetch from the endpoint's model listing, MCP endpoint, max step safety limit (default: **25**, adjustable from 3 to 30), and a custom Markdown skill importer.

### 3.2. Perception Engine (`src/content/`)
- **Role:** Translates complex HTML DOM into compact, token-efficient semantic representations.
- **Workflow:**
  1. Identifies interactive elements (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, `role="button"`, etc.).
  2. Filters out elements hidden by CSS. `display: none` and `visibility: hidden` elements are dropped, as are `opacity: 0` elements — except `opacity: 0` inputs, which are kept (the radio/checkbox inputs that quizzes commonly hide are the main case). Zero-size / text-less non-input elements are dropped as well: an element with no text content, no `aria-label`, and no `title` is not actionable. Inputs nested inside an already-extracted `<label>` are de-duplicated against that label.
  3. Annotates elements with visual numeric markers (`[1]`, `[2]`, `[3]`) in a top-level canvas/overlay.
  4. Generates a compact annotated DOM text payload with:
     - Element ID
     - Tag & ARIA role
     - Accessible text / placeholder / value
     - Viewport coordinates (x, y, width, height)
  5. Redacts sensitive values before they leave the page: the value of password fields, one-time-code/autocomplete fields, and fields whose `name`/`id` looks like a password, secret, OTP, CVV, or card number is replaced with `[REDACTED]`. The field label and placeholder are still reported, so the agent can still see the field exists and can still type into it.

### 3.3. Action Dispatcher (`src/background/cdp.ts` & `actions.ts`)
- **Role:** Executes synthetic user actions with high fidelity.
- **Mechanisms:**
  - `chrome.tabs.sendMessage` → content script: the primary path for `click`, `type`, and `scroll`. It performs a DOM-level click (`el.click()`, with explicit `checked` + `change`/`input` events for radio/checkbox and labels), a DOM-level value set for text entry, and a smooth `window.scrollBy`. This path works with React/SPA synthetic event handlers.
  - `chrome.debugger` (CDP): Fallback path when the DOM action cannot be performed. Dispatches low-level mouse events (`Input.dispatchMouseEvent`: mouseMoved, mousePressed, mouseReleased), keyboard events (`Input.dispatchKeyEvent`), and scroll events. Only one path fires per action, so a click never double-fires.
  - Stale-element protection: the CDP fallback re-reads the element's live rectangle via `GET_ELEMENT_RECT` and refuses to act on coordinates it could not refresh.
  - `chrome.tabs`: Navigation (`chrome.tabs.update`) and tab inspection.
  - `chrome.scripting`: Injecting the perception content script into a tab that does not have it yet.
  - `navigate` and `wait` actions are validated before execution (HTTP/HTTPS only, restricted addresses rejected, wait clamped to 10 seconds).

### 3.4. Agent Loop Controller (`src/background/agent.ts`)
- **Role:** Orchestrates the observe-orient-decide-act loop.
- **Loop shape:** Each turn re-perceives the live DOM, builds a fresh prompt (goal + page content + action history + step counter), queries the LLM, then executes the returned action(s) and stabilizes the page before the next turn.
- **Action batching:** The model may return an `actions` array. Up to `MAX_BATCH_ACTIONS` (3) actions are executed in a single turn, and the page is re-perceived between chained actions so later steps target the live DOM instead of a stale element map. A batch is truncated at the first terminal action (`finish` / `fail`).
- **Verify-before-finish gate:** When the model calls `finish`, an independent completion auditor re-reads the live page and looks for hard on-page evidence (completion banner, score/result screen, submission confirmation, all progress indicators marked answered). An unconfirmed finish is rejected, the agent is sent back to work, and the rejection costs a step. Up to `MAX_FINISH_REJECTIONS` (2) rejections are allowed per run. The gate **fails closed**: if the page cannot be re-read, the auditor call fails, or the auditor returns unparsable output, the finish is rejected exactly like an unconfirmed finish. If the rejection budget is exhausted (or the step limit is reached) while completion is still unverified, the run ends as a **failure** with `Completion could not be verified: <auditor evidence>` - it never reports success on an unverified finish. The auditor is not shown the agent's own claim, so it cannot be talked into confirming.
- **Safeguards:**
  - Step limit cap (default **25** steps, configurable from 3 to 30 in the side panel) prevents infinite runaway loops.
  - Loop cycle detection (flags if the same state-changing action repeats 3 times consecutively; `scroll` and `wait` are exempt because they legitimately repeat on long pages).
  - Malformed-action handling: an unparsable model response is rejected with a readable error and retried as a no-op `wait` instead of crashing the run.
  - Request cancellation: each run owns an `AbortController`; `stop()` aborts the in-flight LLM request immediately.
  - Request timeouts: LLM calls abort after 90 s (`LLM_REQUEST_TIMEOUT_MS`) and MCP calls after 30 s (`MCP_REQUEST_TIMEOUT_MS`). The per-run `AbortController` composes with those timeouts, so a user-initiated stop cancels a hung request instead of waiting it out.
  - Service worker keepalive: Uses a persistent `chrome.runtime.Port` between the side panel and background script to prevent Manifest V3 timeout termination mid-task.
  - Adaptive DOM stabilization between turns (250 ms settle, or a tab-load wait after navigation).

### 3.5. LLM Client & Provider Engine (`src/background/llm/`)
- **Role:** Direct client-side inference over HTTP(S) behind a standardized request abstraction (`LLMConfig` + `LLMMessage[]` → raw text → parsed `AgentDecision`).
- **Supported Providers (`ProviderType`):**
  - **OmniRoute** (`omniroute`): Built-in preset (`http://localhost:20128/v1/chat/completions`) with model alias resolution (`free`, `kilo`, `anti`, `gp`, `glm`, `bigp`).
  - **OpenAI** (`openai`): Direct `chat/completions`.
  - **OpenAI Compatible** (`openai-compat`): Any OpenAI-compatible custom base URL with a custom API key. This is the configuration path for OpenRouter, Ollama, DeepSeek, vLLM, LM Studio, Groq, and similar servers — they are **not** separate providers.
  - **Google Gemini** (`gemini`): Direct `generateContent`.
  - **Anthropic** (`anthropic`): Direct `messages`.
- **Tool dispatch is prompt-based, not native:** Tool names, descriptions, and JSON schemas are serialized into the system prompt as plain text (`ToolRegistry.formatPromptDocumentation()`), and the model replies with a JSON action block that is parsed into an `AgentDecision`. **No provider receives a native `tools`, `function`, or `responseSchema` payload.** This keeps behaviour identical across all five backends and avoids provider-specific schema drift.
- **Timeouts & diagnostics:** every HTTP call goes through `fetchLLM()`, which combines the caller's `AbortSignal` with an internal 90 s timeout and maps timeouts, user cancellation, and unreachable endpoints onto distinct, readable error messages.

### 3.6. Modular Skill System (`src/background/skills/`)
- **Role:** Domain-specific procedural knowledge and behavioral protocols that are mounted into the agent's prompt context as guidance (they cannot override the agent's security rules or the user's goal).
- **Features:**
  - Standardized Skill Schema: Markdown with YAML frontmatter. **Only `name` and `description` are parsed** from the frontmatter — `triggers`, `system_instructions`, and `required_tools` are **not** supported and are ignored. The Markdown body becomes the skill's system prompt.
  - Built-in Skills (id / display name): `form-filler` / Form Filler, `data-extractor` / Data Extractor, `ecommerce-shopper` / E-commerce Shopper, `web-researcher` / Web Researcher, `ui-bug-auditor` / UI/UX Bug Auditor.
  - Custom Skill Manager: Users can paste or import custom Markdown skills directly in the side panel settings; stored in `chrome.storage.local` (`browgent_skills`).

### 3.7. Multi-Modal File Context Ingestion (`src/background/files/`)
- **Role:** Ingests local files into the active agent session as reference context.
- **Supported Formats:**
  - **Text-like files** (CSV, JSON, Markdown, TXT, …): inlined into the working memory context as structured ground-truth data (e.g., "Fill out this form using data from applicant.csv"), truncated to roughly 12,000 characters per file.
  - **Images** (PNG, JPG, WebP): encoded as base64 and sent to multimodal vision models (e.g., "Compare this live page with design_spec.png").
- **Not supported:** PDFs are **not** parsed. There is no client-side PDF text extraction; attach a text export or a screenshot image instead.

### 3.8. Extensible Tool Registry & MCP Client Engine (`src/background/tools/` & `src/background/mcp/`)
- **Role:** Unified action registry unifying native browser tools and external MCP server tools.
- **Subcomponents:**
  1. **Built-in Browser Tools (7):** `click`, `type`, `scroll`, `navigate`, `wait`, `finish`, `fail`. There is no `screenshot`, `extract_table`, or `evaluate_js` tool, and no user-defined JavaScript tools — extra behaviour is added through Markdown skills, not through injected code.
  2. **Remote MCP Client — Streamable HTTP, JSON mode only:**
     - One `POST` per request with `Accept: application/json, text/event-stream`, then the response body is read with `response.json()`.
     - **There is no SSE stream parser and no `/sse` endpoint support.** Servers that only speak the older SSE transport cannot be used.
     - Performs the `initialize` handshake, captures the `Mcp-Session-Id`, sends `notifications/initialized`, then calls `tools/list` and `tools/call`.
     - Discovered tools are registered as `mcp__<name>` and exposed through the same prompt-based tool documentation as the built-in tools; the model invokes them with `{"action": "mcp_call", "tool": "<name>", "args": {...}}`.
     - MCP requests time out after 30 s, and at most 30 MCP tools are registered per run.

---

## 4. Manifest V3 Permissions
- `sidePanel`: Side panel view. Requires Chrome 114 or newer (`minimum_chrome_version: "114"`).
- `activeTab`: Access active tab metadata.
- `debugger`: Chrome DevTools Protocol automation.
- `scripting`: Injecting perception content scripts dynamically.
- `storage`: Storing API keys, provider settings, skills, and preferences in `chrome.storage.local` (local only — nothing is synced).
- `tabs`: Querying active tab status and URL changes, and messaging the content script.
- `host_permissions: ["<all_urls>"]`: Full web automation coverage and communication with local/remote LLM & MCP endpoints.

---

## 5. Security & Privacy
- **No backend, no relay server:** Browgent runs entirely in the browser. There is no server operated by the project, and **nothing is sent to the developer's servers**.
- **What does leave the machine:** page context is transmitted to the **LLM endpoint the user configured** (default: the local `http://localhost:20128`), and to the **MCP endpoint the user configured** if one is set. The transmitted payload is: the text and metadata of the page's interactive elements, the page URL and title, the user's goal, and the contents of attached files (text and images). Page data is therefore **not** "strictly local" — it goes to the user's chosen endpoint, and that endpoint's operator (which may be a third-party cloud API) can see it.
- **Sensitive values are redacted before transmission:** password fields, one-time-code/autocomplete fields, and fields whose `name`/`id` looks like a password, secret, OTP, CVV, or card number have their value replaced with `[REDACTED]`.
- **Prompt-injection posture:** page content, tool descriptions, skill text, and attached files are treated as untrusted data, never as instructions. The user's goal and the agent's security rules outrank any text found on the page.
- **Blocked destinations:** internal browser pages, `file://`, `blob:`, and `data:` URLs, and link-local metadata addresses (`169.254.x.x`) are rejected before navigation.
- **Keys:** API keys are stored in `chrome.storage.local` on the user's machine and are only ever sent as an authorization header to the endpoint the user configured. They are never synced to a Google account.
- **No telemetry:** there is no analytics, tracking, or crash reporting, and no run history is persisted — agent step logs live in memory for the duration of a run.
- **User control:** the user can instantly revoke debugger control, disconnect MCP servers, clear stored settings, or hit "Stop" at any step.
