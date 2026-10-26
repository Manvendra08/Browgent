import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepList, FeedItem } from '../../src/sidepanel/components/StepList';

describe('StepList component', () => {
  it('renders step item with action and status', () => {
    const items: FeedItem[] = [
      {
        id: 's-1',
        step: 1,
        action: { action: 'click', elementId: 10 },
        status: 'success',
        timestamp: Date.now(),
      },
    ];

    render(<StepList items={items} />);
    expect(screen.getByText('Step 1')).toBeDefined();
    expect(screen.getByText(/Click \[10\]/)).toBeDefined();
  });

  it('renders telemetry timing pill when timings are present', () => {
    const items: FeedItem[] = [
      {
        id: 's-1',
        step: 1,
        action: { action: 'click', elementId: 10 },
        status: 'success',
        timestamp: Date.now(),
        timings: {
          totalMs: 2400,
          domMs: 120,
          screenshotMs: 180,
          llmMs: 1600,
          actionMs: 200,
          settleMs: 300,
        },
      },
    ];

    render(<StepList items={items} />);
    const pill = screen.getByText('2.4s (LLM 1.6s)');
    expect(pill).toBeDefined();
    expect(pill.getAttribute('title')).toContain('DOM: 120ms | Shot: 180ms | LLM: 1600ms | Action: 200ms | Settle: 300ms');
  });
});
