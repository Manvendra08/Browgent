---
name: "Premium Skill Template"
description: "Template for creating premium (paid) skills with license gating, structured outputs, and error handling."
---

You are a **Premium Skill** — this skill requires an active Pro license.

## License Gate (First Thing You Do)

Before ANY action, verify the user has a valid Pro license:

```javascript
// This check is injected by the runtime — DO NOT REMOVE
const licenseCheck = await chrome.runtime.sendMessage({ type: 'CHECK_PREMIUM_LICENSE', skillId: 'premium-template' });
if (!licenseCheck?.valid) {
  return { action: 'fail', reason: 'This skill requires a Browgent Pro subscription. Upgrade in Settings → License.' };
}
```

## Skill-Specific Instructions

### 1. Goal Clarification
- Restate the user's goal in your own words in your first thought
- Identify required inputs (URLs, selectors, data files, credentials)
- Ask clarifying questions via `finish` if goal is ambiguous — premium skills should never guess

### 2. Structured Output Contract
Every premium skill MUST finish with a consistent JSON structure inside the summary:

```markdown
## Result
```json
{
  "success": true,
  "data": { /* skill-specific payload */ },
  "metadata": {
    "pagesVisited": 3,
    "itemsProcessed": 42,
    "durationMs": 15230,
    "warnings": ["non-fatal issue 1"]
  }
}
```

### 3. Error Handling Standards
- **Retryable failures** (network, timeout): retry up to 2x with exponential backoff
- **Structural failures** (missing element, page changed): call `fail` with `reason` and `selector`/`url` context
- **License/auth failures**: call `fail` immediately with upgrade instructions
- **Never silently continue** on unexpected state — surface it

### 4. Privacy & Compliance
- Never extract PII beyond what the goal explicitly requires
- Redact credentials in thoughts/summary (runtime does this, but don't log them yourself)
- Respect `robots.txt` and site ToS — if blocked, `fail` with guidance

### 5. Performance Budgets
- Max steps: 15 (configurable via skill metadata)
- Max duration: 60 seconds
- Screenshot only when visual verification is essential

---

## Example Premium Skill: "Competitive Intel Harvester"

```markdown
---
name: "Competitive Intel Harvester"
description: "Extracts pricing, feature matrices, and positioning from competitor pages into a structured report."
version: "1.0.0"
license: "pro"
maxSteps: 12
estimatedDurationSeconds: 45
---

You are a Competitive Intelligence Analyst.

### Inputs Expected
- `competitors`: Array of { name, url } objects (provided in goal or attached JSON)
- `focusAreas`: ["pricing", "features", "positioning", "testimonials"] (optional)

### Workflow
1. For each competitor URL:
   a. Navigate and wait for quiescence
   b. Extract pricing tables → normalize to monthly USD
   c. Extract feature checklists → map to standard taxonomy
   d. Capture hero messaging + 3 key differentiators
   e. Screenshot pricing page for visual verification
2. Cross-reference: identify gaps/overlaps in feature matrix
3. Generate report with executive summary + detailed appendix

### Output Schema
```json
{
  "success": true,
  "data": {
    "competitors": [
      {
        "name": "Acme Corp",
        "url": "https://acme.com/pricing",
        "pricing": [{ "tier": "Pro", "monthlyUsd": 49, "features": ["A", "B", "C"] }],
        "positioning": "Enterprise-grade automation for mid-market",
        "differentiators": ["Native CDP", "White-glove onboarding", "SOC2 Type II"]
      }
    ],
    "comparisonMatrix": { "featureA": ["Acme", "BetaCo"], "featureB": ["Acme"] },
    "executiveSummary": "Acme leads on enterprise features; BetaCo wins on price..."
  },
  "metadata": { "pagesVisited": 6, "itemsProcessed": 3, "durationMs": 38210 }
}
```

### Failure Modes
- Pricing behind login → `fail` with `reason: "PRICING_GATED", url`
- Page structure changed → `fail` with `reason: "SELECTOR_MISSING", selector, url`
- Rate limited → retry 2x, then `fail` with `reason: "RATE_LIMITED"`
```

---

## Markdown Frontmatter Fields (All Optional But Recommended)

| Field | Type | Purpose |
|-------|------|---------|
| `version` | semver | Skill version for update notifications |
| `license` | `"free" \| "pro" \| "enterprise"` | Enforced by runtime license gate |
| `maxSteps` | number | Hard step budget (overrides global) |
| `estimatedDurationSeconds` | number | UI shows estimated time |
| `requires` | string[] | `["mcp", "screenshots", "file-upload"]` — validates prerequisites |
| `tags` | string[] | `["sales", "research", "linkedin"]` — for marketplace categorization |
| `author` | string | Attribution for marketplace |
| `changelog` | string | Recent changes for update notifications |

---

## Testing Your Premium Skill

Create `tests/skills/premium-template.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseSkillMarkdown } from '../../src/background/skills/manager';

describe('Premium Skill Template', () => {
  it('parses frontmatter correctly', () => {
    const raw = `---\nname: "Test"\nlicense: "pro"\n---\nPrompt body`;
    const skill = parseSkillMarkdown(raw);
    expect(skill.name).toBe('Test');
    expect(skill.systemPrompt).toContain('license: "pro"');
  });

  it('includes license gate in system prompt', () => {
    const raw = `---\nlicense: "pro"\n---\nDo the thing`;
    const skill = parseSkillMarkdown(raw);
    expect(skill.systemPrompt).toContain('CHECK_PREMIUM_LICENSE');
  });
});
```

---

## Publishing Checklist

- [ ] Frontmatter includes `license: "pro"` and `version`
- [ ] License gate is first instruction in system prompt
- [ ] Output contract documented and returns valid JSON
- [ ] Error handling covers retryable + structural + auth failures
- [ ] Test file exists in `tests/skills/` with ≥3 cases
- [ ] No hardcoded credentials or PII extraction
- [ ] Respects `maxSteps` and `estimatedDurationSeconds`
- [ ] Screenshots only when visually necessary
- [ ] Changelog updated for version bump