import { PerceivedElement, DOMState, ElementRect } from './types';

const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
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
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
    } catch {
      // In non-DOM testing environments
    }
  }

  return true;
}

export function extractInteractiveElements(doc: Document = document): PerceivedElement[] {
  const elements: PerceivedElement[] = [];
  const rawNodes = doc.querySelectorAll(INTERACTIVE_SELECTORS);

  let idCounter = 1;

  rawNodes.forEach((node) => {
    if (!isElementVisible(node)) {
      return;
    }

    const tagName = node.tagName.toUpperCase();
    const role = node.getAttribute('role') || undefined;
    const type = node.getAttribute('type') || undefined;
    const ariaLabel = node.getAttribute('aria-label') || undefined;
    const placeholder = (node as HTMLInputElement).placeholder || undefined;
    const value = (node as HTMLInputElement).value || undefined;
    const href = (node as HTMLAnchorElement).href || undefined;

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
