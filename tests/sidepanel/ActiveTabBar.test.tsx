import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveTabBar } from '../../src/sidepanel/components/ActiveTabBar';

describe('ActiveTabBar', () => {
  it('renders the active tab title and domain', () => {
    render(
      <ActiveTabBar
        tab={{ id: 1, title: 'Hacker News', url: 'https://news.ycombinator.com/item?id=1', favIconUrl: 'https://news.ycombinator.com/favicon.ico' }}
      />,
    );
    expect(screen.getByText('Hacker News')).toBeTruthy();
    expect(screen.getByText('news.ycombinator.com')).toBeTruthy();
  });

  it('marks restricted pages as not automatable', () => {
    render(
      <ActiveTabBar tab={{ id: 2, title: 'chrome://settings', url: 'chrome://settings' }} />,
    );
    expect(screen.getByTitle(/not automatable/i)).toBeTruthy();
  });

  it('shows agent target badge while running', () => {
    render(
      <ActiveTabBar
        tab={{ id: 3, title: 'Example', url: 'https://example.com' }}
        isAgentTarget
      />,
    );
    expect(screen.getByText('Target')).toBeTruthy();
  });

  it('falls back gracefully with no tab info', () => {
    render(<ActiveTabBar tab={null} />);
    expect(screen.getByText('Untitled page')).toBeTruthy();
  });
});
