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

export function isElementVisible(el: Element): boolean {
  // Check inline styles and parent hidden containers
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

  let idCounter = 1;

  filteredNodes.forEach((node) => {
    const tagName = node.tagName.toUpperCase();
    let role = node.getAttribute('role') || undefined;
    let type = node.getAttribute('type') || undefined;
    const ariaLabel = node.getAttribute('aria-label') || undefined;
    const placeholder = (node as HTMLInputElement).placeholder || undefined;
    const value = (node as HTMLInputElement).value || undefined;
    const href = (node as HTMLAnchorElement).href || undefined;

    // If it's a label containing a radio or checkbox, annotate its role for the LLM
    if (tagName === 'LABEL') {
      const childInput = node.querySelector('input');
      if (childInput) {
        type = childInput.type;
        role = role || (childInput.type === 'radio' ? 'radio' : childInput.type === 'checkbox' ? 'checkbox' : undefined);
      }
    }

    // Clean text representation
    let text = (node.textContent || '').trim().replace(/\s+/g, ' ');
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
    node.setAttribute('data-browgent-id', idCounter.toString());

    elements.push({
      id: idCounter++,
      tagName,
      role,
      type,
      text,
      placeholder,
      value,
      ariaLabel,
      href,
      rect,
      domNode: node,
    });
  });

  return elements;
}

export function formatElementsForPrompt(elements: PerceivedElement[]): string {
  if (elements.length === 0) {
    return 'No visible interactive elements detected on this page.';
  }

  return elements
    .map((el) => {
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

      return parts.join('');
    })
    .join('\n');
}

export function captureDOMState(doc: Document = document): DOMState {
  const elements = extractInteractiveElements(doc);
  const formattedPrompt = formatElementsForPrompt(elements);

  const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  const width = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;

  return {
    url: doc.location ? doc.location.href : '',
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
