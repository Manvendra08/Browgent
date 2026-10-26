# Browgent Privacy Policy

**Last updated:** 2026-10-22
**Extension:** Browgent — Autonomous AI Browser Agent (Chrome Manifest V3)
**Contact:** security@browgent.dev — **placeholder address, replace with a real monitored mailbox before publishing to the Chrome Web Store.**

Browgent runs entirely on your own machine. This policy explains, in plain English, what the extension reads, what leaves your computer, and what is stored.

---

## 1. Summary

- Browgent has **no backend and no relay server**. Nothing is sent to the Browgent developers.
- The only data that leaves your machine is sent to **the AI/LLM endpoint you configured yourself** (by default a local address such as `http://localhost:20128`), and to **the MCP server you configured yourself**, if you use one.
- There is **no analytics, telemetry, tracking, or usage reporting** of any kind.
- Your API keys are stored **only in `chrome.storage.local` on your own device** and are never synced to a Google account.

---

## 2. What the extension collects

While a task is running, Browgent builds a prompt describing the current page and sends it to your configured LLM endpoint. The following page context is included in that prompt:

| Data | Where it comes from |
| --- | --- |
| **Interactive element text** | The visible text of interactive elements on the page (buttons, links, inputs, labels, etc.), as perceived by the in-page content script. Element text is truncated to 100 characters. |
| **Element metadata** | Element ID, tag name, ARIA role, `type`, accessible label, placeholder, and the element's value — except that sensitive values are redacted (see section 5). |
| **Page URL** | The address of the tab the agent is operating on. |
| **Page title** | The title of that tab. |
| **Active tab URL and title** | The URL and title of the tab you are currently on, shown in the Browgent side panel's tab bar. |
| **Your goal** | The task description you type into the side panel. |
| **Attached file contents** | The text content of files you attach to the prompt, and images you attach (sent as base64 image data to vision-capable models). Attached text is truncated to roughly 12,000 characters per file. |

Browgent does **not** collect the full HTML of a page, the contents of your browsing history, cookies, passwords saved by Chrome, or files you have not attached.

---

## 3. Where that data goes

**Only to endpoints you configure in the Browgent settings panel:**

- **The LLM endpoint.** The default is the local OmniRoute address `http://localhost:20128/v1/chat/completions`. If you point Browgent at OpenAI, Gemini, Anthropic, or any OpenAI-compatible server (vLLM, LM Studio, OpenRouter, Ollama, DeepSeek, …), the page context in the table above is sent to that server instead. Your API key is sent as an authorization header to that same endpoint and nowhere else.
- **The MCP endpoint** (optional). If you configure a remote MCP server, Browgent performs the MCP handshake, lists tools, and invokes tool calls against that server. Nothing is sent to the MCP server that you did not explicitly request as a tool call.

**It never goes to the Browgent developers.** There is no server operated by the project. There is no account system, no sync, and no crash reporting.

Because page content is sent to an LLM, **treat the endpoint you configure as a party that can see your page content.** If that endpoint is a third-party cloud API, that provider's own privacy policy and retention practices apply to what it receives.

---

## 4. Storage and retention

Browgent persists the following values in `chrome.storage.local` (local to your browser profile, not synced to a Google account):

- `browgent_config` — provider selection, endpoint URL, model name, API key.
- `browgent_max_steps` — the maximum step budget.
- `browgent_mcp_endpoint` — the optional MCP server URL.
- `browgent_skills` — the active/disabled state of built-in skills and any custom skills you import.
- `browgent_theme` — your light/dark theme preference.
- `browgent_mode` — your last active mode preference (`ask` or `agent`).
- `browgent_threads` — conversational chat history (user prompts, final Markdown answers, and step execution metadata).
  - **Typed text redaction:** Any text typed into input elements by the agent is automatically replaced with `[N chars redacted]` before persistence.
  - **No raw media:** Viewport screenshots, DOM trees, and attached file contents are never written to storage.
  - **Automatic bounds:** Capped at the 20 most recent threads and at most 30 turns per thread.
  - **User control:** Individual threads can be deleted or all history cleared at any time from the Chat History drawer.

Transient session storage (`chrome.storage.session`):
- `browgent_pending_prompt` — temporary memory holding selected text when launching via the right-click "Ask Browgent about..." context menu. It is immediately consumed and deleted as soon as the side panel opens.

Removing the extension (or clearing extension storage) deletes all of the above.

---

## 5. Sensitive field redaction

Before any page content is transmitted, Browgent replaces the value of sensitive input fields with the literal string `[REDACTED]`. A field is treated as sensitive when it is:

- a `password` (or `hidden`) input,
- marked with an `autocomplete` attribute containing `password`, `one-time-code`, `otp`, `cc-`, `csc-`, `current-password`, or `new-password`, or
- named or identified with a `name`/`id` that looks like `password`, `passwd`, `secret`, `otp`, `cvv`, `cvc`, or `cardnumber`.

This redaction applies to the field value only. Field labels, placeholders, and the presence of the field itself are still transmitted, so the agent can see that a password box exists and can still type into it.

Redaction reduces the risk of leaking a credential to the LLM; it is not a guarantee that no sensitive data of any kind leaves your machine. Page text that you do not control (for example, a page that renders a credential into a visible label) is still transmitted.

---

## 6. Permissions and why they are requested

| Permission / access | Why it is needed |
| --- | --- |
| `sidePanel` | Hosts the Browgent operator console in Chrome's side panel. Requires Chrome 116 or newer. |
| `activeTab` | Reads the URL and title of the active tab for the tab bar and for task context. |
| `tabs` | Reads tab URLs, titles, and load status, and navigates the tab during a task. |
| `contextMenus` | Adds a right-click selection option ("Ask Browgent about '%s'") to launch the sidebar with prefilled queries. |
| `debugger` | Drives real mouse clicks, keystrokes, and scrolling through the Chrome DevTools Protocol, so the agent interacts with the page like a human rather than through synthetic DOM events. |
| `scripting` | Injects the perception content script into the tab so the agent can read interactive elements and overlay numeric badges. |
| `storage` | Stores your settings, API key, skills, theme, and chat threads locally. |
| Host access: `<all_urls>` | Lets the agent read and interact with the pages you ask it to automate. It also permits requests to the local HTTP endpoints you configure (for example `http://localhost:20128`), which host-based permission rules would otherwise block. |

The extension also refuses to operate on internal browser pages (`chrome://`, `chrome-extension://`, the Chrome Web Store), on `file://`, `blob:`, and `data:` URLs, and on link-local metadata addresses such as `169.254.x.x`.

---

## 7. What is not collected

- No analytics, telemetry, crash reports, or usage statistics.
- No tracking of other tabs, browsing history, downloads, or bookmarks.
- No cookies, saved passwords, autofill data, or form data from outside the tab you are operating on.
- No advertising or third-party profiling.

---

## 8. Changes to this policy

Material changes to this policy will be noted in the repository's commit history and in the `Last updated` date above.

---

## 9. Contact

For privacy questions or to report a security issue, contact **security@browgent.dev**.
*(This is a placeholder address. Replace it with a real, monitored mailbox before distributing the extension.)*
