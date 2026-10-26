# Browgent sidebar: Phase 0 (bug fixes) + Phase 1 (conversational sidebar)

## Context
The sidebar review found that Browgent's agent engine is solid but the product lags Nanobrowser / Perplexity Comet:
- **Correctness bugs** that make it fail on ordinary pages: DOM/action messages go to *every* frame (first reply wins), native `alert/confirm` dialogs freeze the run, and markdown results render as raw text.
- **It is a one-shot goal launcher, not an assistant**: each run wipes the feed, there are no follow-ups, no saved history, no quick "ask about this page" mode, no shortcut or right-click entry.

Outcome of this plan: a reliable agent on iframe/dialog-heavy pages, and a chat-style sidebar with persistent threads (chrome.storage.local, capped), follow-ups that carry prior-turn context, an Ask mode (single LLM call) next to Agent mode, rendered markdown, a keyboard shortcut and a selection context menu.

Out of scope (later milestones, re-plan when reached):
- Phase 2 – human-level actions: tab tools (open/switch/close/back), key combos, file upload, drag, coordinate click, data scratchpad, `ask_user` pause/takeover (also unlocks confirming `confirm()` dialogs), stop auto-following ad popups.
- Phase 3 – planner/navigator split with per-role models; remove site-specific prompt text and regex goal classifier.
- Phase 4 – shadow-DOM + per-frame perception, runs that survive closing the panel, multi-tab.
- Token streaming: needs SSE parsing in all 4 providers; deferred, a typing indicator covers it for now.

---

## Phase 0 – bug fixes (one commit each)

### 0.1 Target the top frame only
Content script is injected `all_frames: true`, but `chrome.tabs.sendMessage(tabId, msg, cb)` broadcasts to all frames.
- `src/background/agent.ts` `capturePageDOM` → `chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, cb)`.
- `src/background/actions.ts` `sendDomAction` → same `{ frameId: 0 }`.
- `CLEAR_ALL_VISUALS` in `cleanup()` may stay broadcast (harmless).
- Update sendMessage mocks/assertions in `tests/background/actions.test.ts`, `tests/background/agent.test.ts`, `tests/agent/*.test.ts` (callback moves to 4th arg). Add one test asserting `frameId: 0` is passed.

### 0.2 Handle native JS dialogs
- `src/background/cdp.ts`: add `enableDialogHandling(tabId, onDialog)` — `attachDebugger` + `Page.enable`, one `chrome.debugger.onEvent` listener for `Page.javascriptDialogOpening`, immediately answered with `Page.handleJavaScriptDialog`:
  - `alert`, `beforeunload` → accept.
  - `confirm`, `prompt` → dismiss (never auto-confirm an irreversible prompt; Phase 2 `ask_user` adds confirmation).
  - Calls `onDialog({ type, message })`. Returns a disposer that removes the listener.
- `src/background/agent.ts`: in `run()` enable it for the root tab (and child tabs as they are tracked); dispose in `cleanup()`. Each dialog is pushed into `history` (e.g. `Page showed a confirm dialog: "<message>" → dismissed automatically`) and emitted via `onProgress({ type: 'action_result', ... })` so the user sees it.
- Trade-off: the debugger infobar now appears at run start instead of only on CDP fallbacks (press_key already attaches). Accepted.
- Test in `tests/background/cdp.test.ts`: fake `onEvent` firing each dialog type → correct `accept` flag + callback.

### 0.3 Render markdown
- Add deps `react-markdown` + `remark-gfm` (GFM tables; safe by default, no raw HTML). A hand-rolled table/list renderer would be more code with worse edge cases.
- New `src/sidepanel/components/Markdown.tsx`: `<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: new tab + rel="noopener noreferrer" }}>` with Tailwind styles for tables/code/lists scoped under `.md` in `styles.css`.
- Use it for the final result (Phase 1 reuses it in chat turns).

---

## Phase 1 – conversational sidebar

### 1.1 Thread model + persistence (pure, tested)
New `src/sidepanel/threads.ts`:
```ts
type TurnMode = 'ask' | 'agent';
interface Turn { id; mode; prompt; tab?: { title; url }; steps: FeedItem[]; result?; error?; status: 'running'|'completed'|'failed'|'stopped'; createdAt }
interface Thread { id; title; createdAt; updatedAt; turns: Turn[] }
```
- `loadThreads()/saveThreads()` on `chrome.storage.local` key `browgent_threads`; cap 20 threads (drop oldest by `updatedAt`), 30 turns/thread.
- `applyAgentEvent(turn, event): Turn` — move the step/thought/action/action_result/done/error reducer out of `App.tsx` (port listener, ~lines 179–239) into this pure function.
- Privacy when persisting: redact `type` action text (`[N chars redacted]`, same rule as `agent.ts` history), never store screenshots or file contents.
- `toConversation(thread, maxTurns = 6, maxChars = 4000)` → compact `{ prompt, result }[]` (result or error) for follow-ups.
- `tests/sidepanel/threads.test.ts`: reducer per event type, caps, redaction, `toConversation` truncation.

### 1.2 Follow-up context in the agent
- `AgentOptions.conversation?: { prompt: string; result: string }[]` (`src/background/agent.ts`).
- `buildPromptMessages`: add a `CONVERSATION SO FAR` block inside its own nonce-tagged data block (prior results derive from page content → untrusted data), stating that the `USER GOAL` is the current request and earlier turns are context for references like "the second one" / "do the same".
- `buildVerificationMessages`: include the same block so the auditor can resolve references.
- `src/background/index.ts`: pass `conversation` through `START_AGENT`.
- Test in `tests/background/agent.test.ts`: conversation appears inside the nonce block; absent when empty.

### 1.3 Ask mode (single call, no loop, no auditor)
- `AgentController.answer(tabId, question, onProgress)` in `agent.ts`, reusing the private `ensureContentScript`, `capturePageDOM`, `captureViewportScreenshot`, plus `formatAttachedFilesForPrompt` and `queryLLMRaw`. Prompt: answer from page text/screenshot/files/conversation in markdown; page content is untrusted data (same nonce wrapping as `buildPromptMessages`). Emits `done` / `error` like `run()`.
- `index.ts`: `START_AGENT` payload gains `mode: 'ask' | 'agent'`; `ask` calls `answer()`, otherwise `run()`. Same restricted-URL guard; no auto-navigation in Ask mode.
- Tests: `answer()` makes exactly one LLM call and returns its text; restricted URL errors.

### 1.4 Chat UI
- `src/sidepanel/components/StepFeed.tsx` → reduce to `StepList` (step cards + action badges only); summary/error/suggestions/scroll logic move out.
- New `src/sidepanel/components/ChatThread.tsx`: renders turns — user bubble (prompt + small tab chip); agent turns show a collapsible "Worked for N steps" wrapping `StepList` (expanded while running); then the result via `Markdown` with copy button, or an error banner. Empty thread → existing `DEFAULT_PROMPTS` suggestions. Keep the "Latest" jump button.
- New `src/sidepanel/components/ThreadList.tsx`: overlay list of threads (title, relative time), select, delete, "Clear all".
- `GoalInput.tsx`: Ask/Agent segmented toggle (last mode persisted in `chrome.storage.local`); **Enter sends, Shift+Enter newline** (Ctrl+Enter still works); placeholder reflects mode; typing allowed while running, Send disabled.
- `App.tsx`: replace `feedItems/finalSummary/errorMessage` with `threads` + `activeThreadId` + `activeTurnIdRef`; header gets "New chat" and "History" buttons; `handleRun` appends a turn and sends `{ mode, conversation: toConversation(thread) }`; port listener calls `applyAgentEvent`; threads saved (debounced ~300 ms) on change. Thread title = first prompt truncated to 60 chars.
- Update `tests/sidepanel/App.test.tsx` for the chat flow (send → turn appears → done renders markdown; follow-up sends conversation; new chat; history select).

### 1.5 Keyboard shortcut + selection context menu
- `src/manifest.json`: `"commands": { "_execute_action": { "suggested_key": { "default": "Alt+B" } } }` (action click already opens the panel via `setPanelBehavior`); add `"contextMenus"` permission; `minimum_chrome_version` → `"116"` (for `chrome.sidePanel.open`).
- `index.ts`: on install create menu `Ask Browgent about "%s"` (context `selection`); on click → `chrome.sidePanel.open({ windowId })`, then `chrome.storage.session.set({ browgent_pending_prompt: { text, mode: 'ask' } })`.
- `App.tsx`: on mount + `chrome.storage.onChanged`, consume `browgent_pending_prompt` → new thread, composer prefilled (`Explain: "<selection>"`), Ask mode, not auto-sent; then remove the key.

### 1.6 Docs + version
- `PRIVACY.md`: threads (prompts, results, step metadata with typed text redacted) stored locally, capped, clearable.
- `README.md`: Ask vs Agent, threads, Alt+B, context menu.
- Bump `package.json`, `src/manifest.json`, header badge in `App.tsx` to `0.5.0`.

---

## Commit order
0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6. Each commit keeps `npm run typecheck && npm run lint && npm test` green (coverage thresholds in `vite.config.ts` must hold).

## Verification
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`.
2. Load `dist/` unpacked in Chrome ≥116 and check:
   - **Frames**: page with embedded iframes (e.g. YouTube embed + form) — agent sees and clicks top-page elements every step.
   - **Dialogs**: `https://the-internet.herokuapp.com/javascript_alerts`, "click each button" — alert accepted, confirm/prompt dismissed and reported in the feed, no hang.
   - **Markdown**: "Extract all products with names and prices into a markdown table" on a shop page → rendered table.
   - **Follow-up**: search on Google, then "open the second result" in the same thread → correct result opened.
   - **Ask mode**: on an article, "summarize in 5 bullets" → one LLM call, rendered answer, no steps.
   - **Persistence**: restart Chrome → threads in History; open, delete, clear all.
   - **Entry points**: Alt+B opens the panel; select text → right-click "Ask Browgent about …" → panel opens with prefilled Ask prompt.
