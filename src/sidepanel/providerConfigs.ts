import { LLMConfig, ProviderType } from '../background/llm/types';

export const OMNIROUTE_DEFAULT_BASE_URL = 'http://localhost:20128/v1/chat/completions';

/**
 * Endpoint/model defaults used when a provider has never been configured.
 * `baseUrl: ''` means "use the provider's built-in endpoint".
 */
export const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; model: string }> = {
  omniroute: { baseUrl: OMNIROUTE_DEFAULT_BASE_URL, model: 'anti' },
  openai: { baseUrl: '', model: '' },
  'openai-compat': { baseUrl: '', model: '' },
  gemini: { baseUrl: '', model: '' },
  anthropic: { baseUrl: '', model: '' },
};

export const PROVIDER_TYPES: ProviderType[] = [
  'omniroute',
  'openai',
  'openai-compat',
  'gemini',
  'anthropic',
];

export interface ProviderAccount {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderEntry {
  provider: ProviderType;
  activeAccountId: string;
  accounts: ProviderAccount[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** LLM settings remembered per provider, supporting multiple accounts with backward compatibility. */
export type ProviderConfigMap = Partial<Record<ProviderType, ProviderEntry | LLMConfig>>;

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'omniroute',
  ...PROVIDER_DEFAULTS.omniroute,
};

function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (PROVIDER_TYPES as string[]).includes(value);
}

/**
 * Normalizes an entry in the map into a full ProviderEntry with at least one account.
 */
export function normalizeProviderEntry(entry: unknown, provider: ProviderType): ProviderEntry {
  const fallbackDefaults = PROVIDER_DEFAULTS[provider] || { baseUrl: '', model: '' };

  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    if (Array.isArray(obj.accounts) && obj.accounts.length > 0) {
      const accounts = obj.accounts as ProviderAccount[];
      const activeId =
        typeof obj.activeAccountId === 'string' &&
        accounts.some((a) => a.id === obj.activeAccountId)
          ? (obj.activeAccountId as string)
          : accounts[0].id;
      const activeAccount = accounts.find((a) => a.id === activeId) || accounts[0];

      return {
        provider,
        activeAccountId: activeId,
        accounts,
        apiKey: activeAccount.apiKey,
        baseUrl: activeAccount.baseUrl ?? fallbackDefaults.baseUrl,
        model: activeAccount.model ?? fallbackDefaults.model,
        temperature: activeAccount.temperature,
        maxTokens: activeAccount.maxTokens,
      };
    }

    // Legacy single-account config
    const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey : undefined;
    const baseUrl = typeof obj.baseUrl === 'string' ? obj.baseUrl : fallbackDefaults.baseUrl;
    const model = typeof obj.model === 'string' ? obj.model : fallbackDefaults.model;
    const temperature = typeof obj.temperature === 'number' ? obj.temperature : undefined;
    const maxTokens = typeof obj.maxTokens === 'number' ? obj.maxTokens : undefined;

    const initialAccount: ProviderAccount = {
      id: 'default',
      name: 'Default',
      apiKey,
      baseUrl,
      model,
      temperature,
      maxTokens,
    };

    return {
      provider,
      activeAccountId: 'default',
      accounts: [initialAccount],
      apiKey,
      baseUrl,
      model,
      temperature,
      maxTokens,
    };
  }

  // Brand new entry
  const defaultAccount: ProviderAccount = {
    id: 'default',
    name: 'Default',
    baseUrl: fallbackDefaults.baseUrl,
    model: fallbackDefaults.model,
  };

  return {
    provider,
    activeAccountId: 'default',
    accounts: [defaultAccount],
    baseUrl: fallbackDefaults.baseUrl,
    model: fallbackDefaults.model,
  };
}

/**
 * Returns the list of configured accounts for a provider.
 */
export function getProviderAccounts(
  map: ProviderConfigMap,
  provider: ProviderType,
): ProviderAccount[] {
  if (!isProviderType(provider)) return [];
  const entry = normalizeProviderEntry(map[provider], provider);
  return entry.accounts;
}

/**
 * Returns the active account ID for a provider.
 */
export function getActiveAccountId(map: ProviderConfigMap, provider: ProviderType): string {
  if (!isProviderType(provider)) return 'default';
  const entry = normalizeProviderEntry(map[provider], provider);
  return entry.activeAccountId;
}

/**
 * Stores a config under its own provider without mutating the input map.
 * Updates the currently active account, preserving all sibling accounts.
 */
export function stashProviderConfig(
  map: ProviderConfigMap,
  config: LLMConfig,
  accountName?: string,
): ProviderConfigMap {
  if (!isProviderType(config.provider)) return { ...map };
  const provider = config.provider;
  const current = normalizeProviderEntry(map[provider], provider);
  const activeId = current.activeAccountId;

  const updatedAccounts = current.accounts.map((acc) => {
    if (acc.id === activeId) {
      return {
        ...acc,
        name: accountName || acc.name,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      };
    }
    return acc;
  });

  const nextEntry: ProviderEntry = {
    provider,
    activeAccountId: activeId,
    accounts: updatedAccounts,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };

  return { ...map, [provider]: nextEntry };
}

/**
 * Adds a new account profile for a provider and sets it as active.
 */
export function addProviderAccount(
  map: ProviderConfigMap,
  provider: ProviderType,
  name?: string,
): { nextMap: ProviderConfigMap; newAccount: ProviderAccount } {
  const current = normalizeProviderEntry(map[provider], provider);
  const accountIndex = current.accounts.length + 1;
  const accountId = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const accountName = name || `Account ${accountIndex}`;
  const defaults = PROVIDER_DEFAULTS[provider] || { baseUrl: '', model: '' };

  const newAccount: ProviderAccount = {
    id: accountId,
    name: accountName,
    baseUrl: defaults.baseUrl,
    model: defaults.model,
  };

  const nextAccounts = [...current.accounts, newAccount];
  const nextEntry: ProviderEntry = {
    provider,
    activeAccountId: accountId,
    accounts: nextAccounts,
    baseUrl: newAccount.baseUrl,
    model: newAccount.model,
  };

  return {
    nextMap: { ...map, [provider]: nextEntry },
    newAccount,
  };
}

/**
 * Deletes an account profile. If it was active, sets the first remaining account active.
 * Refuses deletion if only 1 account exists.
 */
export function deleteProviderAccount(
  map: ProviderConfigMap,
  provider: ProviderType,
  accountId: string,
): ProviderConfigMap {
  const current = normalizeProviderEntry(map[provider], provider);
  if (current.accounts.length <= 1) return map;

  const nextAccounts = current.accounts.filter((a) => a.id !== accountId);
  const nextActiveId =
    current.activeAccountId === accountId ? nextAccounts[0].id : current.activeAccountId;
  const activeAcc = nextAccounts.find((a) => a.id === nextActiveId) || nextAccounts[0];

  const nextEntry: ProviderEntry = {
    provider,
    activeAccountId: nextActiveId,
    accounts: nextAccounts,
    apiKey: activeAcc.apiKey,
    baseUrl: activeAcc.baseUrl,
    model: activeAcc.model,
    temperature: activeAcc.temperature,
    maxTokens: activeAcc.maxTokens,
  };

  return { ...map, [provider]: nextEntry };
}

/**
 * Switches the active account for a provider.
 */
export function switchProviderAccount(
  map: ProviderConfigMap,
  provider: ProviderType,
  accountId: string,
): ProviderConfigMap {
  const current = normalizeProviderEntry(map[provider], provider);
  const targetAcc = current.accounts.find((a) => a.id === accountId);
  if (!targetAcc) return map;

  const nextEntry: ProviderEntry = {
    ...current,
    activeAccountId: accountId,
    apiKey: targetAcc.apiKey,
    baseUrl: targetAcc.baseUrl,
    model: targetAcc.model,
    temperature: targetAcc.temperature,
    maxTokens: targetAcc.maxTokens,
  };

  return { ...map, [provider]: nextEntry };
}

/**
 * Resolves the config to load for a provider: active account settings when present,
 * otherwise provider defaults. Never returns a config for another provider.
 */
export function configForProvider(map: ProviderConfigMap, provider: ProviderType): LLMConfig {
  const entry = normalizeProviderEntry(map[provider], provider);
  const activeAcc = entry.accounts.find((a) => a.id === entry.activeAccountId) || entry.accounts[0];

  return {
    provider,
    apiKey: activeAcc.apiKey,
    baseUrl: activeAcc.baseUrl ?? PROVIDER_DEFAULTS[provider].baseUrl,
    model: activeAcc.model ?? PROVIDER_DEFAULTS[provider].model,
    temperature: activeAcc.temperature,
    maxTokens: activeAcc.maxTokens,
  };
}

/** True when the provider has any account with settings saved from an earlier session. */
export function hasSavedConfig(map: ProviderConfigMap, provider: ProviderType): boolean {
  const entry = normalizeProviderEntry(map[provider], provider);
  return entry.accounts.some((acc) =>
    Boolean((acc.apiKey || '').trim() || (acc.baseUrl || '').trim() || (acc.model || '').trim()),
  );
}

/**
 * Migration/backfill: ensures the active config is present in the map.
 * Users upgrading from a single-config install keep working immediately.
 */
export function seedProviderConfigs(
  map: ProviderConfigMap,
  activeConfig: LLMConfig,
): ProviderConfigMap {
  if (!isProviderType(activeConfig.provider)) return { ...map };
  if (map[activeConfig.provider]) return { ...map };
  return stashProviderConfig(map, activeConfig);
}
