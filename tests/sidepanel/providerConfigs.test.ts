import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LLM_CONFIG,
  PROVIDER_DEFAULTS,
  configForProvider,
  hasSavedConfig,
  seedProviderConfigs,
  stashProviderConfig,
  type ProviderConfigMap,
} from '../../src/sidepanel/providerConfigs';

describe('provider settings memory', () => {
  it('keeps each provider\u2019s credentials under its own key', () => {
    const map = stashProviderConfig({}, {
      provider: 'openai',
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
    });

    expect(map.openai).toMatchObject({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-4o-mini' });
    expect(map.anthropic).toBeUndefined();
  });

  it('restores a saved provider config when switching back to it', () => {
    const map: ProviderConfigMap = {
      openai: { provider: 'openai', apiKey: 'sk-openai', model: 'gpt-4o' },
      gemini: { provider: 'gemini', apiKey: 'AIza-gemini', model: 'gemini-2.5-flash' },
    };

    expect(configForProvider(map, 'openai')).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-openai',
      model: 'gpt-4o',
    });
    expect(configForProvider(map, 'gemini')).toMatchObject({
      provider: 'gemini',
      apiKey: 'AIza-gemini',
      model: 'gemini-2.5-flash',
    });
  });

  it('falls back to provider defaults when nothing is saved', () => {
    expect(configForProvider({}, 'omniroute')).toMatchObject(PROVIDER_DEFAULTS.omniroute);
    expect(configForProvider({}, 'anthropic')).toMatchObject({ provider: 'anthropic', baseUrl: '', model: '' });
  });

  it('never returns another provider\u2019s credentials', () => {
    const map: ProviderConfigMap = {
      openai: { provider: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
    };

    const anthropic = configForProvider(map, 'anthropic');
    expect(anthropic.apiKey).toBeUndefined();
    expect(anthropic.baseUrl).toBe('');
  });

  it('does not mutate the input map', () => {
    const original: ProviderConfigMap = { openai: { provider: 'openai', apiKey: 'sk-1' } };
    const next = stashProviderConfig(original, { provider: 'gemini', apiKey: 'AIza-2' });

    expect(original.gemini).toBeUndefined();
    expect(next).not.toBe(original);
    expect(next.openai).toEqual({ provider: 'openai', apiKey: 'sk-1' });
  });

  it('treats empty or whitespace-only entries as unsaved', () => {
    expect(hasSavedConfig({ openai: { provider: 'openai', apiKey: '   ' } }, 'openai')).toBe(false);
    expect(hasSavedConfig({ openai: { provider: 'openai', model: 'gpt-4o' } }, 'openai')).toBe(true);
    expect(hasSavedConfig({}, 'openai')).toBe(false);
  });

  it('seeds the map from the active config so upgrades keep their credentials', () => {
    const seeded = seedProviderConfigs({}, {
      provider: 'anthropic',
      apiKey: 'sk-ant-legacy',
      model: 'claude-sonnet-4-5',
    });

    expect(seeded.anthropic).toMatchObject({ apiKey: 'sk-ant-legacy', model: 'claude-sonnet-4-5' });
  });

  it('does not overwrite an existing entry when seeding', () => {
    const seeded = seedProviderConfigs(
      { anthropic: { provider: 'anthropic', apiKey: 'newer-key' } },
      { provider: 'anthropic', apiKey: 'stale-active-key' }
    );

    expect(seeded.anthropic?.apiKey).toBe('newer-key');
  });

  it('preserves temperature and maxTokens across a stash/restore round trip', () => {
    const map = stashProviderConfig({}, {
      provider: 'openai-compat',
      baseUrl: 'http://localhost:1234/v1/chat/completions',
      model: 'local-model',
      temperature: 0,
      maxTokens: 512,
    });

    expect(configForProvider(map, 'openai-compat')).toMatchObject({
      baseUrl: 'http://localhost:1234/v1/chat/completions',
      model: 'local-model',
      temperature: 0,
      maxTokens: 512,
    });
  });

  it('exposes a sane default config', () => {
    expect(DEFAULT_LLM_CONFIG.provider).toBe('omniroute');
    expect(DEFAULT_LLM_CONFIG.model).toBe(PROVIDER_DEFAULTS.omniroute.model);
    expect(DEFAULT_LLM_CONFIG.baseUrl).toBe(PROVIDER_DEFAULTS.omniroute.baseUrl);
  });
});
