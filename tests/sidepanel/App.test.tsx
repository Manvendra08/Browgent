import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/sidepanel/App';

// Mock chrome API for sidepanel tests
vi.stubGlobal('chrome', {
  runtime: {
    connect: vi.fn(() => ({
      name: 'browgent-sidepanel',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
    })),
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn((_keys, callback) => callback({})),
      set: vi.fn((_items, callback) => callback && callback()),
    },
  },
});

describe('Sidepanel App', () => {
  it('renders Browgent header and goal input area', () => {
    render(<App />);
    expect(screen.getByText('Browgent')).toBeDefined();
    expect(screen.getByPlaceholderText(/Enter your automation goal/i)).toBeDefined();
  });

  it('renders settings toggle button', () => {
    render(<App />);
    const settingsBtn = screen.getByTitle(/Settings/i);
    expect(settingsBtn).toBeDefined();
  });
});
