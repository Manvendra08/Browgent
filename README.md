# Browgent — Autonomous Native AI Browser Agent

Browgent is a client-side autonomous web agent with **no backend and no relay server**, built as a native Chrome Manifest V3 side panel extension. It controls the browser directly via `chrome.sidePanel`, `chrome.debugger` (Chrome DevTools Protocol), and in-tab semantic DOM perception — with no Python, no proxy, and no server of ours in the loop. Everything runs on your machine; the only data that leaves it goes to the AI endpoint you configure yourself.

---

## Key Features

- **Conversational Chat Threads & Follow-ups**: Retains prior conversation turns as untrusted context, enabling fluid iterative prompting (e.g. "now open the second result", "format that as a table"). Chats are saved locally in `chrome.storage.local` (capped at 20 threads / 30 turns per thread) with typed credentials automatically redacted.
- **Ask vs Agent Execution Modes**:
  - **Ask Mode**: Fast 1-shot Markdown answers directly from page text, viewport screenshots, attached files, and prior turns without autonomous navigation or action loops.
  - **Agent Mode**: Full multi-step CDP automation (click, type, scroll, navigate, wait) with chained action batching and verify-before-finish auditor checks.
- **Alt+B Shortcut & Selection Context Menu**:
  - Press `Alt+B` anywhere in Chrome to open or toggle the side panel.
  - Select text on any webpage, right-click, and pick **Ask Browgent about "%s"** to immediately open the sidebar in Ask mode with `Explain: "<selection>"`.
- **Rendered Markdown & GFM Tables**: Clean rendered Markdown output with GitHub Flavored Markdown tables, styled code blocks, and external link safety.
- **Direct In-Browser CDP Automation**: Low-level mouse clicks (`Input.dispatchMouseEvent`) and keystrokes (`Input.dispatchKeyEvent`) through `chrome.debugger`. Top-frame targeting prevents iframes from hijacking actions, and native alert/confirm/prompt dialogs are handled automatically without hanging.
- **Token-Efficient DOM Perception**: In-page semantic extractor tags interactive elements with stable numeric ids (`[7]`, `[8]`, ...) and formats the page state into a compact prompt payload (element text is truncated to 100 characters per element). Ids are monotonic per document and never reused, so an id always refers to the same element for the life of the page.
- **Unified Multi-Provider LLM Engine**:
  - **OmniRoute / Local Routers**: Built-in preset (`http://localhost:20128/v1/chat/completions`) with model alias resolution (`free`, `kilo`, `anti`, `gp`, `glm`, `bigp`).
  - **OpenAI**: Direct `chat/completions` integration.
  - **OpenAI Compatible**: Any custom OpenAI-compatible base URL — this is how you point Browgent at OpenRouter, Ollama, DeepSeek, vLLM, LM Studio, Groq, and similar servers.
  - **Google Gemini**: Direct `generateContent` API integration.
  - **Anthropic Claude**: Direct `messages` API integration.
- **Prompt-Based Tool Dispatch**: Seven built-in browser tools — `click`, `type`, `scroll`, `navigate`, `wait`, `finish`, `fail`. Tool names, descriptions, and JSON schemas are injected into the system prompt as text, and the model answers with a JSON action. No provider receives a native tool-calling payload.
- **Action Batching**: The model can chain up to 3 actions in a single turn (for example "click the radio option, then click Submit"). The page is re-perceived between chained actions so later steps target the live DOM.
- **Verify-Before-Finish Gate**: Before a task is allowed to complete, an independent completion auditor re-reads the live page and looks for on-page evidence. Premature finishes are rejected and the agent keeps working — up to 2 rejections per run.
- **Modular Skills System**: Toggle domain-specific behavioral skills (Form Filler, Data Extractor, E-commerce Shopper, Web Researcher, UI/UX Bug Auditor) or import custom Markdown skills with YAML frontmatter (only `name` and `description` are read from the frontmatter; the body becomes the skill prompt).
- **Multi-Modal File Ingestion**: Drag-and-drop reference files (CSV, JSON, Text) or images for visual verification directly into the sidebar prompt context. Images are forwarded to every provider (OpenAI-style `image_url` parts for OmniRoute/OpenAI-compatible routers, base64 content blocks for Anthropic, `inlineData` for Gemini). PDFs are **not** parsed — attach text or an image instead.
- **Extensible Tool Registry & MCP Client**: Built-in browser actions coupled with an MCP client that speaks **Streamable HTTP in JSON mode only** (single `POST`, `Accept: application/json, text/event-stream`, then `response.json()`). It performs the `initialize` handshake, tracks `Mcp-Session-Id`, lists external tools, and invokes them dynamically via `mcp_call`. There is no SSE stream parser and no `/sse` endpoint support.
- **Persistent Keepalive Service Worker**: Dedicated Port heartbeat prevents Manifest V3 background service worker idle timeouts during long reasoning loops.
- **Operator Comfort**: Light/dark theme toggle, an active-tab bar above the prompt box showing the tab the agent is working on, and automatic model-list fetching per provider.

---

## Installation & Setup

### 1. Build the Extension
```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Type-check
npm run typecheck

# Lint
npm run lint

# Build production bundle
npm run build

# Build and package a Chrome Web Store uploadable zip (dist/ -> browgent-<version>.zip)
npm run package
```

### 2. Load into Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right toggle.
3. Click **Load unpacked**.
4. Select the `dist/` directory located in:
   ```
   C:\Users\manve\VibeProjects\Browgent\dist
   ```
5. Click the extension puzzle icon in Chrome and pin **Browgent**.
6. Click the Browgent icon or open the Chrome Side Panel to access the agent console.

Browgent requires **Chrome 116 or newer** (`chrome.sidePanel.open` and Manifest V3 side panel API).

### 3. Development Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload. |
| `npm run build` | Production bundle into `dist/`. |
| `npm run package` | Builds, then zips `dist/` into `browgent-<version>.zip` (Chrome Web Store uploadable; `manifest.json` sits at the zip root). Uses only Node built-ins, so it works on Windows PowerShell without the `zip` CLI. |
| `npm test` | Vitest unit/integration suite. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run test:coverage` | Vitest with V8 coverage (report in `coverage/`). Coverage thresholds are enforced, so the command fails if coverage regresses. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config) over the repository. |
| `npm run format` / `npm run format:check` | Prettier write / check. |

### 4. Continuous Integration

`.github/workflows/ci.yml` runs on every push and pull request: **lint → typecheck → test (with coverage thresholds) → build**, then uploads `dist/` as a build artifact (Node 20 and 22).

---

## Configuration

Click the **Settings** gear icon in the side panel header to configure:
1. **Provider**: Select **OmniRoute** (default `http://localhost:20128/v1/chat/completions`), **OpenAI**, **OpenAI Compatible** (custom base URL), **Gemini**, or **Anthropic**.
2. **Model**: Choose from quick OmniRoute aliases (`/anti`, `/free`, `/kilo`, `/gp`, `/glm`, `/bigp`), pick from the model list fetched from your endpoint, or enter a custom model identifier.
3. **API Key**: Saved in `chrome.storage.local` on your machine and sent only to the endpoint you configured.
4. **MCP Endpoint**: Set a remote MCP server that speaks Streamable HTTP in JSON mode (e.g. `http://localhost:3000/mcp`). `/sse` endpoints are not supported.
5. **Safety Step Budget**: Adjust the maximum autonomous steps per task (default: **25**; adjustable from 3 to 30).

**Per-provider settings are remembered.** Each provider keeps its own API key, endpoint, and model, so you configure each one once and switch freely — a provider that has saved settings is marked with a check. Values are saved when you click **Save Settings**, and edits made just before switching to another provider are kept too.

---

## Architecture

```
[Side Panel UI (React 18 + Tailwind)]
       │
       │ (chrome.runtime.Port with keepalive heartbeat)
       ▼
[Background Service Worker (agent.ts)]
   ├── Observation: Injected Content Script (DOM Extractor + Numeric Badges)
   ├── Reasoning: Direct HTTPS to OmniRoute / OpenAI / OpenAI-compatible / Gemini / Anthropic
   ├── Decision: Loop detection, step budget guards, verify-before-finish gate
   └── Action Dispatcher:
          ├── Browser Actions: chrome.debugger (CDP mouse/keyboard/scroll)
          └── External Tools: McpClient (Streamable HTTP, JSON mode)
```

---

## Testing

Run unit tests across all subsystems:
```bash
npm test
```
The test suite covers:
- DOM interactive element extraction, element identity, redaction, and prompt formatting (`tests/content/`)
- CDP action parsing & validation, restricted-URL blocking, and the MCP client (`tests/background/`)
- Model response parsing into actions, multimodal image payloads, and request timeout/abort handling (`tests/llm/`)
- Skills manager & frontmatter parser (`tests/skills/`)
- Tool registry & MCP tool registration (`tests/tools/`)
- Agent controller state machine, action batching, finish gate, stop/abort, and malformed-action handling (`tests/agent/`)
- Side panel React UI components (`tests/sidepanel/`)

---

## Security & Privacy

Browgent has **no backend and no relay server** — nothing is sent to the developer's servers. Here is exactly what leaves your machine, and where it goes:

**Sent to the LLM endpoint you configured** (default: the local `http://localhost:20128`):
- Text of the page's interactive elements (truncated to 100 characters each), plus element ID, tag, ARIA role, label, placeholder, and value.
- The URL and title of the page being automated.
- Your goal (the task text you typed).
- The contents of files you attached (text truncated to ~12,000 characters per file) and attached images as base64 image data.

**Sent to the MCP endpoint you configured** (optional): MCP handshakes, tool listings, and tool calls you requested.

**Never sent:** anything to the developer's servers. API keys live in `chrome.storage.local` on your machine and are only ever transmitted as an authorization header to the endpoint you configured.

**Sensitive values are redacted before transmission:** password fields, one-time-code/autocomplete fields, and fields whose `name`/`id` looks like a password, secret, OTP, CVV, or card number have their value replaced with `[REDACTED]`.

**Navigation guardrails:** internal browser pages, `file://`, `blob:`, `data:` URLs, and link-local metadata addresses (`169.254.x.x`) are blocked in code.

**Storage:** only settings, your API key, the step budget, the MCP endpoint, your skills, and your theme preference are persisted in `chrome.storage.local`. No run history is stored.

There is **no analytics, telemetry, or tracking** of any kind. See [PRIVACY.md](PRIVACY.md) for the full policy.

---

## License

MIT — see [LICENSE](LICENSE).
