import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveTabBar } from '../../src/sidepanel/components/ActiveTabBar';
import { TabAgentMission } from '../../src/background/types';

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

  it('renders tab mission control pills for background agent tabs', () => {
    const onSelectTab = vi.fn();
    const onDismissMission = vi.fn();

    const mockMissions: TabAgentMission[] = [
      {
        tabId: 101,
        title: 'Wikipedia Article',
        url: 'https://en.wikipedia.org/wiki/Browser',
        status: 'running',
        goal: 'Read article summary',
        mode: 'agent',
        step: 4,
        maxSteps: 10,
        startTime: Date.now() - 5000,
      },
      {
        tabId: 102,
        title: 'Form Submission',
        url: 'https://example.com/form',
        status: 'waiting_approval',
        goal: 'Submit form data',
        mode: 'agent',
        step: 2,
        maxSteps: 5,
        startTime: Date.now() - 3000,
      },
      {
        tabId: 103,
        title: 'Completed Search',
        url: 'https://google.com',
        status: 'completed',
        goal: 'Find documentation',
        mode: 'agent',
        step: 5,
        maxSteps: 5,
        startTime: Date.now() - 10000,
        endTime: Date.now(),
      },
    ];

    render(
      <ActiveTabBar
        tab={{ id: 101, title: 'Wikipedia Article', url: 'https://en.wikipedia.org/wiki/Browser' }}
        missions={mockMissions}
        currentTabId={101}
        onSelectTab={onSelectTab}
        onDismissMission={onDismissMission}
      />,
    );

    // Verify Mission Control bar is rendered
    expect(screen.getByTestId('mission-control-bar')).toBeTruthy();
    expect(screen.getByText('Missions')).toBeTruthy();

    // Verify step counter on running tab
    expect(screen.getByText('4/10')).toBeTruthy();
    expect(screen.getAllByText('Wikipedia Article').length).toBe(2);

    // Verify approval badge on waiting tab
    expect(screen.getByText('Approval')).toBeTruthy();
    expect(screen.getByText('Form Submission')).toBeTruthy();

    // Verify completed tab
    expect(screen.getByText('Completed Search')).toBeTruthy();

    // Click on tab 102 to switch
    fireEvent.click(screen.getByText('Form Submission'));
    expect(onSelectTab).toHaveBeenCalledWith(102);

    // Click dismiss on completed tab 103
    const dismissBtn = screen.getByLabelText('Dismiss mission for tab 103');
    fireEvent.click(dismissBtn);
    expect(onDismissMission).toHaveBeenCalledWith(103);
  });

  it('renders an inline stop button on running mission pills and triggers onStopMission', () => {
    const onStopMission = vi.fn();
    const mockMissions: TabAgentMission[] = [
      {
        tabId: 201,
        title: 'Running Research',
        url: 'https://example.com/research',
        status: 'running',
        goal: 'Analyze data',
        mode: 'agent',
        step: 2,
        maxSteps: 10,
        startTime: Date.now() - 2000,
      },
    ];

    render(
      <ActiveTabBar
        tab={{ id: 201, title: 'Running Research', url: 'https://example.com/research' }}
        missions={mockMissions}
        currentTabId={201}
        onStopMission={onStopMission}
      />,
    );

    const stopBtn = screen.getByLabelText('Stop mission for tab 201');
    expect(stopBtn).toBeTruthy();
    fireEvent.click(stopBtn);
    expect(onStopMission).toHaveBeenCalledWith(201);
  });
});
