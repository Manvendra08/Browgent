import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '../../src/sidepanel/components/Markdown';

describe('Markdown Component', () => {
  it('renders standard markdown paragraphs and bold text', () => {
    render(<Markdown content="This is **bold** text." />);
    expect(screen.getByText(/This is/)).toBeDefined();
    const strong = screen.getByText('bold');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders markdown links with target="_blank" and rel="noopener noreferrer"', () => {
    render(<Markdown content="Visit [Example](https://example.com) for details." />);
    const link = screen.getByRole('link', { name: 'Example' });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders GFM tables correctly', () => {
    const tableMd = `
| Item | Price |
| :--- | :---- |
| Flight A | ₹16,428 |
| Flight B | ₹18,050 |
`;
    render(<Markdown content={tableMd} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toBe('Item');
    expect(headers[1].textContent).toBe('Price');

    expect(screen.getByText('₹16,428')).toBeDefined();
    expect(screen.getByText('Flight B')).toBeDefined();
  });
});
