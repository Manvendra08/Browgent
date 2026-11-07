# Chrome Web Store Asset Checklist for Browgent

## Pre-Build Verification

- [ ] `npm run build` completes without errors
- [ ] `npm run package` generates `browgent-<version>.zip`
- [ ] Unzip and verify `manifest.json` is at **root** of archive
- [ ] Load unpacked `dist/` in Chrome → no console errors
- [ ] Side panel opens, settings persist, agent runs a test task

---

## Manifest & Permissions Audit (`src/manifest.json`)

| Item | Required | Status |
|------|----------|--------|
| `manifest_version: 3` | ✅ | |
| `name: "Browgent"` | ✅ | |
| `version` matches `package.json` | ✅ | |
| `description` ≤ 132 chars | ✅ | |
| `default_locale: "en"` | ✅ | |
| `icons`: 16, 32, 48, 128 PNG | ✅ | |
| `side_panel.default_path: "sidepanel.html"` | ✅ | |
| `background.service_worker: "background.js"` | ✅ | |
| `permissions`: `sidePanel`, `debugger`, `tabs`, `scripting`, `storage`, `activeTab`, `contextMenus`, `commands` | ✅ | |
| `host_permissions`: `<all_urls>` | ✅ | |
| `commands`: `Alt+B` for toggle | ✅ | |
| `content_security_policy` allows `https://` LLM endpoints | ✅ | |
| `web_accessible_resources` for content script assets | ✅ | |

---

## Visual Assets (Chrome Web Store Dashboard)

### Required
- [ ] **128×128 icon** (PNG, no alpha) — `public/icons/icon-128.png`
- [ ] **Store listing screenshot 1** (1280×800 or 640×400) — Side panel open on a real page
- [ ] **Store listing screenshot 2** — Settings modal with providers
- [ ] **Store listing screenshot 3** — Agent in action (step feed visible)
- [ ] **Small promo tile** 440×280 (PNG/JPG)
- [ ] **Large promo tile** 920×680 (PNG/JPG) — optional but recommended
- [ ] **Marquee promo tile** 1400×560 (PNG/JPG) — optional for featuring

### Screenshot Guidelines
- Show real workflows, not placeholder text
- Mask any real credentials/API keys in screenshots
- Include light + dark theme variants if UI supports both
- Annotate key features with callouts (optional)

---

## Store Listing Copy

### Short Description (≤ 132 chars)
> Autonomous AI browser agent: chat with any page, automate tasks, extract data — all locally.

### Long Description (≤ 16,000 chars)
Structure:
1. **One-liner value prop**
2. **Key features** (bulleted, scannable)
3. **How it works** (2–3 sentences)
4. **Privacy promise** (no backend, local-only)
5. **Supported LLM providers**
6. **Keyboard shortcuts** (Alt+B, context menu)
7. **Pro features teaser** (skills, higher budgets)
8. **Support / feedback links**

### Category
- Primary: **Productivity**
- Secondary: **Developer Tools** (optional)

### Tags (max 5)
`AI`, `automation`, `browser`, `productivity`, `sidepanel`

---

## Privacy & Compliance

- [ ] **Privacy Policy** hosted at stable URL (e.g., `https://browgent.dev/privacy`)
- [ ] **Single Purpose Description** for Chrome Web Store:
> "Browgent is an AI-powered browser side panel that lets users converse with web pages, automate multi-step tasks, and extract structured data using local or cloud LLMs. It operates entirely client-side with no backend server."
- [ ] **Justification for `<all_urls>` host permission**:
> "Required to inject the content script on any page the user visits for DOM perception and CDP automation. The extension only acts on the active tab when the user explicitly invokes it."
- [ ] **Justification for `debugger` permission**:
> "Required for Chrome DevTools Protocol automation (native mouse/keyboard events). Only attached to the active tab upon user action."
- [ ] **Data Use Declaration**: Only sends page DOM + user goal to user-configured LLM endpoint. No data to developer servers.

---

## Testing Matrix (Before Submit)

| Environment | Test |
|-------------|------|
| Chrome Stable (latest) | Full smoke test |
| Chrome Beta | Full smoke test |
| Chrome Dev/Canary | Full smoke test |
| Windows 10/11 | Install, run, uninstall |
| macOS (Intel + Apple Silicon) | Install, run, uninstall |
| Linux (Ubuntu/Debian) | Install, run, uninstall |
| Incognito mode | Side panel opens, storage isolated |
| Multiple tabs | Tab switching updates ActiveTabBar |
| Restricted pages (`chrome://`, `file://`) | Blocked with warning toast |
| Long-running task (>2 min) | Service worker stays alive (heartbeat) |

---

## Release Process

1. **Version bump**: `npm version patch|minor|major` (updates `package.json` + `package-lock.json`)
2. **Changelog**: Update `CHANGELOG.md` with user-facing changes
3. **Build**: `npm run package` → `browgent-X.Y.Z.zip`
4. **Test install**: Load `dist/` unpacked → verify version in `chrome://extensions`
5. **Upload**: Chrome Web Store Developer Dashboard → "New version" → upload zip
6. **Rollout**: Start with 10% → monitor crash analytics → 100%
7. **Tag release**: `git tag vX.Y.Z && git push origin vX.Y.Z`

---

## Post-Launch Monitoring

- [ ] Chrome Web Store **Ratings & Reviews** (daily for first week)
- [ ] **Crash analytics** in Developer Dashboard
- [ ] **Install/Uninstall trends** (weekly)
- [ ] **Support channels** (GitHub Issues, email) for regression reports

---

## Common Rejection Reasons & Fixes

| Rejection | Fix |
|-----------|-----|
| "Manifest V2" | Ensure `manifest_version: 3` |
| "Host permission too broad" | Add justification in Single Purpose Description |
| "Debugger permission not justified" | Explain CDP automation for active tab only |
| "Missing privacy policy" | Host at `https://<domain>/privacy` |
| "Icon missing alpha/transparency" | Re-export 128×128 as opaque PNG |
| "Screenshots don't match functionality" | Use real workflow captures |

---

## Pro/Enterprise Gating (Future)

When adding license-gated features:
- [ ] Add `CHECK_PREMIUM_LICENSE` message handler in `src/background/index.ts`
- [ ] Store license status in `chrome.storage.local` (signed JWT or simple flag)
- [ ] Gate premium skills in `manager.ts` → check `skill.license === 'pro'`
- [ ] Update Web Store description with "In-app purchase" disclosure
- [ ] Add "Upgrade" button in `SettingsModal.tsx` → deep link to billing