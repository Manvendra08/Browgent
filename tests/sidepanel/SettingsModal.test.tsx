import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../../src/sidepanel/components/SettingsModal';
import type { LLMConfig } from '../../src/background/llm/types';
import type { ProviderConfigMap } from '../../src/sidepanel/providerConfigs';

vi.mock('../../src/sidepanel/modelFetch', () => ({
  fetchAvailableModels: vi.fn().mockResolvedValue({ models: [] }),
  testConnection: vi
    .fn()
    .mockResolvedValue({
      success: true,
      latencyMs: 85,
      message: 'Connected (85ms) • 5 models found',
    }),
  testMcpEndpoint: vi
    .fn()
    .mockResolvedValue({
      success: true,
      latencyMs: 40,
      message: 'Connected (40ms) • 3 tools available',
    }),
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  maxSteps: 25,
  onSaveMaxSteps: vi.fn(),
  mcpEndpoint: '',
  onSaveMcpEndpoint: vi.fn(),
  onAddCustomSkill: vi.fn(),
};

function renderModal(overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}) {
  const onSaveConfig = vi.fn();
  const props = {
    ...baseProps,
    config: {
      provider: 'omniroute',
      baseUrl: 'http://localhost:20128/v1/chat/completions',
      model: 'anti',
    } as LLMConfig,
    providerConfigs: {} as ProviderConfigMap,
    onSaveConfig,
    ...overrides,
  };
  render(<SettingsModal {...props} />);
  return { onSaveConfig, props };
}

const keyInput = () => screen.getByPlaceholderText('sk-...') as HTMLInputElement;
const modelInput = () =>
  screen.getByPlaceholderText(/pick a model|gpt-4o-mini|Claude\/Antigravity/) as HTMLInputElement;

/** Providers with saved settings carry a "(saved settings)" suffix in their label. */
const providerButton = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label}( \\(saved settings\\))?$`) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsModal per-provider memory', () => {
  it('restores the saved API key and model when switching back to a provider', () => {
    renderModal({
      providerConfigs: {
        anthropic: { provider: 'anthropic', apiKey: 'sk-ant-saved', model: 'claude-sonnet-4-5' },
      },
    });

    // Switch to Anthropic: its saved values must appear.
    fireEvent.click(providerButton('Anthropic'));
    expect(keyInput().value).toBe('sk-ant-saved');
    expect(modelInput().value).toBe('claude-sonnet-4-5');

    // Back to OmniRoute, then to Anthropic again: values must survive the round trip.
    fireEvent.click(providerButton('OmniRoute'));
    expect(keyInput().value).toBe('');
    fireEvent.click(providerButton('Anthropic'));
    expect(keyInput().value).toBe('sk-ant-saved');
    expect(modelInput().value).toBe('claude-sonnet-4-5');
  });

  it('keeps unsaved edits for the provider being left', () => {
    renderModal();

    fireEvent.click(providerButton('OpenAI'));
    fireEvent.change(keyInput(), { target: { value: 'sk-typed-not-saved' } });
    fireEvent.change(modelInput(), { target: { value: 'gpt-4o-mini' } });

    fireEvent.click(providerButton('Gemini'));
    expect(keyInput().value).toBe('');

    fireEvent.click(providerButton('OpenAI'));
    expect(keyInput().value).toBe('sk-typed-not-saved');
    expect(modelInput().value).toBe('gpt-4o-mini');
  });

  it('marks providers that already have saved settings', () => {
    renderModal({
      providerConfigs: { gemini: { provider: 'gemini', apiKey: 'AIza-saved' } },
    });

    expect(screen.getByRole('button', { name: /Gemini \(saved settings\)/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /OpenAI \(saved settings\)/ })).toBeNull();
  });

  it('saves every provider seen in this session, not just the active one', () => {
    const { onSaveConfig } = renderModal();

    fireEvent.click(providerButton('OpenAI'));
    fireEvent.change(keyInput(), { target: { value: 'sk-openai-1' } });
    fireEvent.click(providerButton('Anthropic'));
    fireEvent.change(keyInput(), { target: { value: 'sk-ant-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));

    expect(onSaveConfig).toHaveBeenCalledTimes(1);
    const [active, map] = onSaveConfig.mock.calls[0] as [LLMConfig, ProviderConfigMap];

    expect(active.provider).toBe('anthropic');
    expect(active.apiKey).toBe('sk-ant-1');
    expect(map.openai?.apiKey).toBe('sk-openai-1');
    expect(map.anthropic?.apiKey).toBe('sk-ant-1');
  });

  it('does not clobber a provider\u2019s saved key when its field is left untouched', () => {
    const { onSaveConfig } = renderModal({
      providerConfigs: { openai: { provider: 'openai', apiKey: 'sk-existing', model: 'gpt-4o' } },
    });

    fireEvent.click(providerButton('OpenAI'));
    expect(keyInput().value).toBe('sk-existing');
    fireEvent.click(providerButton('OmniRoute'));
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));

    const [, map] = onSaveConfig.mock.calls[0] as [LLMConfig, ProviderConfigMap];
    expect(map.openai?.apiKey).toBe('sk-existing');
  });
});

describe('SettingsModal tab navigation and connection testing', () => {
  it('switches between tabs cleanly', () => {
    renderModal();

    // Default tab is Models
    expect(screen.getByRole('button', { name: /^OmniRoute/ })).toBeDefined();

    // Switch to Agent tab
    fireEvent.click(screen.getByRole('button', { name: /Agent/ }));
    expect(screen.getByText(/Max Step Safety Budget/)).toBeDefined();

    // Switch to MCP tab
    fireEvent.click(screen.getByRole('button', { name: /^MCP/ }));
    expect(screen.getByPlaceholderText('http://localhost:3000/mcp')).toBeDefined();

    // Switch to Skills tab
    fireEvent.click(screen.getByRole('button', { name: /Skills/ }));
    expect(screen.getByPlaceholderText(/name: my-custom-skill/)).toBeDefined();
  });

  it('toggles password visibility with the eye button', () => {
    renderModal({
      config: { provider: 'openai', apiKey: 'sk-secret-key', model: 'gpt-4o' } as LLMConfig,
    });

    const input = keyInput();
    expect(input.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Show API key/ });
    fireEvent.click(toggleBtn);
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /Hide API key/ }));
    expect(input.type).toBe('password');
  });

  it('triggers test connection and displays feedback', async () => {
    renderModal();

    const testBtn = screen.getByRole('button', { name: /Test connection to this provider/ });
    fireEvent.click(testBtn);

    expect(await screen.findByText(/Connected \(85ms\) • 5 models found/)).toBeDefined();
  });

  it('triggers MCP ping on the MCP tab', async () => {
    renderModal({ mcpEndpoint: 'http://localhost:3000/mcp' });

    fireEvent.click(screen.getByRole('button', { name: /^MCP/ }));
    const pingBtn = screen.getByRole('button', { name: /Ping MCP/ });
    fireEvent.click(pingBtn);

    expect(await screen.findByText(/Connected \(40ms\) • 3 tools available/)).toBeDefined();
  });
});
