import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDomain,
  addDomainFact,
  getDomainFacts,
  deleteDomainFact,
  clearDomainFacts,
  loadDomainMemory,
  saveDomainMemory,
  loadGlobalInstructions,
  saveGlobalInstructions,
  formatDomainMemoryForPrompt,
  MAX_FACTS_PER_DOMAIN,
  MAX_FACT_LENGTH,
} from '../../src/background/memory';

describe('Domain & Global Memory Engine', () => {
  let mockStorage: Record<string, unknown> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((keys: string[] | string) => {
            const result: Record<string, unknown> = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const k of keyArray) {
              if (k in mockStorage) result[k] = mockStorage[k];
            }
            return Promise.resolve(result);
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(mockStorage, items);
            return Promise.resolve();
          }),
        },
      },
    });
  });

  describe('extractDomain', () => {
    it('normalizes full URLs to canonical hostname/domain', () => {
      expect(extractDomain('https://github.com/Manvendra08/Browgent/pull/1')).toBe('github.com');
      expect(extractDomain('https://sub.example.com/some/path?query=1')).toBe('sub.example.com');
      expect(extractDomain('http://localhost:3000/dashboard')).toBe('localhost');
      expect(extractDomain('github.com')).toBe('github.com');
    });

    it('handles invalid or empty URLs safely', () => {
      expect(extractDomain('')).toBeNull();
      expect(extractDomain('about:blank')).toBeNull();
      expect(extractDomain('chrome://extensions')).toBeNull();
    });
  });

  describe('addDomainFact', () => {
    it('adds a valid fact and assigns ID and timestamps', async () => {
      const res = await addDomainFact('https://github.com/settings', 'Always use 2FA hardware key');
      expect(res.success).toBe(true);
      expect(res.fact?.fact).toBe('Always use 2FA hardware key');
      expect(res.fact?.id).toBeDefined();

      const facts = await getDomainFacts('github.com');
      expect(facts.length).toBe(1);
      expect(facts[0].fact).toBe('Always use 2FA hardware key');
    });

    it('enforces hard limit of 10 facts per domain via FIFO eviction', async () => {
      for (let i = 1; i <= MAX_FACTS_PER_DOMAIN; i++) {
        await addDomainFact('github.com', `Fact ${i}`);
      }

      let facts = await getDomainFacts('github.com');
      expect(facts.length).toBe(MAX_FACTS_PER_DOMAIN);
      expect(facts[0].fact).toBe('Fact 1');

      // Adding the 11th fact should evict the 1st fact (FIFO)
      const res = await addDomainFact('github.com', 'Fact 11');
      expect(res.success).toBe(true);
      expect(res.evicted?.fact).toBe('Fact 1');

      facts = await getDomainFacts('github.com');
      expect(facts.length).toBe(MAX_FACTS_PER_DOMAIN);
      expect(facts.some((f) => f.fact === 'Fact 1')).toBe(false);
      expect(facts.some((f) => f.fact === 'Fact 11')).toBe(true);
    });

    it('deduplicates identical facts by updating timestamp instead of creating duplicates', async () => {
      await addDomainFact('github.com', 'Prefer dark mode');
      const factsBefore = await getDomainFacts('github.com');

      const res = await addDomainFact('github.com', '  prefer dark mode  ');
      expect(res.success).toBe(true);

      const factsAfter = await getDomainFacts('github.com');
      expect(factsAfter.length).toBe(1);
      expect(factsAfter[0].id).toBe(factsBefore[0].id);
    });

    it('bounds fact length to MAX_FACT_LENGTH', async () => {
      const longText = 'A'.repeat(500);
      const res = await addDomainFact('github.com', longText);
      expect(res.success).toBe(true);
      expect(res.fact?.fact.length).toBe(MAX_FACT_LENGTH);
    });
  });

  describe('deleteDomainFact & clearDomainFacts', () => {
    it('deletes an existing fact by ID', async () => {
      const { fact } = await addDomainFact('github.com', 'Use squash merge');
      expect(fact).toBeDefined();

      const deleted = await deleteDomainFact('github.com', fact!.id);
      expect(deleted).toBe(true);

      const facts = await getDomainFacts('github.com');
      expect(facts.length).toBe(0);
    });

    it('clears all facts for a domain', async () => {
      await addDomainFact('github.com', 'Rule 1');
      await addDomainFact('github.com', 'Rule 2');

      await clearDomainFacts('github.com');
      const facts = await getDomainFacts('github.com');
      expect(facts.length).toBe(0);
    });
  });

  describe('formatDomainMemoryForPrompt', () => {
    it('formats facts cleanly into a prompt block', () => {
      const facts = [
        { id: '1', fact: 'Use org Engineering', createdAt: 1, updatedAt: 1 },
        { id: '2', fact: 'Branch naming: feature/*', createdAt: 2, updatedAt: 2 },
      ];
      const formatted = formatDomainMemoryForPrompt('github.com', facts);
      expect(formatted).toContain('=== Site-Specific Memory (github.com) ===');
      expect(formatted).toContain('- Use org Engineering');
      expect(formatted).toContain('- Branch naming: feature/*');
    });

    it('returns empty string if no facts exist', () => {
      expect(formatDomainMemoryForPrompt('github.com', [])).toBe('');
    });
  });

  describe('Global Instructions (Tier 3)', () => {
    it('saves and loads global instructions', async () => {
      await saveGlobalInstructions('Always return structured bullet points.');
      const loaded = await loadGlobalInstructions();
      expect(loaded).toBe('Always return structured bullet points.');
    });

    it('truncates excessive instructions to 2000 characters', async () => {
      const hugeText = 'X'.repeat(3000);
      await saveGlobalInstructions(hugeText);
      const loaded = await loadGlobalInstructions();
      expect(loaded.length).toBe(2000);
    });

    it('loads and saves raw domain memory store', async () => {
      await saveDomainMemory({ 'example.com': [{ id: 'f1', fact: 'test', createdAt: 1, updatedAt: 1 }] });
      const store = await loadDomainMemory();
      expect(store['example.com']).toBeDefined();
      expect(store['example.com'][0].fact).toBe('test');
    });
  });
});
