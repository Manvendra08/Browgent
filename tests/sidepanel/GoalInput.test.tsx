import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GoalInput } from '../../src/sidepanel/components/GoalInput';

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  start = vi.fn(() => {
    if (this.onstart) this.onstart();
  });
  stop = vi.fn(() => {
    if (this.onend) this.onend();
  });
  abort = vi.fn(() => {
    if (this.onend) this.onend();
  });
}

describe('GoalInput Voice Dictation', () => {
  let originalSpeechRecognition: unknown;
  let originalWebkitSpeechRecognition: unknown;
  let mockRecognitionInstance: MockSpeechRecognition | null = null;

  beforeEach(() => {
    originalSpeechRecognition = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    originalWebkitSpeechRecognition = (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    mockRecognitionInstance = null;
    const MockClass = function (this: MockSpeechRecognition) {
      mockRecognitionInstance = new MockSpeechRecognition();
      return mockRecognitionInstance;
    } as unknown as typeof MockSpeechRecognition;

    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockClass;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = MockClass;

    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'en-US',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
    });
  });

  afterEach(() => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = originalSpeechRecognition;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = originalWebkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  it('renders mic button and toggles listening state on click', async () => {
    const setGoal = vi.fn();
    render(
      <GoalInput
        goal=""
        setGoal={setGoal}
        mode="agent"
        setMode={vi.fn()}
        isRunning={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const micBtn = screen.getByLabelText('Voice input');
    expect(micBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(screen.getByText('Listening...')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Listening\.\.\. Speak into your microphone now/i)).toBeTruthy();

    // Click again to stop listening
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Stop listening'));
    });

    expect(screen.queryByText('Listening...')).toBeNull();
  });

  it('shows error banner when SpeechRecognition is not supported', async () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;

    render(
      <GoalInput
        goal=""
        setGoal={vi.fn()}
        mode="agent"
        setMode={vi.fn()}
        isRunning={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const micBtn = screen.getByLabelText('Voice input');
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(screen.getByText(/Speech recognition is not supported in this browser version/i)).toBeTruthy();
  });

  it('handles microphone permission denial by opening mic-permission page', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'en-US',
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue({ name: 'NotAllowedError' }),
      },
    });

    render(
      <GoalInput
        goal=""
        setGoal={vi.fn()}
        mode="agent"
        setMode={vi.fn()}
        isRunning={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const micBtn = screen.getByLabelText('Voice input');
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(screen.getByText(/Microphone permission required/i)).toBeTruthy();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test-id/src/sidepanel/mic-permission.html',
    });
  });

  it('streams real-time speech transcript into textarea as user speaks', async () => {
    let capturedGoal = '';
    const setGoal = vi.fn((val: string) => {
      capturedGoal = val;
    });

    render(
      <GoalInput
        goal=""
        setGoal={setGoal}
        mode="agent"
        setMode={vi.fn()}
        isRunning={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const micBtn = screen.getByLabelText('Voice input');
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(mockRecognitionInstance).not.toBeNull();

    // Simulate interim speech
    act(() => {
      mockRecognitionInstance?.onresult?.({
        resultIndex: 0,
        results: [
          [{ transcript: 'find latest prices' }],
        ],
      });
    });

    expect(setGoal).toHaveBeenCalledWith('find latest prices');

    // Simulate final speech
    act(() => {
      const finalResult = [{ transcript: 'find latest prices on Amazon' }] as unknown as { transcript: string }[];
      (finalResult as unknown as { isFinal: boolean }).isFinal = true;

      mockRecognitionInstance?.onresult?.({
        resultIndex: 0,
        results: [finalResult],
      });
    });

    expect(setGoal).toHaveBeenCalledWith('find latest prices on Amazon');
  });

  it('displays network and audio-capture errors cleanly', async () => {
    render(
      <GoalInput
        goal=""
        setGoal={vi.fn()}
        mode="agent"
        setMode={vi.fn()}
        isRunning={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const micBtn = screen.getByLabelText('Voice input');
    await act(async () => {
      fireEvent.click(micBtn);
    });

    // Simulate network error
    act(() => {
      mockRecognitionInstance?.onerror?.({ error: 'network' });
    });

    expect(screen.getByText(/Speech recognition requires an internet connection/i)).toBeTruthy();

    // Dismiss error
    fireEvent.click(screen.getByLabelText('Dismiss voice error'));
    expect(screen.queryByText(/Speech recognition requires an internet connection/i)).toBeNull();
  });
});
