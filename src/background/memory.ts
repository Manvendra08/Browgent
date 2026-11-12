export interface DomainFact {
  id: string;
  fact: string;
  createdAt: number;
  updatedAt: number;
}

export type DomainMemoryStore = Record<string, DomainFact[]>;

export const DOMAIN_MEMORY_STORAGE_KEY = 'browgent_domain_memory';
export const GLOBAL_INSTRUCTIONS_STORAGE_KEY = 'browgent_global_instructions';

export const MAX_FACTS_PER_DOMAIN = 10;
export const MAX_DOMAINS = 50;
export const MAX_FACT_LENGTH = 250;
export const MAX_GLOBAL_INSTRUCTIONS_LENGTH = 2000;

/**
 * Extracts the canonical hostname/domain from a URL or raw domain string.
 * Returns null for blank, internal browser pages, or invalid URLs.
 */
export function extractDomain(urlOrDomain?: string | null): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') {
    return null;
  }

  const trimmed = urlOrDomain.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed.startsWith('chrome://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('edge://') ||
    trimmed.startsWith('chrome-extension://')
  ) {
    return null;
  }

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      return parsed.hostname;
    }

    // Bare hostname/domain or domain with path
    const fakeUrl = new URL(`https://${trimmed.split('/')[0]}`);
    return fakeUrl.hostname;
  } catch {
    return null;
  }
}

/**
 * Loads all domain memories from persistent storage.
 */
export async function loadDomainMemory(): Promise<DomainMemoryStore> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return {};
  }

  try {
    const result = await chrome.storage.local.get([DOMAIN_MEMORY_STORAGE_KEY]);
    const stored = result[DOMAIN_MEMORY_STORAGE_KEY];
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      return stored as DomainMemoryStore;
    }
    return {};
  } catch (err: unknown) {
    console.warn('[Browgent Memory] Failed to load domain memory:', err);
    return {};
  }
}

/**
 * Saves domain memories to persistent storage.
 */
export async function saveDomainMemory(store: DomainMemoryStore): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  try {
    await chrome.storage.local.set({ [DOMAIN_MEMORY_STORAGE_KEY]: store });
  } catch (err: unknown) {
    console.warn('[Browgent Memory] Failed to save domain memory:', err);
  }
}

/**
 * Retrieves all saved facts for a specific domain/URL.
 */
export async function getDomainFacts(urlOrDomain: string): Promise<DomainFact[]> {
  const domain = extractDomain(urlOrDomain);
  if (!domain) return [];

  const store = await loadDomainMemory();
  return store[domain] || [];
}

export interface AddFactResult {
  success: boolean;
  fact?: DomainFact;
  evicted?: DomainFact;
  error?: string;
}

/**
 * Adds a fact to a domain memory with hard limits (max 10 facts per domain, FIFO eviction).
 */
export async function addDomainFact(urlOrDomain: string, factText: string): Promise<AddFactResult> {
  const domain = extractDomain(urlOrDomain);
  if (!domain) {
    return { success: false, error: 'Cannot record memory for invalid or internal browser domain' };
  }

  const normalized = factText.trim().slice(0, MAX_FACT_LENGTH);
  if (!normalized) {
    return { success: false, error: 'Fact text cannot be empty' };
  }

  const store = await loadDomainMemory();
  const facts = store[domain] ? [...store[domain]] : [];

  // Deduplication check: case-insensitive match
  const existingIdx = facts.findIndex(
    (f) => f.fact.toLowerCase() === normalized.toLowerCase(),
  );

  if (existingIdx !== -1) {
    facts[existingIdx] = {
      ...facts[existingIdx],
      fact: normalized,
      updatedAt: Date.now(),
    };
    store[domain] = facts;
    await saveDomainMemory(store);
    return { success: true, fact: facts[existingIdx] };
  }

  let evicted: DomainFact | undefined;

  // Enforce FIFO limit: if already at cap, evict oldest
  if (facts.length >= MAX_FACTS_PER_DOMAIN) {
    evicted = facts.shift(); // Evicts the oldest item
  }

  const newFact: DomainFact = {
    id: `fact-${Math.random().toString(36).slice(2, 10)}`,
    fact: normalized,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  facts.push(newFact);
  store[domain] = facts;

  // Global domain cap: keep at most MAX_DOMAINS
  const domains = Object.keys(store);
  if (domains.length > MAX_DOMAINS) {
    // Evict domain with oldest fact
    let oldestDomain = domains[0];
    let oldestTime = Infinity;

    for (const d of domains) {
      const dFacts = store[d];
      const maxTime = dFacts.length > 0 ? Math.max(...dFacts.map((f) => f.updatedAt)) : 0;
      if (maxTime < oldestTime) {
        oldestTime = maxTime;
        oldestDomain = d;
      }
    }
    delete store[oldestDomain];
  }

  await saveDomainMemory(store);
  return { success: true, fact: newFact, evicted };
}

/**
 * Deletes a fact from a domain memory by its ID or exact text.
 */
export async function deleteDomainFact(urlOrDomain: string, factIdOrText: string): Promise<boolean> {
  const domain = extractDomain(urlOrDomain);
  if (!domain) return false;

  const store = await loadDomainMemory();
  const facts = store[domain];
  if (!facts || facts.length === 0) return false;

  const target = factIdOrText.trim().toLowerCase();
  const filtered = facts.filter(
    (f) => f.id !== factIdOrText && f.fact.toLowerCase() !== target,
  );

  if (filtered.length === facts.length) {
    return false;
  }

  if (filtered.length === 0) {
    delete store[domain];
  } else {
    store[domain] = filtered;
  }

  await saveDomainMemory(store);
  return true;
}

/**
 * Clears all facts for a domain.
 */
export async function clearDomainFacts(urlOrDomain: string): Promise<void> {
  const domain = extractDomain(urlOrDomain);
  if (!domain) return;

  const store = await loadDomainMemory();
  if (store[domain]) {
    delete store[domain];
    await saveDomainMemory(store);
  }
}

/**
 * Formats domain facts into an LLM prompt block.
 */
export function formatDomainMemoryForPrompt(domain: string, facts: DomainFact[]): string {
  if (!facts || facts.length === 0) {
    return '';
  }

  const lines = facts.map((f) => `- ${f.fact}`);
  return `=== Site-Specific Memory (${domain}) ===\n${lines.join('\n')}\n`;
}

/**
 * Loads user global directives (Tier 3 memory).
 */
export async function loadGlobalInstructions(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return '';
  }

  try {
    const result = await chrome.storage.local.get([GLOBAL_INSTRUCTIONS_STORAGE_KEY]);
    return typeof result[GLOBAL_INSTRUCTIONS_STORAGE_KEY] === 'string'
      ? result[GLOBAL_INSTRUCTIONS_STORAGE_KEY]
      : '';
  } catch (err: unknown) {
    console.warn('[Browgent Memory] Failed to load global instructions:', err);
    return '';
  }
}

/**
 * Saves user global directives (Tier 3 memory), capped at MAX_GLOBAL_INSTRUCTIONS_LENGTH.
 */
export async function saveGlobalInstructions(instructions: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  try {
    const trimmed = (instructions || '').slice(0, MAX_GLOBAL_INSTRUCTIONS_LENGTH);
    await chrome.storage.local.set({ [GLOBAL_INSTRUCTIONS_STORAGE_KEY]: trimmed });
  } catch (err: unknown) {
    console.warn('[Browgent Memory] Failed to save global instructions:', err);
  }
}
