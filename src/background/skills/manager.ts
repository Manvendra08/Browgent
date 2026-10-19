import { Skill } from './types';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'form-filler',
    name: 'Form Filler',
    description: 'Expert in accurately populating web forms, checkout workflows, and user inputs.',
    systemPrompt: `You are an elite Form Filling Specialist.
- Inspect all input fields, dropdowns, radio buttons, and checkboxes before taking action.
- Fill required fields thoroughly using provided reference data or sensible defaults.
- Verify entered values before submitting.`,
    isActive: false,
    isBuiltIn: true,
  },
  {
    id: 'web-researcher',
    name: 'Web Researcher',
    description: 'Specialist in searching, cross-referencing sources, and extracting structured insights.',
    systemPrompt: `You are an expert Web Researcher.
- Navigate search results deliberately, evaluating the authority and relevance of links.
- Synthesize key findings and numbers clearly into structured bullet points.
- Prioritize factual precision and cite sources.`,
    isActive: false,
    isBuiltIn: true,
  },
  {
    id: 'ecommerce-shopper',
    name: 'E-commerce Shopper',
    description: 'Finds products, compares prices, checks reviews, and manages cart operations.',
    systemPrompt: `You are a savvy E-commerce shopping agent.
- Locate the requested item, compare prices, check delivery dates and ratings.
- Verify product specifications, size, and quantity before adding to cart.
- Stop and confirm before making any final irreversible payment.`,
    isActive: false,
    isBuiltIn: true,
  },
  {
    id: 'ui-bug-auditor',
    name: 'UI/UX Bug Auditor',
    description: 'Inspects pages for layout bugs, broken buttons, missing images, and console errors.',
    systemPrompt: `You are an exacting QA and Accessibility Auditor.
- Look for broken links, misplaced buttons, overflow issues, or non-functional controls.
- Highlight specific element IDs and provide concrete repro steps for any issues found.`,
    isActive: false,
    isBuiltIn: true,
  },
  {
    id: 'data-extractor',
    name: 'Data Extractor',
    description: 'Harvests structured data (tables, listings, prices, links) from pages into clean CSV/JSON.',
    systemPrompt: `You are a meticulous Data Extraction Specialist.
- Before extracting, scan the WHOLE result area: scroll down repeatedly if the list is longer than one viewport.
- Work row by row. For every visible record, capture ALL relevant fields (name, price, rating, link, date, etc.) — not just the first column.
- Keep values verbatim from the page; never invent, round, or normalize numbers.
- Accumulate records across steps. After each scroll, restate what you have so far internally in "thought" so nothing is lost between pages.
- If entries repeat after scrolling (infinite scroll), stop scrolling and finalize instead of duplicating rows.
- When extraction is complete, call "finish" and return the data inside the summary as a markdown table (or CSV rows) with one header row, exactly one row per record, and no extra commentary.
- If the data spans multiple pages, use pagination (click Next) until the last page, then finish with the combined dataset.`,
    isActive: false,
    isBuiltIn: true,
  },
];

export function parseSkillMarkdown(raw: string): Skill {
  const trimmed = raw.trim();
  const frontmatterMatch = trimmed.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/);

  let name = 'Custom Skill';
  let description = 'User-defined agent skill';
  let body = trimmed;

  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    body = frontmatterMatch[2].trim();

    yamlBlock.split('\n').forEach((line) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.substring(0, colonIdx).trim().toLowerCase();
        const value = line.substring(colonIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (key === 'name' && value) {
          name = value;
        } else if (key === 'description' && value) {
          description = value;
        }
      }
    });
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `skill-${Date.now()}`;

  return {
    id,
    name,
    description,
    systemPrompt: body,
    isActive: true,
    isBuiltIn: false,
  };
}

export async function loadStoredSkills(): Promise<Skill[]> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return BUILTIN_SKILLS;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['browgent_skills'], (result) => {
      if (result.browgent_skills && Array.isArray(result.browgent_skills)) {
        // Merge stored custom skills with built-in skills
        const stored = result.browgent_skills as Skill[];
        const customSkills = stored.filter((s) => !s.isBuiltIn);
        const builtInStates = new Map(stored.filter((s) => s.isBuiltIn).map((s) => [s.id, s.isActive]));

        const mergedBuiltins = BUILTIN_SKILLS.map((b) => ({
          ...b,
          isActive: builtInStates.has(b.id) ? Boolean(builtInStates.get(b.id)) : b.isActive,
        }));

        resolve([...mergedBuiltins, ...customSkills]);
      } else {
        resolve(BUILTIN_SKILLS);
      }
    });
  });
}

export async function saveStoredSkills(skills: Skill[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ browgent_skills: skills }, () => resolve());
  });
}
