# Browgent — Autonomous Native AI Browser Agent

Browgent is a zero-dependency, client-side autonomous web agent built as a native Chrome Manifest V3 side panel extension. It controls the browser directly via `chrome.sidePanel`, `chrome.debugger` (Chrome DevTools Protocol), and in-tab semantic DOM perception with zero Python or external proxy dependencies.

---

## Key Features

- **Direct In-Browser CDP Automation**: Low-level mouse clicks (`Input.dispatchMouseEvent`) and keystrokes (`Input.dispatchKeyEvent`) through `chrome.debugger`.
- **Token-Efficient DOM Perception**: In-page semantic extractor tags interactive elements with numeric badges (`[1]`, `[2]`, `[3]`), formatting page state under ~1,500 prompt tokens.
- **Unified Multi-Provider LLM Engine**:
  - **OmniRoute / Local Routers**: Built-in preset (`http://localhost:20128/v1/chat/completions`) with model alias resolution (`free`, `kilo`, `anti`, `gp`, `glm`, `bigp`).
  - **OpenAI / OpenRouter / Ollama / DeepSeek**: Full OpenAI-compatible chat completion support.
  - **Google Gemini**: Direct `generateContent` API integration.
  - **Anthropic Claude**: Direct `messages` API integration.
- **Modular Skills System**: Toggle domain-specific behavioral skills (Form Filler, Web Researcher, E-Commerce Shopper, UI/UX Bug Auditor, Data Extractor) or import custom Markdown skills with YAML frontmatter.
- **Multi-Modal File Ingestion**: Drag-and-drop reference files (CSV, JSON, Text) or images for visual verification directly into the sidebar prompt context. Images are forwarded to every provider (OpenAI-style `image_url` parts for OmniRoute/OpenAI-compatible routers, base64 content blocks for Anthropic, `inlineData` for Gemini).
- **Extensible Tool Registry & MCP Client**: Built-in browser actions coupled with an MCP Streamable HTTP client (JSON mode) that performs the `initialize` handshake, tracks `Mcp-Session-Id`, and invokes external MCP tools dynamically via `mcp_call`.
- **Persistent Keepalive Service Worker**: Dedicated Port heartbeat prevents Manifest V3 background service worker idle timeouts during long reasoning loops.

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

# Build production bundle
npm run build
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

---

## Configuration

Click the **Settings** gear icon in the side panel header to configure:
1. **Provider**: Select **OmniRoute** (default `http://localhost:20128/v1/chat/completions`), **OpenAI**, **Gemini**, or **Anthropic**.
2. **Model**: Choose from quick OmniRoute aliases (`/anti`, `/free`, `/kilo`, `/gp`) or enter a custom model identifier.
3. **API Key**: Saved securely in `chrome.storage.local`.
4. **MCP Endpoint**: Set a remote MCP HTTP/SSE endpoint (e.g. `http://localhost:3000/sse` or OmniRoute tool gateway).
5. **Safety Step Budget**: Adjust maximum autonomous steps per task (default: 15).

---

## Architecture

```
[Side Panel UI (React 18 + Tailwind)]
       │
       │ (chrome.runtime.Port with keepalive heartbeat)
       ▼
[Background Service Worker (agent.ts)]
   ├── Observation: Injected Content Script (DOM Extractor + Numeric Badges)
   ├── Reasoning: Direct HTTPS to OmniRoute / Gemini / OpenAI / Anthropic
   ├── Decision: Loop detection & Step budget guards
   └── Action Dispatcher:
          ├── Browser Actions: chrome.debugger (CDP mouse/keyboard/scroll)
          └── External Tools: McpClient (Streamable HTTP / SSE)
```

---

## Testing

Run unit tests across all subsystems:
```bash
npm test
```
The test suite covers:
- DOM interactive element extraction & prompt formatting (`tests/content/`)
- CDP action parsing & validation (`tests/background/`)
- OmniRoute, OpenAI, Gemini, and Claude LLM response parsers (`tests/llm/`)
- Skills manager & frontmatter parser (`tests/skills/`)
- Tool registry & MCP integration (`tests/tools/`)
- Agent controller state machine & loop detection (`tests/background/`)
- Side panel React UI components (`tests/sidepanel/`)
