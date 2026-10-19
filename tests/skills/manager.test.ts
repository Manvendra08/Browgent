import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown, BUILTIN_SKILLS } from '../../src/background/skills/manager';

describe('Skills Manager', () => {
  it('parses valid markdown skill with YAML frontmatter', () => {
    const raw = `---
name: form-filler
description: Expert form filling agent
---
Fill all input forms meticulously without missing required fields.`;

    const skill = parseSkillMarkdown(raw);
    expect(skill.name).toBe('form-filler');
    expect(skill.description).toBe('Expert form filling agent');
    expect(skill.systemPrompt).toContain('Fill all input forms meticulously');
  });

  it('handles markdown without frontmatter gracefully', () => {
    const raw = `Direct system instructions without yaml header.`;
    const skill = parseSkillMarkdown(raw);
    expect(skill.name).toBe('Custom Skill');
    expect(skill.systemPrompt).toContain('Direct system instructions');
  });

  it('includes default built-in skills', () => {
    expect(BUILTIN_SKILLS.length).toBeGreaterThan(0);
    const formFiller = BUILTIN_SKILLS.find((s) => s.id === 'form-filler');
    expect(formFiller).toBeDefined();
    expect(formFiller?.systemPrompt).toBeTruthy();
  });
});
