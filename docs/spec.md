# Browgent: Architecture Specification

**Project:** Browgent — Autonomous Native AI Browser Agent  
**Target Platform:** Chrome Extension (Manifest V3)  
**Execution Runtime:** Pure TypeScript / JavaScript (No Python, No MCP server)  

---

## 1. Executive Summary

Browgent is a zero-dependency, client-side autonomous web agent built as a native Chrome Manifest V3 side panel extension. It eliminates out-of-process overheads (Python, Playwright, MCP bridges) by directly driving the browser via `chrome.sidePanel`, `chrome.debugger` (Chrome DevTools Protocol), and injected content scripts.

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
│  │   │  - State Machine (IDLE -> ACTING -> DONE)      │   │ │
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
  - Mission / Goal prompt box.
  - Live execution timeline with expandable step reasoning, executed tool calls, and error alerts.
  - Emergency Stop (`AbortController`) to immediately halt CDP execution.
  - Settings panel: Provider selector (Gemini, OpenAI, Anthropic, OpenRouter, Ollama), API keys, model name, max step safety limit (default: 15).

### 3.2. Perception Engine (`src/content/`)
- **Role:** Translates complex HTML DOM into compact, token-efficient semantic representations.
- **Workflow:**
  1. Identifies interactive elements (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, `role="button"`, etc.).
  2. Filters out elements hidden by CSS (`display: none`, `visibility: hidden`, `opacity: 0`, zero bounding dimensions).
  3. Annotates elements with visual numeric markers (`[1]`, `[2]`, `[3]`) in a top-level canvas/overlay.
  4. Generates an annotated DOM tree text payload (< 1,500 tokens) with:
     - Element ID
     - Tag & ARIA role
     - Accessible text / placeholder / value
     - Viewport coordinates (x, y, width, height)

### 3.3. Action Dispatcher (`src/background/cdp.ts` & `actions.ts`)
- **Role:** Executes synthetic user actions with high fidelity.
- **Mechanisms:**
  - `chrome.debugger` (CDP): Dispatches low-level mouse events (`Input.dispatchMouseEvent`: mouseMoved, mousePressed, mouseReleased) and keyboard events (`Input.dispatchKeyEvent`).
  - `chrome.tabs`: Navigation, URL reloading, tab inspection.
  - `chrome.scripting`: Smooth scrolling (`window.scrollBy`) and fallback clicking when CDP is detached.

### 3.4. Agent Loop Controller (`src/background/agent.ts`)
- **Role:** Orchestrates the observe-orient-decide-act loop.
- **Safeguards:**
  - Step limit cap (prevents infinite runaway loops).
  - Loop cycle detection (flags if the same action repeats 3 times).
  - Service worker keepalive: Uses a persistent `chrome.runtime.Port` between the side panel and background script to prevent Manifest V3 timeout termination mid-task.

### 3.5. LLM Client & Provider Engine (`src/background/llm/`)
- **Role:** Direct client-side inference over HTTPS with standardized request abstraction.
- **Supported Providers:**
  - **OmniRoute / OpenAI-Compatible (Local & Remote):**
    - Native support for local OmniRoute instance (`http://localhost:20128/v1/chat/completions`) with automatic model routing/aliases (`free`, `kilo`, `anti`, `gp`, `glm`, `bigp`).
    - Generic OpenAI-compatible custom endpoints (vLLM, Ollama, OpenRouter, Groq, LM Studio, DeepSeek) with customizable headers and base URLs.
  - **Google Gemini API:** Direct `generateContent` with structured JSON schema.
  - **OpenAI API:** Direct `chat/completions` with native tool calling.
  - **Anthropic API:** Direct `messages` with tool use specification.

### 3.6. Modular Skill System (`src/background/skills/`)
- **Role:** Domain-specific procedural knowledge and behavioral protocols that can be dynamically mounted into the agent's prompt context.
- **Features:**
  - Standardized Skill Schema: Markdown with YAML frontmatter (`name`, `description`, `triggers`, `system_instructions`, `required_tools`).
  - Built-in Skills: Form Filling, Data Extraction, E-commerce Checkout, Deep Research, UI/UX Bug Hunter.
  - Custom Skill Manager: Users can paste or import custom Markdown skills directly in the side panel settings; stored in `chrome.storage.local`.

### 3.7. Multi-Modal File Context Ingestion (`src/background/files/`)
- **Role:** Ingests local files into the active agent session as reference context.
- **Supported Formats:**
  - Text, Markdown, JSON, CSV: Inlined into the working memory context as structured ground-truth data (e.g., "Fill out this form using data from applicant.csv").
  - Images (PNG, JPG, WebP): Encoded as base64 and sent to multimodal vision models (e.g., "Compare this live page with design_spec.png").
  - PDFs: Parsed client-side via lightweight text-extraction into context chunks.

### 3.8. Extensible Tool Registry & MCP Client Engine (`src/background/mcp/`)
- **Role:** Unified action registry unifying native browser tools and external MCP server tools.
- **Subcomponents:**
  1. **Built-in Browser Tools:** `click`, `type`, `scroll`, `navigate`, `screenshot`, `extract_table`, `evaluate_js`, `finish`, `fail`.
  2. **Remote MCP Over SSE/HTTP Client:**
     - Connects to local or remote MCP servers operating over Streamable HTTP / Server-Sent Events (SSE) (e.g. `http://localhost:3000/sse` or OmniRoute MCP gateway).
     - Automatically calls `tools/list` on connection and injects external tools directly into the LLM's function calling schema.
     - Routes tool calls via `tools/call` and pipes tool observations back into the agent loop.
  3. **Custom User Script Tools:** Sandboxed JavaScript tools that users can define to run specialized in-tab functions.

---

## 4. Manifest V3 Permissions
- `sidePanel`: Side panel view.
- `activeTab`: Access active tab metadata.
- `debugger`: Chrome DevTools Protocol automation.
- `scripting`: Injecting perception content scripts dynamically.
- `storage`: Storing API keys, provider settings, skills, and history.
- `tabs`: Querying active tab status and URL changes.
- `host_permissions: ["<all_urls>"]`: Full web automation coverage and communication with local/remote LLM & MCP endpoints.

---

## 5. Security & Privacy
- Zero backend relay servers: Keys, files, and DOM data remain strictly local.
- Keys and imported skills stored securely via `chrome.storage.local`.
- User can instantly revoke debugger control, disconnect MCP servers, or hit "Stop" at any step.
