import { Turn } from './threads';
import { AgentAction } from '../background/types';

/**
 * Escapes HTML characters to prevent XSS vulnerabilities in generated dossiers.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts inline markdown formatting (bold, italic, inline code) to sanitized HTML.
 */
function formatInlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  return out;
}

/**
 * Parses markdown summary text into semantic, executive-ready HTML.
 * Supports tables, headings, bullet lists, blockquotes, code blocks, and paragraphs.
 */
export function markdownToDossierHtml(markdown: string): string {
  if (!markdown) return '<p class="empty-text">No summary recorded.</p>';

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];

  let inTable = false;
  let tableRows: string[][] = [];
  let inList = false;
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';

  const flushList = () => {
    if (inList && listItems.length > 0) {
      output.push(`<ul class="dossier-list">\n${listItems.map((li) => `  <li>${li}</li>`).join('\n')}\n</ul>`);
      listItems = [];
      inList = false;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const [headerRow, ...bodyRows] = tableRows;
      let html = '<div class="table-container"><table class="dossier-table">\n';
      if (headerRow) {
        html += '  <thead>\n    <tr>\n';
        for (const cell of headerRow) {
          html += `      <th>${formatInlineMarkdown(cell)}</th>\n`;
        }
        html += '    </tr>\n  </thead>\n';
      }
      if (bodyRows.length > 0) {
        html += '  <tbody>\n';
        for (const row of bodyRows) {
          html += '    <tr>\n';
          for (const cell of row) {
            html += `      <td>${formatInlineMarkdown(cell)}</td>\n`;
          }
          html += '    </tr>\n';
        }
        html += '  </tbody>\n';
      }
      html += '</table></div>';
      output.push(html);
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block fences
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre class="code-block"><code class="lang-${codeBlockLang}">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        codeBlockContent = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    // Markdown Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // Check if delimiter row (|---|---|)
      const isDelimiter = cells.every((c) => /^[\s\-:]+$/.test(c));
      if (isDelimiter) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      output.push(`<h${level} class="heading-${level}">${formatInlineMarkdown(text)}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, '');
      output.push(`<blockquote class="dossier-quote">${formatInlineMarkdown(quoteText)}</blockquote>`);
      continue;
    }

    // Bullet List
    const listMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (listMatch) {
      inList = true;
      listItems.push(formatInlineMarkdown(listMatch[1]));
      continue;
    } else if (inList) {
      flushList();
    }

    // Blank lines
    if (!trimmed) {
      continue;
    }

    // Paragraph
    output.push(`<p class="dossier-p">${formatInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  flushTable();

  return output.join('\n');
}

/**
 * Returns a human-readable action description with sanitized parameters.
 */
function formatActionDetails(action?: AgentAction): string {
  if (!action) return '<span class="text-muted">None</span>';

  switch (action.action) {
    case 'click':
      return `Click element <code>[${action.elementId}]</code>`;
    case 'type':
      return `Type into <code>[${action.elementId}]</code>: <span class="action-payload">${escapeHtml(action.text)}</span>${action.pressEnter ? ' <em>(with Enter)</em>' : ''}`;
    case 'select_option':
      return `Select <code>"${escapeHtml(action.value)}"</code> on <code>[${action.elementId}]</code>`;
    case 'press_key':
      return `Press key: <code>${escapeHtml(action.key)}</code>`;
    case 'hover':
      return `Hover over element <code>[${action.elementId}]</code>`;
    case 'scroll':
      return `Scroll <strong>${action.direction}</strong> ${action.amount ? `(${action.amount}px)` : ''}`;
    case 'navigate':
      return `Navigate to: <a href="${escapeHtml(action.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.url)}</a>`;
    case 'wait':
      return `Wait <strong>${action.seconds ?? 2}s</strong>`;
    case 'finish':
      return `Complete goal: <span class="action-summary">${escapeHtml(action.summary)}</span>`;
    case 'fail':
      return `Declare failure: <span class="text-danger">${escapeHtml(action.reason)}</span>`;
    case 'mcp_call':
      return `Invoke MCP Tool: <code>${escapeHtml(action.tool)}</code>`;
    case 'remember_fact':
      return `Remember Domain Fact: <em>"${escapeHtml(action.fact)}"</em>`;
    case 'forget_fact':
      return `Forget Domain Fact: <em>"${escapeHtml(action.fact)}"</em>`;
    default:
      return escapeHtml(JSON.stringify(action));
  }
}

/**
 * Generates a self-contained, enterprise-grade Executive Dossier HTML report.
 * Includes complete audit logs, structured findings, and print-ready CSS.
 */
export function generateExecutiveDossierHtml(turn: Turn, meta?: { appVersion?: string }): string {
  const version = meta?.appVersion || '0.6.0';
  const createdDate = new Date(turn.createdAt || Date.now());
  const dateStr = createdDate.toISOString().slice(0, 10).replace(/-/g, '');
  const refCode = `BD-${dateStr}-${(turn.id || 'REF').slice(0, 6).toUpperCase()}`;

  const statusLabel =
    turn.status === 'completed'
      ? 'VERIFIED COMPLETE'
      : turn.status === 'failed'
      ? 'RUN FAILED'
      : turn.status === 'stopped'
      ? 'TERMINATED BY USER'
      : 'IN PROGRESS';

  const statusClass =
    turn.status === 'completed'
      ? 'status-complete'
      : turn.status === 'failed'
      ? 'status-failed'
      : 'status-stopped';

  const targetTitle = turn.tab?.title || turn.tab?.url || 'Direct Session';
  const targetUrl = turn.tab?.url || '';

  // Duration computation
  let durationStr = 'N/A';
  if (turn.steps && turn.steps.length > 0) {
    const firstTime = turn.steps[0].timestamp || turn.createdAt;
    const lastTime = turn.steps[turn.steps.length - 1].timestamp || Date.now();
    const diffSec = Math.max(1, Math.round((lastTime - firstTime) / 1000));
    durationStr = diffSec < 60 ? `${diffSec}s` : `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
  }

  const findingsHtml = turn.result
    ? markdownToDossierHtml(turn.result)
    : '<p class="empty-text">No summary produced for this execution run.</p>';

  const auditRows = (turn.steps || []).map((step) => {
    const timeFormatted = step.timestamp
      ? new Date(step.timestamp).toLocaleTimeString([], { hour12: false })
      : '--:--:--';

    const timingDetails = step.timings
      ? `${step.timings.totalMs}ms (DOM: ${step.timings.domMs}ms | LLM: ${step.timings.llmMs}ms)`
      : '--';

    return `
      <tr class="audit-row ${step.status === 'error' ? 'row-error' : ''}">
        <td class="cell-step">#${step.step}</td>
        <td class="cell-time">${timeFormatted}</td>
        <td class="cell-action">
          <span class="action-badge badge-${step.action?.action || 'default'}">${escapeHtml(step.action?.action || 'step')}</span>
          <div class="action-desc">${formatActionDetails(step.action)}</div>
        </td>
        <td class="cell-reasoning">${step.thought ? escapeHtml(step.thought) : '<span class="text-muted">—</span>'}</td>
        <td class="cell-timings">${timingDetails}</td>
        <td class="cell-status">
          <span class="step-status status-${step.status}">${step.status.toUpperCase()}</span>
          ${step.error ? `<div class="step-error">${escapeHtml(step.error)}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Browgent Executive Dossier — ${escapeHtml(refCode)}</title>
  <style>
    /* Reset & Base Styles */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background-color: #f8fafc;
      line-height: 1.5;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }

    /* Print & Action Bar */
    .top-action-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #0f172a;
      color: #f1f5f9;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .top-action-bar h2 {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .print-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }

    .print-btn:hover {
      background: #1d4ed8;
    }

    /* Document Container */
    .document-wrapper {
      max-width: 900px;
      margin: 28px auto 60px auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    /* Header Section */
    .dossier-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 32px 36px 28px 36px;
      border-bottom: 4px solid #3b82f6;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .brand-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .brand-subtitle {
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 4px;
    }

    .status-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 5px 12px;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    .status-complete {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.5);
    }

    .status-failed {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.5);
    }

    .status-stopped {
      background: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.5);
    }

    .header-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .meta-item .meta-label {
      font-size: 10px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .meta-item .meta-value {
      font-size: 12px;
      font-weight: 600;
      color: #f8fafc;
      margin-top: 2px;
      word-break: break-all;
    }

    /* Content Body */
    .dossier-body {
      padding: 32px 36px;
    }

    .section-card {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
    }

    .section-title::before {
      content: "";
      width: 4px;
      height: 14px;
      background: #3b82f6;
      border-radius: 2px;
      display: inline-block;
    }

    /* Engagement Profile Box */
    .profile-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
    }

    .profile-row {
      margin-bottom: 8px;
    }

    .profile-row:last-child {
      margin-bottom: 0;
    }

    .profile-label {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }

    .profile-value {
      font-size: 13px;
      color: #1e293b;
      margin-top: 2px;
    }

    .profile-value a {
      color: #2563eb;
      text-decoration: none;
      word-break: break-all;
    }

    .profile-value a:hover {
      text-decoration: underline;
    }

    /* Executive Directive Callout */
    .directive-card {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      border-radius: 0 8px 8px 0;
      padding: 16px 20px;
      color: #1e3a8a;
      font-size: 13px;
      line-height: 1.6;
      font-weight: 500;
    }

    /* Findings / Summary */
    .findings-content {
      background: #ffffff;
      line-height: 1.6;
    }

    .dossier-p {
      margin-bottom: 12px;
      color: #334155;
    }

    .dossier-list {
      margin: 10px 0 16px 24px;
      color: #334155;
    }

    .dossier-list li {
      margin-bottom: 6px;
    }

    .heading-1, .heading-2, .heading-3 {
      font-weight: 700;
      color: #0f172a;
      margin: 18px 0 10px 0;
    }

    .heading-1 { font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .heading-2 { font-size: 14px; }
    .heading-3 { font-size: 13px; color: #475569; }

    .dossier-quote {
      border-left: 3px solid #cbd5e1;
      padding-left: 14px;
      color: #64748b;
      font-style: italic;
      margin: 12px 0;
    }

    .code-block {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      overflow-x: auto;
      margin: 12px 0;
    }

    .inline-code {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: #0f172a;
    }

    /* Structured Tables */
    .table-container {
      overflow-x: auto;
      margin: 16px 0;
    }

    .dossier-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border: 1px solid #cbd5e1;
    }

    .dossier-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
    }

    .dossier-table td {
      padding: 9px 12px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }

    .dossier-table tr:nth-child(even) {
      background: #f8fafc;
    }

    /* Audit Trail Table */
    .audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      border: 1px solid #cbd5e1;
    }

    .audit-table th {
      background: #0f172a;
      color: #f8fafc;
      font-weight: 600;
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #1e293b;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .audit-table td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .audit-row:nth-child(even) {
      background: #f8fafc;
    }

    .audit-row.row-error {
      background: #fef2f2;
    }

    .cell-step {
      font-weight: 700;
      color: #0f172a;
      width: 45px;
    }

    .cell-time {
      color: #64748b;
      font-family: ui-monospace, monospace;
      font-size: 10px;
      width: 65px;
    }

    .cell-action {
      width: 250px;
    }

    .action-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      margin-bottom: 4px;
    }

    .badge-click { background: #dbeafe; color: #1e40af; }
    .badge-type { background: #fef3c7; color: #92400e; }
    .badge-select_option { background: #e0e7ff; color: #3730a3; }
    .badge-navigate { background: #f3e8ff; color: #6b21a8; }
    .badge-finish { background: #d1fae5; color: #065f46; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    .badge-default { background: #f1f5f9; color: #475569; }

    .action-desc {
      font-size: 11px;
      color: #334155;
      line-height: 1.4;
    }

    .action-payload {
      color: #0369a1;
      font-weight: 600;
    }

    .cell-reasoning {
      color: #475569;
      font-style: italic;
      font-size: 11px;
    }

    .cell-timings {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      color: #64748b;
      width: 140px;
    }

    .cell-status {
      width: 75px;
      text-align: right;
    }

    .step-status {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }

    .step-status.status-success { background: #dcfce7; color: #15803d; }
    .step-status.status-error { background: #fee2e2; color: #b91c1c; }
    .step-status.status-running { background: #e0f2fe; color: #0369a1; }

    .step-error {
      color: #dc2626;
      font-size: 10px;
      margin-top: 4px;
      font-weight: 500;
    }

    /* Footer / Seal */
    .dossier-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 20px 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748b;
    }

    .seal-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .seal-icon {
      width: 24px;
      height: 24px;
      border: 2px solid #3b82f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #3b82f6;
      font-weight: 700;
      font-size: 10px;
    }

    .seal-text {
      font-weight: 600;
      color: #334155;
    }

    .text-muted { color: #94a3b8; }
    .text-danger { color: #ef4444; }
    .empty-text { color: #94a3b8; font-style: italic; }

    /* Print Specific Media Rules */
    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        font-size: 10pt;
      }

      .top-action-bar, .no-print {
        display: none !important;
      }

      .document-wrapper {
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        max-width: 100% !important;
      }

      .dossier-header {
        padding: 20px 24px !important;
        background: #0f172a !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .dossier-body {
        padding: 20px 24px !important;
      }

      .section-card {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 20px !important;
      }

      .dossier-table, .audit-table {
        page-break-inside: auto !important;
      }

      .dossier-table tr, .audit-table tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      @page {
        size: A4;
        margin: 14mm 12mm;
      }
    }
  </style>
</head>
<body>

  <!-- Floating Print Action Bar -->
  <div class="top-action-bar no-print">
    <h2>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      Browgent Executive Dossier Preview
    </h2>
    <button class="print-btn" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print / Save as PDF
    </button>
  </div>

  <!-- Document Body -->
  <div class="document-wrapper">

    <!-- Header -->
    <header class="dossier-header">
      <div class="header-top">
        <div>
          <div class="brand-title">Browgent Executive Dossier</div>
          <div class="brand-subtitle">Autonomous Browser Agent Verification & Audit Record</div>
        </div>
        <div class="status-badge ${statusClass}">
          ${escapeHtml(statusLabel)}
        </div>
      </div>

      <div class="header-meta-grid">
        <div class="meta-item">
          <div class="meta-label">Reference ID</div>
          <div class="meta-value">${escapeHtml(refCode)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Generated At</div>
          <div class="meta-value">${escapeHtml(createdDate.toLocaleString())}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Execution Mode</div>
          <div class="meta-value">${turn.mode === 'ask' ? 'Direct Inspection' : 'Autonomous Agent'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Engine Version</div>
          <div class="meta-value">v${escapeHtml(version)}</div>
        </div>
      </div>
    </header>

    <!-- Body Sections -->
    <main class="dossier-body">

      <!-- Engagement Profile -->
      <section class="section-card">
        <h3 class="section-title">Target Audit Profile</h3>
        <div class="profile-box">
          <div>
            <div class="profile-row">
              <div class="profile-label">Page Title</div>
              <div class="profile-value"><strong>${escapeHtml(targetTitle)}</strong></div>
            </div>
            ${targetUrl ? `
            <div class="profile-row">
              <div class="profile-label">Target URL</div>
              <div class="profile-value"><a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(targetUrl)}</a></div>
            </div>` : ''}
          </div>
          <div>
            <div class="profile-row">
              <div class="profile-label">Total Steps Executed</div>
              <div class="profile-value"><strong>${turn.steps?.length || 0}</strong></div>
            </div>
            <div class="profile-row">
              <div class="profile-label">Duration</div>
              <div class="profile-value">${escapeHtml(durationStr)}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Executive Directive -->
      <section class="section-card">
        <h3 class="section-title">Executive Directive</h3>
        <div class="directive-card">
          ${escapeHtml(turn.prompt)}
        </div>
      </section>

      <!-- Executive Findings -->
      <section class="section-card">
        <h3 class="section-title">Executive Findings & Extracted Data</h3>
        <div class="findings-content">
          ${findingsHtml}
        </div>
      </section>

      <!-- Audit Trail -->
      <section class="section-card">
        <h3 class="section-title">Execution Audit Trail (${turn.steps?.length || 0} Steps)</h3>
        <div class="table-container">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Time</th>
                <th>Action & Target</th>
                <th>Reasoning / Thought</th>
                <th>Latency</th>
                <th style="text-align: right;">Result</th>
              </tr>
            </thead>
            <tbody>
              ${auditRows || '<tr><td colspan="6" class="empty-text" style="text-align:center; padding: 16px;">No execution steps logged.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

    </main>

    <!-- Footer Seal -->
    <footer class="dossier-footer">
      <div class="seal-box">
        <div class="seal-icon">✓</div>
        <div>
          <div class="seal-text">Certified Autonomous Agent Execution Record</div>
          <div>Audited & Verified via Browgent Agentic Auditor Engine</div>
        </div>
      </div>
      <div>Run ID: <code class="inline-code">${escapeHtml((turn.id || 'N/A').slice(0, 12))}</code></div>
    </footer>

  </div>

</body>
</html>`;
}
