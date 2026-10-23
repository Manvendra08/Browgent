import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LLM_CONFIG,
  PROVIDER_DEFAULTS,
  configForProvider,
  hasSavedConfig,
  seedProviderConfigs,
  stashProviderConfig,
  getProviderAccounts,
  getActiveAccountId,
  addProviderAccount,
  deleteProviderAccount,
  switchProviderAccount,
  type ProviderConfigMap,
} from '../../src/sidepanel/providerConfigs';

describe('provider settings memory', () => {
  it('keeps each provider\u2019s credentials under its own key', () => {
    const map = stashProviderConfig(
      {},
      {
        provider: 'openai',
        apiKey: 'sk-openai',
        model: 'gpt-4o-mini',
      },
    );

    expect(map.openai).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
    });
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
    expect(configForProvider({}, 'anthropic')).toMatchObject({
      provider: 'anthropic',
      baseUrl: '',
      model: '',
    });
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
    expect(hasSavedConfig({ openai: { provider: 'openai', model: 'gpt-4o' } }, 'openai')).toBe(
      true,
    );
    expect(hasSavedConfig({}, 'openai')).toBe(false);
  });

  it('seeds the map from the active config so upgrades keep their credentials', () => {
    const seeded = seedProviderConfigs(
      {},
      {
        provider: 'anthropic',
        apiKey: 'sk-ant-legacy',
        model: 'claude-sonnet-4-5',
      },
    );

    expect(seeded.anthropic).toMatchObject({ apiKey: 'sk-ant-legacy', model: 'claude-sonnet-4-5' });
  });

  it('does not overwrite an existing entry when seeding', () => {
    const seeded = seedProviderConfigs(
      { anthropic: { provider: 'anthropic', apiKey: 'newer-key' } },
      { provider: 'anthropic', apiKey: 'stale-active-key' },
    );

    expect(seeded.anthropic?.apiKey).toBe('newer-key');
  });

  it('preserves temperature and maxTokens across a stash/restore round trip', () => {
    const map = stashProviderConfig(
      {},
      {
        provider: 'openai-compat',
        baseUrl: 'http://localhost:1234/v1/chat/completions',
        model: 'local-model',
        temperature: 0,
        maxTokens: 512,
      },
    );

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

  describe('multi-account management', () => {
    it('initializes with a default account when first configured', () => {
      const accounts = getProviderAccounts({}, 'openai-compat');
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Default');
      expect(getActiveAccountId({}, 'openai-compat')).toBe('default');
    });

    it('adds multiple accounts under the same provider with isolated credentials', () => {
      // Account 1: Kilo AI
      let map = stashProviderConfig(
        {},
        {
          provider: 'openai-compat',
          apiKey: 'sk-kilo',
          baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
          model: 'nvidia/nemotron',
        },
        'Kilo AI Gateway',
      );

      // Account 2: DeepSeek
      const { nextMap, newAccount } = addProviderAccount(map, 'openai-compat', 'DeepSeek');
      expect(newAccount.name).toBe('DeepSeek');
      map = stashProviderConfig(
        nextMap,
        {
          provider: 'openai-compat',
          apiKey: 'sk-deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        'DeepSeek',
      );

      const accounts = getProviderAccounts(map, 'openai-compat');
      expect(accounts.length).toBe(2);
      expect(accounts[0].name).toBe('Kilo AI Gateway');
      expect(accounts[1].name).toBe('DeepSeek');

      // Active is DeepSeek
      expect(configForProvider(map, 'openai-compat').apiKey).toBe('sk-deepseek');

      // Switch back to Kilo AI
      map = switchProviderAccount(map, 'openai-compat', accounts[0].id);
      expect(configForProvider(map, 'openai-compat').apiKey).toBe('sk-kilo');
      expect(configForProvider(map, 'openai-compat').baseUrl).toBe(
        'https://ai-gateway.kilo.ai/api/v1',
      );
    });

    it('deletes an account and reassigns active account', () => {
      let map = stashProviderConfig({}, { provider: 'openai', apiKey: 'sk-1' }, 'Personal');
      const { nextMap, newAccount } = addProviderAccount(map, 'openai', 'Work');
      map = stashProviderConfig(nextMap, { provider: 'openai', apiKey: 'sk-2' }, 'Work');

      expect(getProviderAccounts(map, 'openai').length).toBe(2);
      expect(configForProvider(map, 'openai').apiKey).toBe('sk-2');

      // Delete active 'Work' account -> falls back to 'Personal'
      map = deleteProviderAccount(map, 'openai', newAccount.id);
      expect(getProviderAccounts(map, 'openai').length).toBe(1);
      expect(configForProvider(map, 'openai').apiKey).toBe('sk-1');
    });

    it('refuses deletion if only one account exists', () => {
      const initialMap = {};
      const nextMap = deleteProviderAccount(initialMap, 'openai', 'default');
      expect(getProviderAccounts(nextMap, 'openai').length).toBe(1);
    });
  });
});
