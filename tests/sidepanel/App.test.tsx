import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '../../src/sidepanel/App';

let portMessageListener: ((msg: { type: string; event?: unknown; success?: boolean; summary?: string; error?: string }) => void) | null = null;
const mockPostMessage = vi.fn();

const mockPort = {
  name: 'browgent-sidepanel',
  postMessage: mockPostMessage,
  disconnect: vi.fn(),
  onMessage: {
    addListener: vi.fn((listener) => {
      portMessageListener = listener;
    }),
  },
  onDisconnect: { addListener: vi.fn() },
};

// In-memory fake storage
let fakeStorage: Record<string, unknown> = {};
let fakeSessionStorage: Record<string, unknown> = {};
let storageChangeListeners: Array<(changes: Record<string, unknown>, areaName: string) => void> = [];

vi.stubGlobal('chrome', {
  runtime: {
    connect: vi.fn(() => mockPort),
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        const result: Record<string, unknown> = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          if (fakeStorage[k] !== undefined) {
            result[k] = fakeStorage[k];
          }
        }
        if (typeof callback === 'function') {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items, callback) => {
        fakeStorage = { ...fakeStorage, ...items };
        if (typeof callback === 'function') {
          callback();
          return;
        }
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn(async (keys) => {
        const result: Record<string, unknown> = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          if (fakeSessionStorage[k] !== undefined) {
            result[k] = fakeSessionStorage[k];
          }
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        fakeSessionStorage = { ...fakeSessionStorage, ...items };
      }),
      remove: vi.fn(async (keys) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete fakeSessionStorage[k];
        }
      }),
    },
    onChanged: {
      addListener: vi.fn((listener) => {
        storageChangeListeners.push(listener);
      }),
      removeListener: vi.fn((listener) => {
        storageChangeListeners = storageChangeListeners.filter((l) => l !== listener);
      }),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([
      { id: 101, title: 'Example Page', url: 'https://example.com' },
    ]),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  windows: {
    WINDOW_ID_NONE: -1,
    onFocusChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

describe('Sidepanel App Conversational Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeStorage = {};
    fakeSessionStorage = {};
    storageChangeListeners = [];
    portMessageListener = null;
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 101, title: 'Example Page', url: 'https://example.com' } as chrome.tabs.Tab,
    ]);
  });

  it('renders Browgent header, mode toggle buttons, and goal input area', async () => {
    render(<App />);
    expect(screen.getByText('Browgent')).toBeDefined();
    expect(screen.getByRole('button', { name: /^ask$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^agent$/i })).toBeDefined();
    expect(
      screen.getByPlaceholderText(/Enter your automation goal/i),
    ).toBeDefined();
  });

  it('allows toggling between Ask and Agent modes', async () => {
    render(<App />);
    const askBtn = screen.getByRole('button', { name: /^ask$/i });
    const agentBtn = screen.getByRole('button', { name: /^agent$/i });

    // Switch to Ask mode
    fireEvent.click(askBtn);
    expect(
      screen.getByPlaceholderText(/Ask a question about this page/i),
    ).toBeDefined();

    // Switch back to Agent mode
    fireEvent.click(agentBtn);
    expect(
      screen.getByPlaceholderText(/Enter your automation goal/i),
    ).toBeDefined();
  });

  it('runs a prompt in Agent mode, emits START_AGENT, and renders markdown result on done event', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter your automation goal/i);
    const runBtn = screen.getByRole('button', { name: /Run Agent/i });

    fireEvent.change(input, { target: { value: 'Find the lowest fare' } });
    fireEvent.click(runBtn);

    // Prompt submitted: verify turn rendered in chat
    expect(screen.getByText('Find the lowest fare')).toBeDefined();

    // Verify START_AGENT sent through port
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_AGENT',
        payload: expect.objectContaining({
          goal: 'Find the lowest fare',
          mode: 'agent',
          conversation: [],
        }),
      }),
    );

    // Simulate agent events arriving
    act(() => {
      portMessageListener?.({
        type: 'AGENT_EVENT',
        event: {
          type: 'step',
          data: { step: 1 },
        },
      });
      portMessageListener?.({
        type: 'AGENT_EVENT',
        event: {
          type: 'done',
          data: { summary: '### Found Cheapest Flight\n- Flight: Indigo ₹4,500' },
        },
      });
    });

    // Verify markdown result rendered
    await waitFor(() => {
      expect(screen.getByText('Found Cheapest Flight')).toBeDefined();
      expect(screen.getByText(/Indigo ₹4,500/)).toBeDefined();
    });
  });

  it('includes prior turns as conversation context on follow-up prompt', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter your automation goal/i);

    // Turn 1
    fireEvent.change(input, { target: { value: 'Show prices' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    act(() => {
      portMessageListener?.({
        type: 'AGENT_EVENT',
        event: {
          type: 'done',
          data: { summary: 'Prices: Item A is $10, Item B is $20' },
        },
      });
      portMessageListener?.({
        type: 'FINISHED',
        success: true,
        summary: 'Prices: Item A is $10, Item B is $20',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Prices: Item A is \$10/)).toBeDefined();
    });

    // Follow-up Turn 2
    mockPostMessage.mockClear();
    fireEvent.change(input, { target: { value: 'Book Item A' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_AGENT',
        payload: expect.objectContaining({
          goal: 'Book Item A',
          conversation: [
            {
              prompt: 'Show prices',
              result: 'Prices: Item A is $10, Item B is $20',
            },
          ],
        }),
      }),
    );
  });

  it('supports New Chat button to reset active conversation', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter your automation goal/i);

    fireEvent.change(input, { target: { value: 'First thread prompt' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    expect(screen.getByText('First thread prompt')).toBeDefined();

    // Click New Chat
    const newChatBtn = screen.getByTitle('New chat');
    fireEvent.click(newChatBtn);

    // Prompt from prior thread should not be visible in empty chat view
    expect(screen.queryByText('First thread prompt')).toBeNull();
    expect(screen.getByText('Ready for instructions')).toBeDefined();
  });

  it('opens Chat History modal and allows selecting previous threads', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter your automation goal/i);

    // Create Thread 1
    fireEvent.change(input, { target: { value: 'Thread One Query' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    // Start New Chat and create Thread 2
    fireEvent.click(screen.getByTitle('New chat'));
    fireEvent.change(input, { target: { value: 'Thread Two Query' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    expect(screen.getByText('Thread Two Query')).toBeDefined();
    expect(screen.queryByText('Thread One Query')).toBeNull();

    // Open History
    const historyBtn = screen.getByTitle('Chat history');
    fireEvent.click(historyBtn);

    expect(screen.getByText('Chat History')).toBeDefined();
    expect(screen.getByText('Thread One Query')).toBeDefined();

    // Select Thread 1 from history
    fireEvent.click(screen.getByText('Thread One Query'));

    // Should display Thread 1 again
    expect(screen.getByText('Thread One Query')).toBeDefined();
    expect(screen.queryByText('Thread Two Query')).toBeNull();
  });

  it('consumes browgent_pending_prompt from session storage and prefills Explain prompt in Ask mode', async () => {
    fakeSessionStorage['browgent_pending_prompt'] = {
      text: 'Quantum computing superposition',
      mode: 'ask',
    };

    render(<App />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(
        /Ask a question about this page/i,
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Explain: "Quantum computing superposition"');
    });

    expect(fakeSessionStorage['browgent_pending_prompt']).toBeUndefined();
  });

  it('scrubs sensitive URL params from active tab when adding turn to chat', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      {
        id: 102,
        title: '',
        url: 'https://example.com/auth?code=super_secret_code',
      } as chrome.tabs.Tab,
    ]);

    render(<App />);

    // Wait for activeTab to be populated
    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/Enter your automation goal/i);
    fireEvent.change(input, { target: { value: 'Check token' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText('https://example.com/auth?code=redacted').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/super_secret_code/)).toBeNull();
    });
  });

  it('initializes with a completely fresh session in a new tab without carrying over existing threads', async () => {
    fakeStorage['browgent_threads'] = [
      {
        id: 'prior-thread-999',
        title: 'Prior Thread From Another Tab',
        createdAt: 1000,
        updatedAt: 1000,
        turns: [
          {
            id: 'turn-999',
            mode: 'agent',
            prompt: 'Prior secret prompt from Tab A',
            steps: [],
            result: 'Prior result from Tab A',
            status: 'completed',
            createdAt: 1000,
          },
        ],
      },
    ];

    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 202, title: 'New Tab B', url: 'https://other-tab.com' } as chrome.tabs.Tab,
    ]);

    render(<App />);

    // Verify completely fresh session: prompt suggestions visible, prior thread not visible
    await waitFor(() => {
      expect(screen.getByText('Ready for instructions')).toBeDefined();
    });
    expect(screen.queryByText('Prior secret prompt from Tab A')).toBeNull();
    expect(screen.queryByText('Prior result from Tab A')).toBeNull();

    // Opening history modal still allows viewing previous threads
    const historyBtn = screen.getByTitle('Chat history');
    fireEvent.click(historyBtn);
    expect(screen.getByText('Prior Thread From Another Tab')).toBeDefined();
  });

  it('restores previous thread for the same tab when tab thread exists in session storage', async () => {
    fakeStorage['browgent_threads'] = [
      {
        id: 'thread-for-tab-101',
        title: 'Tab 101 Task',
        createdAt: 1000,
        updatedAt: 1000,
        turns: [
          {
            id: 'turn-1',
            mode: 'agent',
            prompt: 'Tab 101 active task',
            steps: [],
            result: 'Result for 101',
            status: 'completed',
            createdAt: 1000,
          },
        ],
      },
    ];
    fakeSessionStorage['browgent_tab_thread_101'] = 'thread-for-tab-101';

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Tab 101 active task')).toBeDefined();
      expect(screen.getByText('Result for 101')).toBeDefined();
    });
  });
});
