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
  '[role="switch"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
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

export function extractInteractiveElements(doc: Document = document): PerceivedElement[] {
  const elements: PerceivedElement[] = [];
  const rawNodes = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTORS));
  const idState = getIdState(doc);
  resetIfPageReplaced(idState);

  // Filter out elements that are inside another extracted label/button with the same text to prevent duplicate badges
  const filteredNodes = rawNodes.filter((node) => {
    if (!isElementVisible(node)) {
      return false;
    }

    // Skip nested elements inside a label if the label itself is already interactive
    if (node.tagName !== 'LABEL' && node.closest('label') && rawNodes.includes(node.closest('label')!)) {
      // If it's the input inside the label, let the label represent the clickable target with text
      return false;
    }

    // Skip elements with zero dimensions and no text/inputs
    const text = (node.textContent || '').trim();
    const isInput = node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
    if (!text && !isInput && !node.getAttribute('aria-label') && !node.getAttribute('title')) {
      return false;
    }

    return true;
  });

  const visibleNodes = filteredNodes;

  visibleNodes.forEach((node) => {
    const tagName = node.tagName.toUpperCase();
    let role = node.getAttribute('role') || undefined;
    let type = node.getAttribute('type') || undefined;
    const ariaLabel = node.getAttribute('aria-label') || undefined;
    const placeholder = (node as HTMLInputElement).placeholder || undefined;
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
      priority: viewportPriority(rect, doc),
      rect,
      domNode: node,
    });
  });

  idState.lastNodes = filteredNodes;

  return elements;
}

export function formatElementsForPrompt(elements: PerceivedElement[]): string {
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

    if (el.text) {
      parts.push(` ${el.text}`);
    }
    if (el.placeholder) {
      parts.push(` placeholder="${el.placeholder}"`);
    }
    if (el.value) {
      parts.push(` value="${el.value}"`);
    }
    if (el.ariaLabel && el.ariaLabel !== el.text) {
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

export function captureDOMState(doc: Document = document): DOMState {
  const elements = extractInteractiveElements(doc);
  const formattedPrompt = formatElementsForPrompt(elements);

  const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  const width = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;

  return {
    url: scrubUrl(doc.location ? doc.location.href : '') ?? '',
    title: doc.title || '',
    elements,
    formattedPrompt,
    viewport: {
      width,
      height,
      scrollX,
      scrollY,
    },
  };
}
