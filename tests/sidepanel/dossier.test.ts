import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  markdownToDossierHtml,
  generateExecutiveDossierHtml,
} from '../../src/sidepanel/dossier';
import { Turn } from '../../src/sidepanel/threads';

describe('Executive Dossier Generator', () => {
  describe('escapeHtml', () => {
    it('escapes dangerous HTML characters', () => {
      const unsafe = '<script>alert("xss") & \'inject\'</script>';
      const safe = escapeHtml(unsafe);
      expect(safe).not.toContain('<script>');
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('&quot;xss&quot;');
      expect(safe).toContain('&amp;');
      expect(safe).toContain('&#039;inject&#039;');
    });
  });

  describe('markdownToDossierHtml', () => {
    it('handles empty or missing markdown gracefully', () => {
      expect(markdownToDossierHtml('')).toContain('No summary recorded');
    });

    it('converts markdown tables to styled HTML tables', () => {
      const md = `
| Company | Revenue | Status |
| :--- | :--- | :--- |
| Acme Corp | $10M | Active |
| Beta LLC | $5M | Pending |
`;
      const html = markdownToDossierHtml(md);
      expect(html).toContain('<table class="dossier-table">');
      expect(html).toContain('<th>Company</th>');
      expect(html).toContain('<td>Acme Corp</td>');
      expect(html).toContain('<td>$10M</td>');
      expect(html).toContain('<td>Beta LLC</td>');
    });

    it('converts headings, lists, and inline styles', () => {
      const md = `
# Executive Overview
## Key Metrics
Here is **important** information with *italic* text and \`code_snippet\`.
- First point
- Second point
> Note: this was audited.
`;
      const html = markdownToDossierHtml(md);
      expect(html).toContain('<h1 class="heading-1">Executive Overview</h1>');
      expect(html).toContain('<h2 class="heading-2">Key Metrics</h2>');
      expect(html).toContain('<strong>important</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<code class="inline-code">code_snippet</code>');
      expect(html).toContain('<ul class="dossier-list">');
      expect(html).toContain('<li>First point</li>');
      expect(html).toContain('<li>Second point</li>');
      expect(html).toContain('<blockquote class="dossier-quote">Note: this was audited.</blockquote>');
    });

    it('converts code blocks', () => {
      const md = '```json\n{"status": "ok"}\n```';
      const html = markdownToDossierHtml(md);
      expect(html).toContain('<pre class="code-block"><code class="lang-json">');
      expect(html).toContain('{&quot;status&quot;: &quot;ok&quot;}');
    });
  });

  describe('generateExecutiveDossierHtml', () => {
    const mockTurn: Turn = {
      id: 'turn-9876543210',
      mode: 'agent',
      prompt: 'Book the lowest flight from JFK to LHR',
      status: 'completed',
      createdAt: 1731400000000,
      tab: {
        title: 'Google Flights — Search',
        url: 'https://www.google.com/travel/flights',
      },
      result: `
### Flight Comparison
| Airline | Price | Stops |
|---|---|---|
| British Airways | $450 | Nonstop |
| Virgin Atlantic | $470 | Nonstop |

Successfully identified the optimal flight.
`,
      steps: [
        {
          id: 'step-1',
          step: 1,
          thought: 'Navigate to search page and find input for departure',
          action: { action: 'click', elementId: 12 },
          status: 'success',
          timestamp: 1731400001000,
          timings: {
            totalMs: 320,
            domMs: 40,
            screenshotMs: 30,
            llmMs: 200,
            actionMs: 30,
            settleMs: 20,
          },
        },
        {
          id: 'step-2',
          step: 2,
          thought: 'Type destination airport into search input',
          action: { action: 'type', elementId: 14, text: 'LHR', pressEnter: true },
          status: 'success',
          timestamp: 1731400005000,
        },
        {
          id: 'step-3',
          step: 3,
          thought: 'Finished finding flight options',
          action: { action: 'finish', summary: 'Flight booked' },
          status: 'success',
          timestamp: 1731400008000,
        },
      ],
    };

    it('generates a complete valid HTML document with metadata and print styles', () => {
      const html = generateExecutiveDossierHtml(mockTurn);

      // Structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Browgent Executive Dossier');
      expect(html).toContain('Reference ID');
      expect(html).toContain('BD-');
      expect(html).toContain('VERIFIED COMPLETE');

      // Target Audit Profile
      expect(html).toContain('Google Flights — Search');
      expect(html).toContain('https://www.google.com/travel/flights');
      expect(html).toContain('Autonomous Agent');

      // Directive
      expect(html).toContain('Book the lowest flight from JFK to LHR');

      // Findings & Table
      expect(html).toContain('British Airways');
      expect(html).toContain('$450');

      // Audit Trail
      expect(html).toContain('#1');
      expect(html).toContain('Click element <code>[12]</code>');
      expect(html).toContain('Navigate to search page and find input for departure');
      expect(html).toContain('Type into <code>[14]</code>: <span class="action-payload">LHR</span>');
      expect(html).toContain('320ms (DOM: 40ms | LLM: 200ms)');

      // Print Media Styles
      expect(html).toContain('@media print');
      expect(html).toContain('.top-action-bar');
      expect(html).toContain('window.print()');

      // Verification Seal
      expect(html).toContain('Certified Autonomous Agent Execution Record');
      expect(html).toContain('Browgent Agentic Auditor Engine');
    });

    it('handles failed turn status and errors gracefully', () => {
      const failedTurn: Turn = {
        id: 'turn-fail-1234',
        mode: 'ask',
        prompt: 'Check stock price',
        status: 'failed',
        error: 'Network connection aborted',
        createdAt: Date.now(),
        steps: [
          {
            id: 'step-fail',
            step: 1,
            thought: 'Try loading page',
            action: { action: 'fail', reason: 'Timeout' },
            status: 'error',
            error: 'Timeout after 15000ms',
            timestamp: Date.now(),
          },
        ],
      };

      const html = generateExecutiveDossierHtml(failedTurn);
      expect(html).toContain('RUN FAILED');
      expect(html).toContain('Direct Inspection');
      expect(html).toContain('Timeout after 15000ms');
    });
  });
});
