import { PerceivedElement } from './types';

const OVERLAY_CONTAINER_ID = 'browgent-overlay-container';
const CURSOR_ID = 'browgent-virtual-cursor';
const STYLE_TAG_ID = 'browgent-overlay-styles';

function ensureOverlayStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes browgent-ripple-anim {
      0% {
        transform: translate(-50%, -50%) scale(0.2);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(2.8);
        opacity: 0;
      }
    }
    @keyframes browgent-pulse-glow {
      0%, 100% { box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.9), 0 0 16px rgba(99, 102, 241, 0.5); }
      50% { box-shadow: 0 0 0 4px rgba(129, 140, 248, 1), 0 0 24px rgba(129, 140, 248, 0.7); }
    }
    .browgent-action-spotlight {
      outline: 2px solid #6366f1 !important;
      outline-offset: 2px !important;
      animation: browgent-pulse-glow 0.8s ease-in-out infinite !important;
      transition: outline 0.2s, box-shadow 0.2s !important;
    }
  `;
  (document.head || document.documentElement || document.body)?.appendChild(style);
}

export function getOrCreateVirtualCursor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  ensureOverlayStyles();
  let cursor = document.getElementById(CURSOR_ID);
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = CURSOR_ID;
    cursor.style.position = 'fixed';
    cursor.style.top = '0';
    cursor.style.left = '0';
    cursor.style.width = '24px';
    cursor.style.height = '24px';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '2147483647';
    cursor.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.2s ease';
    cursor.style.transform = 'translate3d(-100px, -100px, 0)';
    cursor.style.opacity = '0';
    cursor.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
        <path d="M4 2L20 9L13 13L9 20L4 2Z" fill="#6366F1" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
    (document.body || document.documentElement)?.appendChild(cursor);
  }
  return cursor;
}

export function animateCursorTo(clientX: number, clientY: number): void {
  const cursor = getOrCreateVirtualCursor();
  if (!cursor) return;
  cursor.style.opacity = '1';
  cursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
}

export function triggerClickRipple(clientX: number, clientY: number): void {
  if (typeof document === 'undefined') return;
  ensureOverlayStyles();
  const ripple = document.createElement('div');
  ripple.style.position = 'fixed';
  ripple.style.left = `${clientX}px`;
  ripple.style.top = `${clientY}px`;
  ripple.style.width = '28px';
  ripple.style.height = '28px';
  ripple.style.borderRadius = '50%';
  ripple.style.backgroundColor = 'rgba(99, 102, 241, 0.5)';
  ripple.style.border = '2px solid #6366f1';
  ripple.style.pointerEvents = 'none';
  ripple.style.zIndex = '2147483646';
  ripple.style.animation = 'browgent-ripple-anim 0.45s ease-out forwards';
  (document.body || document.documentElement)?.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

export function highlightActiveElement(el: HTMLElement, durationMs = 800): void {
  if (!el || !el.classList) return;
  ensureOverlayStyles();
  el.classList.add('browgent-action-spotlight');
  setTimeout(() => {
    el.classList.remove('browgent-action-spotlight');
  }, durationMs);
}

export function removeVirtualCursor(): void {
  if (typeof document === 'undefined') return;
  const cursor = document.getElementById(CURSOR_ID);
  if (cursor) cursor.remove();
  const style = document.getElementById(STYLE_TAG_ID);
  if (style) style.remove();
}

export function getOrCreateOverlayContainer(): HTMLElement {
  let container = document.getElementById(OVERLAY_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = OVERLAY_CONTAINER_ID;
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647';
    document.body.appendChild(container);
  }
  return container;
}

export function drawElementBadges(elements: PerceivedElement[]): void {
  const container = getOrCreateOverlayContainer();
  container.innerHTML = '';

  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;

  elements.forEach((el) => {
    if (!el.domNode || !el.domNode.getBoundingClientRect) {
      return;
    }

    const rect = el.domNode.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    const badge = document.createElement('div');
    badge.className = 'browgent-element-badge';
    badge.textContent = el.id.toString();

    badge.style.position = 'absolute';
    badge.style.left = `${rect.left + scrollX}px`;
    badge.style.top = `${rect.top + scrollY}px`;
    badge.style.backgroundColor = '#facc15'; // Bright yellow
    badge.style.color = '#000000';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = 'bold';
    badge.style.padding = '1px 4px';
    badge.style.borderRadius = '3px';
    badge.style.border = '1px solid #000000';
    badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    badge.style.pointerEvents = 'none';
    badge.style.lineHeight = '14px';
    badge.style.transform = 'translate(-2px, -2px)';
    badge.style.zIndex = '2147483647';

    container.appendChild(badge);
  });
}

export function clearElementBadges(): void {
  const container = document.getElementById(OVERLAY_CONTAINER_ID);
  if (container) {
    container.remove();
  }
  removeVirtualCursor();
}
