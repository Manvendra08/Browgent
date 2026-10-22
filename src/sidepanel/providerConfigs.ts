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

/** LLM settings remembered per provider, so switching back restores them. */
export type ProviderConfigMap = Partial<Record<ProviderType, LLMConfig>>;

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'omniroute',
  ...PROVIDER_DEFAULTS.omniroute,
};

function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (PROVIDER_TYPES as string[]).includes(value);
}

/**
 * Stores a config under its own provider without mutating the input map.
 * Entries for other providers are preserved, so edits made to one provider
 * before switching away are never lost.
 */
export function stashProviderConfig(
  map: ProviderConfigMap,
  config: LLMConfig
): ProviderConfigMap {
  if (!isProviderType(config.provider)) return { ...map };
  return { ...map, [config.provider]: { ...config } };
}

/**
 * Resolves the config to load for a provider: its saved entry when present,
 * otherwise the provider defaults. Never returns a config for another provider.
 */
export function configForProvider(map: ProviderConfigMap, provider: ProviderType): LLMConfig {
  const stored = isProviderType(provider) ? map[provider] : undefined;
  return {
    provider,
    ...PROVIDER_DEFAULTS[provider],
    ...(stored ? { ...stored, provider } : {}),
  };
}

/** True when the provider has settings saved from an earlier session. */
export function hasSavedConfig(map: ProviderConfigMap, provider: ProviderType): boolean {
  const stored = map[provider];
  if (!stored) return false;
  return Boolean(
    (stored.apiKey || '').trim() ||
    (stored.baseUrl || '').trim() ||
    (stored.model || '').trim()
  );
}

/**
 * Migration/backfill: ensures the active config is present in the map.
 * Users upgrading from a single-config install keep working immediately.
 */
export function seedProviderConfigs(
  map: ProviderConfigMap,
  activeConfig: LLMConfig
): ProviderConfigMap {
  if (!isProviderType(activeConfig.provider)) return { ...map };
  if (map[activeConfig.provider]) return { ...map };
  return stashProviderConfig(map, activeConfig);
}
