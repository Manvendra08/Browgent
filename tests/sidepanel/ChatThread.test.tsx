import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatThread } from '../../src/sidepanel/components/ChatThread';
import { Turn } from '../../src/sidepanel/threads';

describe('ChatThread Dossier Export', () => {
  it('renders Dossier export button for turns with a result and triggers download', () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    // Mock document.createElement and anchor click
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    const mockTurn: Turn = {
      id: 'turn-dossier-test-123',
      mode: 'agent',
      prompt: 'Summarize quarterly research findings',
      status: 'completed',
      createdAt: Date.now(),
      tab: {
        title: 'Research Portal',
        url: 'https://research.example.com',
      },
      result: '### Q3 Analysis\n| Metric | Value |\n|---|---|\n| Growth | 24% |',
      steps: [
        {
          id: 'step-1',
          step: 1,
          thought: 'Extracting data',
          action: { action: 'finish', summary: 'Extracted' },
          status: 'success',
          timestamp: Date.now(),
        },
      ],
    };

    render(
      <ChatThread
        turns={[mockTurn]}
        onSelectStarter={vi.fn()}
      />,
    );

    // Verify Dossier button exists
    const dossierBtn = screen.getByLabelText('Export Executive Dossier');
    expect(dossierBtn).toBeTruthy();
    expect(screen.getByText('Dossier')).toBeTruthy();

    // Click Dossier export
    fireEvent.click(dossierBtn);

    // Verify blob URL was generated and download was triggered
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
