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

  it('includes the data-extractor skill with extraction guidance', () => {
    const dataExtractor = BUILTIN_SKILLS.find((s) => s.id === 'data-extractor');
    expect(dataExtractor).toBeDefined();
    expect(dataExtractor?.name).toBe('Data Extractor');
    expect(dataExtractor?.isBuiltIn).toBe(true);
    expect(dataExtractor?.systemPrompt).toContain('finish');
    expect(dataExtractor?.systemPrompt).toContain('scroll');
  });

  it('ships LinkedIn skills that stop short of sending, posting or applying', () => {
    const linkedin = BUILTIN_SKILLS.filter((s) => s.id.startsWith('linkedin-'));
    expect(linkedin.map((s) => s.id)).toEqual([
      'linkedin-job-scout',
      'linkedin-people-research',
      'linkedin-post-drafter',
      'linkedin-inbox-assistant',
    ]);
    linkedin.forEach((s) => {
      expect(s.isBuiltIn).toBe(true);
      expect(s.isActive).toBe(false);
      expect(s.systemPrompt).toMatch(/never/i);
    });
  });

  it('has unique ids across all built-in skills', () => {
    const ids = BUILTIN_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.length).toBeGreaterThan(0));
  });
});
