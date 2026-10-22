import { PerceivedElement, DOMState, ElementRect } from './types';

const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="gridcell"]',
  '[role="switch"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[contenteditable]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '.ProseMirror',
  '.ql-editor',
  '[data-slate-editor]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  '[aria-haspopup]',
  '[aria-expanded]',
  '[class*="option" i]',
  '[class*="choice" i]',
  '[class*="answer" i]',
].join(', ');

interface ElementIdState {
  nodeIds: WeakMap<Element, number>;
  nextId: number;
  lastNodes: Element[];
}

const idStates = new WeakMap<Document, ElementIdState>();

function getIdState(doc: Document): ElementIdState {
  let state = idStates.get(doc);
  if (!state) {
    state = { nodeIds: new WeakMap<Element, number>(), nextId: 1, lastNodes: [] };
    idStates.set(doc, state);
  }
  return state;
}

function resetIfPageReplaced(state: ElementIdState): void {
  const anyStillConnected = state.lastNodes.some((node) => node.isConnected);
  if (!anyStillConnected && state.lastNodes.length > 0) {
    // The page content was fully replaced. Ids are NEVER reused: the counter keeps
    // climbing so a stale id from the previous DOM can never silently resolve to a
    // different element (it fails loudly instead).
    state.nodeIds = new WeakMap<Element, number>();
    state.lastNodes = [];
  }
}

function viewportPriority(rect: ElementRect, doc: Document): number {
  if (rect.width === 0 && rect.height === 0) {
    return 0;
  }
  const view = doc.defaultView;
  const width = view && view.innerWidth ? view.innerWidth : 1280;
  const height = view && view.innerHeight ? view.innerHeight : 800;
  const inViewport =
    rect.x < width && rect.x + rect.width > 0 && rect.y < height && rect.y + rect.height > 0;
  if (inViewport) {
    return 0;
  }
  const nearViewport = rect.y > -height * 2 && rect.y < height * 3;
  return nearViewport ? 1 : 2;
}

export function assignElementId(doc: Document, node: Element): number {
  const state = getIdState(doc);
  const existing = state.nodeIds.get(node);
  if (existing !== undefined) {
    return existing;
  }
  const id = state.nextId++;
  state.nodeIds.set(node, id);
  return id;
}

export function isKnownElement(doc: Document, node: Element, id: number): boolean {
  return getIdState(doc).nodeIds.get(node) === id;
}

const SENSITIVE_INPUT_TYPES = new Set(['password', 'hidden']);
const SENSITIVE_AUTOCOMPLETE = ['password', 'one-time-code', 'otp', 'cc-', 'csc-', 'current-password', 'new-password'];

const SENSITIVE_NAME_PATTERN = /(pass(word|wd)?|secret|otp|one[-_]?time|cvv|cvc|cvv2|card|cardnum|cardnumber|ccnum|ccnumber|pan|primary[-_]?account|verification[-_]?code|security[-_]?code|pin|ssn|iban|api[-_]?key)/;

export function isSensitiveField(el: Element): boolean {
  const input = el as HTMLInputElement;
  const type = (input.type || '').toLowerCase();
  if (SENSITIVE_INPUT_TYPES.has(type)) {
    return true;
  }
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.some((marker) => autocomplete.includes(marker))) {
    return true;
  }
  const name = (el.getAttribute('name') || '').toLowerCase();
  if (SENSITIVE_NAME_PATTERN.test(name)) {
    return true;
  }
  const id = (el.getAttribute('id') || '').toLowerCase();
  if (SENSITIVE_NAME_PATTERN.test(id)) {
    return true;
  }
  const label = (el.getAttribute('aria-label') || '').toLowerCase();
  if (SENSITIVE_NAME_PATTERN.test(label)) {
    return true;
  }
  return false;
}

export function redactValue(el: Element, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (isSensitiveField(el)) {
    return '[REDACTED]';
  }
  return value;
}

const STATE_CLASS_MARKERS = [
  'answered',
  'selected',
  'active',
  'complete',
  'completed',
  'done',
  'correct',
  'visited',
  'green',
  'unanswered',
  'pending',
];

function readStateClasses(node: Element): string | undefined {
  const className = typeof node.className === 'string' ? node.className : '';
  if (!className) {
    return undefined;
  }
  const matched = className
    .split(/\s+/)
    .filter((cls) => STATE_CLASS_MARKERS.some((marker) => cls.toLowerCase().includes(marker)));
  return matched.length > 0 ? matched.join(' ') : undefined;
}

export const MAX_PERCEIVED_ELEMENTS = 150;
export const MAX_PROMPT_CHARS = 40000;

const SENSITIVE_URL_PARAM = /^(token|access[_-]?token|id[_-]?token|session|sess|sid|code|auth|authorization|api[_-]?key|apikey|key|secret|password|passwd|pwd|signature|sig|otp|pin|cvv|state|nonce)$/i;

function redactParams(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let changed = false;
  params.forEach((_value, key) => {
    if (SENSITIVE_URL_PARAM.test(key)) {
      params.set(key, 'redacted');
      changed = true;
    }
  });
  return changed ? `?${params.toString()}` : search;
}

export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.search) {
      parsed.search = redactParams(parsed.search);
    }
    if (parsed.hash) {
      const rawHash = parsed.hash.slice(1);
      parsed.hash = rawHash.includes('=') ? `#${redactParams(`?${rawHash}`).slice(1)}` : parsed.hash;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function sanitizeUntrustedText(text: string): string {
  return text.replace(/<\/?page_content/gi, '[page_tag]');
}

export function isElementVisible(el: Element): boolean {  // Check inline styles and parent hidden containers
  let current: Element | null = el;
  while (current) {
    if (current instanceof HTMLElement) {
      if (current.style.display === 'none' || current.style.visibility === 'hidden') {
        return false;
      }
      if (current.hidden) {
        return false;
      }
    }
    current = current.parentElement;
  }

  if (typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      // If opacity is 0, allow it if it's a radio/checkbox input inside a visible container
      if (style.opacity === '0') {
        const isInput = el.tagName === 'INPUT';
        if (!isInput) {
          return false;
        }
      }
    } catch {
      // In non-DOM testing environments
    }
  }

  return true;
}

export const MODAL_SELECTORS = [
  'dialog[open]',
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.artdeco-modal',
  '.jobs-easy-apply-modal',
].join(', ');

export function findActiveModal(doc: Document = document): Element | null {
  const candidates = Array.from(doc.querySelectorAll(MODAL_SELECTORS));
  for (const candidate of candidates) {
    if (isElementVisible(candidate)) {
      if (candidate.getBoundingClientRect) {
        const r = candidate.getBoundingClientRect();
        // In real browsers, verify visible dimensions; in test environments (jsdom where rect is 0x0), accept if visible
        if ((r.width === 0 && r.height === 0) || (r.width >= 50 && r.height >= 50)) {
          return candidate;
        }
      } else {
        return candidate;
      }
    }
  }
  return null;
}

export function extractModalTitle(modal: Element): string {
  const labelledBy = modal.getAttribute('aria-labelledby');
  if (labelledBy && modal.ownerDocument) {
    const titleEl = modal.ownerDocument.getElementById(labelledBy);
    if (titleEl && titleEl.textContent) {
      return sanitizeUntrustedText(titleEl.textContent.trim().replace(/\s+/g, ' '));
    }
  }
  const ariaLabel = modal.getAttribute('aria-label');
  if (ariaLabel) {
    return sanitizeUntrustedText(ariaLabel.trim().replace(/\s+/g, ' '));
  }
  const heading = modal.querySelector('h1, h2, h3, [class*="header" i], [class*="title" i]');
  if (heading && heading.textContent) {
    const text = heading.textContent.trim().replace(/\s+/g, ' ');
    if (text.length > 0 && text.length <= 100) {
      return sanitizeUntrustedText(text);
    }
  }
  return 'Modal Dialog';
}

export function isEditableElement(node: Element): boolean {
  const tag = node.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  const role = (node.getAttribute('role') || '').toLowerCase();
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton') {
    return true;
  }
  if ((node as HTMLElement).isContentEditable) {
    return true;
  }
  if (node.hasAttribute('contenteditable')) {
    const val = node.getAttribute('contenteditable');
    return val !== 'false';
  }
  return false;
}

export function findAssociatedLabel(node: Element, doc: Document): { label?: string; group?: string } {
  let labelText: string | undefined;
  let groupText: string | undefined;

  // 1. aria-labelledby
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const texts = ids
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter((t): t is string => Boolean(t));
    if (texts.length > 0) {
      labelText = texts.join(' ');
    }
  }

  // 2. <label for="node.id">
  if (!labelText && node.id) {
    try {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(node.id) : node.id.replace(/"/g, '\\"');
      const labelEl = doc.querySelector(`label[for="${escapedId}"]`);
      if (labelEl && labelEl.textContent) {
        labelText = labelEl.textContent.trim();
      }
    } catch {
      // ignore
    }
  }

  // 3. Parent <label>
  if (!labelText) {
    const parentLabel = node.closest('label');
    if (parentLabel && parentLabel !== node) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea').forEach((inp) => inp.remove());
      const txt = clone.textContent?.trim();
      if (txt) {
        labelText = txt;
      }
    }
  }

  // 4. Preceding sibling label or container label (.fb-single-line-text, .form-group, etc.)
  if (!labelText) {
    const container = node.closest(
      '.fb-single-line-text, .fb-form-element, .form-group, .form-field, [data-test-form-element], .artdeco-text-input'
    );
    if (container) {
      const groupLabel = container.querySelector('label, [class*="label" i]');
      if (groupLabel && groupLabel !== node && groupLabel.textContent) {
        labelText = groupLabel.textContent.trim();
      }
    }
  }

  // 5. Look for enclosing question / prompt container (e.g. screening questions, rich text editors)
  if (!labelText) {
    const questionContainer = node.closest(
      '[class*="question" i], [class*="prompt" i], [class*="form-group" i], [class*="form-field" i], [data-testid*="question" i], fieldset, section'
    );
    if (questionContainer) {
      const headingEl = questionContainer.querySelector(
        'h1, h2, h3, h4, h5, [class*="title" i], [class*="header" i], [class*="label" i], [class*="name" i]'
      );
      const descEl = questionContainer.querySelector(
        'p, [class*="desc" i], [class*="text" i], [class*="subtitle" i]'
      );
      const parts: string[] = [];
      if (headingEl && headingEl.textContent && !headingEl.contains(node)) {
        parts.push(headingEl.textContent.trim());
      }
      if (descEl && descEl.textContent && descEl !== headingEl && !descEl.contains(node)) {
        parts.push(descEl.textContent.trim());
      }
      if (parts.length > 0) {
        labelText = parts.join(' - ');
      }
    }
  }

  // 6. Fieldset and Legend (question group for radios/checkboxes)
  const fieldset = node.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      groupText = legend.textContent.trim();
    }
  }

  // 7. Custom radio/checkbox group headers
  if (!groupText && (node.getAttribute('type') === 'radio' || node.getAttribute('role') === 'radio' || node.getAttribute('type') === 'checkbox')) {
    const radioGroup = node.closest(
      '[data-test-form-builder-radio-button-form-component], [role="radiogroup"], .fb-radio-group, [class*="radio-group" i]'
    );
    if (radioGroup) {
      const header = radioGroup.querySelector('legend, [class*="header" i], [class*="title" i], [class*="legend" i], [class*="label" i]');
      if (header && header.textContent) {
        groupText = header.textContent.trim();
      }
    }
  }

  return {
    label: labelText ? sanitizeUntrustedText(labelText.replace(/\s+/g, ' ')) : undefined,
    group: groupText ? sanitizeUntrustedText(groupText.replace(/\s+/g, ' ')) : undefined,
  };
}

export function extractInteractiveElements(doc: Document = document): PerceivedElement[] {
  const elements: PerceivedElement[] = [];
  const rawNodes = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTORS));
  const idState = getIdState(doc);
  resetIfPageReplaced(idState);

  const activeModal = findActiveModal(doc);

  // Filter out elements
  const filteredNodes = rawNodes.filter((node) => {
    if (!isElementVisible(node)) {
      return false;
    }

    // When an active modal dialog is displayed, prioritize elements inside it exclusively
    if (activeModal && !activeModal.contains(node)) {
      return false;
    }

    // Never skip input, textarea, select, or contenteditable/rich-text elements
    const isFormInput = isEditableElement(node);

    // If a label wraps an input, let the input itself be the primary interactive element rather than duplicate badge
    if (node.tagName === 'LABEL') {
      const hasChildControl = node.querySelector('input, textarea, select, [contenteditable], [role="textbox"]');
      if (hasChildControl) {
        return false;
      }
    }

    // Skip nested elements inside a label if the label itself is already interactive
    if (!isFormInput && node.closest('label') && rawNodes.includes(node.closest('label')!)) {
      return false;
    }

    // Skip elements with zero dimensions and no text/inputs
    const text = (node.textContent || '').trim();
    if (!text && !isFormInput && !node.getAttribute('aria-label') && !node.getAttribute('title') && !node.getAttribute('placeholder')) {
      return false;
    }

    return true;
  });

  const visibleNodes = filteredNodes;

  visibleNodes.forEach((node) => {
    const tagName = node.tagName.toUpperCase();
    let role = node.getAttribute('role') || undefined;
    let type = node.getAttribute('type') || undefined;
    const isEditable = isEditableElement(node);
    if (!role && isEditable && tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT') {
      role = 'textbox';
    }

    const ariaLabel = node.getAttribute('aria-label') || undefined;
    const placeholder =
      (node as HTMLInputElement).placeholder ||
      node.getAttribute('data-placeholder') ||
      node.getAttribute('aria-placeholder') ||
      undefined;
    const value = redactValue(node, (node as HTMLInputElement).value || undefined);
    const href = scrubUrl((node as HTMLAnchorElement).href || undefined);
    const checked = node instanceof HTMLInputElement && (node.type === 'radio' || node.type === 'checkbox')
      ? node.checked
      : undefined;
    const disabled = Boolean(
      (node as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled ||
      node.getAttribute('aria-disabled') === 'true'
    ) || undefined;
    const ariaChecked = node.getAttribute('aria-checked') || undefined;
    const ariaSelected = node.getAttribute('aria-selected') || undefined;
    const ariaCurrent = node.getAttribute('aria-current') || undefined;
    const stateClasses = readStateClasses(node);

    const isInsideModal = Boolean(activeModal && activeModal.contains(node));
    const { label, group } = findAssociatedLabel(node, doc);

    // If it's a label containing a radio or checkbox, annotate its role for the LLM
    if (tagName === 'LABEL') {
      const childInput = node.querySelector('input');
      if (childInput) {
        type = childInput.type;
        role = role || (childInput.type === 'radio' ? 'radio' : childInput.type === 'checkbox' ? 'checkbox' : undefined);
      }
    }

    // Clean text representation
    let text = sanitizeUntrustedText((node.textContent || '').trim().replace(/\s+/g, ' '));
    if (text.length > 100) {
      text = text.substring(0, 100) + '...';
    }

    let rect: ElementRect = { x: 0, y: 0, width: 0, height: 0 };
    if (node.getBoundingClientRect) {
      const domRect = node.getBoundingClientRect();
      rect = {
        x: Math.round(domRect.x || domRect.left || 0),
        y: Math.round(domRect.y || domRect.top || 0),
        width: Math.round(domRect.width || 0),
        height: Math.round(domRect.height || 0),
      };
    }

    // Tag the DOM node with the assigned Browgent ID for easy lookup
    const elementId = assignElementId(doc, node);
    node.setAttribute('data-browgent-id', elementId.toString());

    elements.push({
      id: elementId,
      tagName,
      role,
      type,
      text,
      label,
      group,
      placeholder: placeholder ? sanitizeUntrustedText(placeholder) : undefined,
      value,
      ariaLabel: ariaLabel ? sanitizeUntrustedText(ariaLabel) : undefined,
      href,
      checked,
      disabled,
      ariaChecked,
      ariaSelected,
      ariaCurrent,
      stateClasses,
      isModal: isInsideModal,
      priority: isInsideModal ? -1 : viewportPriority(rect, doc),
      rect,
      domNode: node,
    });
  });

  idState.lastNodes = filteredNodes;

  return elements;
}

export function formatElementsForPrompt(elements: PerceivedElement[], activeModalTitle?: string): string {
  if (elements.length === 0) {
    return 'No visible interactive elements detected on this page.';
  }

  const notes = elements.filter((e) => e.id === -1);
  const candidates = elements
    .filter((e) => e.id !== -1)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  const lines: string[] = [];
  let usedChars = 0;
  let usedElements = 0;
  let omitted = 0;

  if (activeModalTitle) {
    lines.push(`[ACTIVE MODAL DIALOG DETECTED: "${activeModalTitle}"]`);
    lines.push('A modal dialog is currently open on top of the page. You MUST interact with the modal dialog elements first to complete or submit the form.');
  }

  for (const el of candidates) {
    if (usedElements >= MAX_PERCEIVED_ELEMENTS) {
      omitted++;
      continue;
    }

    const parts: string[] = [];
    const tagLower = el.tagName.toLowerCase();

    let tagSpec = tagLower;
    if (el.role) {
      tagSpec += ` role="${el.role}"`;
    }
    if (el.type) {
      tagSpec += ` type="${el.type}"`;
    }

    parts.push(`[${el.id}] <${tagSpec}>`);

    if (el.group) {
      parts.push(` group="${el.group}"`);
    }
    if (el.label) {
      parts.push(` label="${el.label}"`);
    }
    if (el.text && el.text !== el.label && el.text !== el.group) {
      parts.push(` ${el.text}`);
    }
    if (el.placeholder) {
      parts.push(` placeholder="${el.placeholder}"`);
    }
    if (el.value) {
      parts.push(` value="${el.value}"`);
    }
    if (el.ariaLabel && el.ariaLabel !== el.text && el.ariaLabel !== el.label) {
      parts.push(` aria-label="${el.ariaLabel}"`);
    }
    if (el.checked !== undefined) {
      parts.push(` checked="${el.checked}"`);
    }
    if (el.disabled) {
      parts.push(' disabled="true"');
    }
    if (el.ariaChecked) {
      parts.push(` aria-checked="${el.ariaChecked}"`);
    }
    if (el.ariaSelected) {
      parts.push(` aria-selected="${el.ariaSelected}"`);
    }
    if (el.ariaCurrent) {
      parts.push(` aria-current="${el.ariaCurrent}"`);
    }
    if (el.stateClasses) {
      parts.push(` state="${el.stateClasses}"`);
    }

    const line = parts.join('');
    if (usedChars + line.length > MAX_PROMPT_CHARS) {
      omitted += candidates.length - candidates.indexOf(el);
      break;
    }
    lines.push(line);
    usedChars += line.length;
    usedElements++;
  }

  const trailing: string[] = [];
  if (omitted > 0) {
    trailing.push(
      `[NOTE] ${omitted} further interactive elements exist on this page but are not listed here. Scroll the page so they enter the viewport, then they will be listed.`
    );
  }
  for (const note of notes) {
    trailing.push(`[NOTE] ${note.text}`);
  }

  return [...lines, ...trailing].join('\n');
}

export const MAX_TEXT_EXCERPT_CHARS = 10000;

export function extractVisibleText(doc: Document = document, limit = MAX_TEXT_EXCERPT_CHARS): string {
  const body = doc.body;
  if (!body) return '';

  const raw = (body.innerText || body.textContent || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= limit) return raw;

  return `${raw.slice(0, limit)}…`;
}

export function captureDOMState(doc: Document = document): DOMState {
  const activeModal = findActiveModal(doc);
  const activeModalTitle = activeModal ? extractModalTitle(activeModal) : undefined;
  const elements = extractInteractiveElements(doc);
  const formattedPrompt = formatElementsForPrompt(elements, activeModalTitle);
  const textExcerpt = extractVisibleText(doc);

  const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  const width = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;

  return {
    url: scrubUrl(doc.location ? doc.location.href : '') ?? '',
    title: doc.title || '',
    elements,
    formattedPrompt,
    activeModalTitle,
    textExcerpt,
    viewport: {
      width,
      height,
      scrollX,
      scrollY,
    },
  };
}
