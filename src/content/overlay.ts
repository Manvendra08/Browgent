import { PerceivedElement } from './types';

const OVERLAY_CONTAINER_ID = 'browgent-overlay-container';
const CURSOR_ID = 'browgent-virtual-cursor';
const SCROLL_HUD_ID = 'browgent-scroll-hud';
const STYLE_TAG_ID = 'browgent-overlay-styles';

let scrollHudTimer: ReturnType<typeof setTimeout> | null = null;
let lastCursorCoords = { x: 100, y: 100 };

function ensureOverlayStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes browgent-ripple-core {
      0% {
        transform: translate(-50%, -50%) scale(0.2);
        opacity: 0.95;
      }
      100% {
        transform: translate(-50%, -50%) scale(2.8);
        opacity: 0;
      }
    }
    @keyframes browgent-ripple-outer {
      0% {
        transform: translate(-50%, -50%) scale(0.1);
        opacity: 0.8;
      }
      100% {
        transform: translate(-50%, -50%) scale(4.4);
        opacity: 0;
      }
    }
    @keyframes browgent-pulse-glow {
      0%, 100% {
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.95), 0 0 20px rgba(99, 102, 241, 0.6);
      }
      50% {
        box-shadow: 0 0 0 4px rgba(129, 140, 248, 1), 0 0 28px rgba(129, 140, 248, 0.85);
      }
    }
    @keyframes browgent-hud-pop {
      0% {
        opacity: 0;
        transform: translate(-50%, 16px) scale(0.95);
      }
      15% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      85% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -8px) scale(0.96);
      }
    }
    @keyframes browgent-hud-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }
    .browgent-action-spotlight {
      outline: 2px solid #6366f1 !important;
      outline-offset: 3px !important;
      animation: browgent-pulse-glow 0.8s ease-in-out infinite !important;
      transition: outline 0.2s, box-shadow 0.2s !important;
    }
    .browgent-ripple-container {
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      width: 0;
      height: 0;
    }
    .browgent-ripple-ring {
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 50%;
      pointer-events: none;
    }
    .browgent-ripple-ring.core {
      width: 32px;
      height: 32px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.7) 0%, rgba(99, 102, 241, 0.1) 70%, transparent 100%);
      border: 2px solid #6366f1;
      animation: browgent-ripple-core 0.45s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
    }
    .browgent-ripple-ring.outer {
      width: 32px;
      height: 32px;
      border: 1.5px solid rgba(165, 180, 252, 0.75);
      animation: browgent-ripple-outer 0.55s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
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
    cursor.style.width = '28px';
    cursor.style.height = '28px';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '2147483647';
    cursor.style.transformOrigin = '2px 2px';
    cursor.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
    cursor.style.transform = `translate3d(${lastCursorCoords.x}px, ${lastCursorCoords.y}px, 0)`;
    cursor.style.opacity = '0';
    cursor.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
        <path d="M4 2L24 11L14 15L10 24L4 2Z" fill="url(#browgent-grad)" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="14" cy="14" r="2.5" fill="#FFFFFF" opacity="0.9" />
        <defs>
          <linearGradient id="browgent-grad" x1="4" y1="2" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stop-color="#818CF8"/>
            <stop offset="1" stop-color="#4F46E5"/>
          </linearGradient>
        </defs>
      </svg>
    `;
    (document.body || document.documentElement)?.appendChild(cursor);
  }
  return cursor;
}

export function animateCursorTo(clientX: number, clientY: number, click = false): void {
  const cursor = getOrCreateVirtualCursor();
  if (!cursor) return;
  lastCursorCoords = { x: clientX, y: clientY };
  cursor.style.opacity = '1';

  if (click) {
    // Tactile press animation: glide to target and press down
    cursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) scale(0.84)`;
    setTimeout(() => {
      cursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) scale(1)`;
    }, 120);
  } else {
    cursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) scale(1)`;
  }
}

export function triggerClickRipple(clientX: number, clientY: number): void {
  if (typeof document === 'undefined') return;
  ensureOverlayStyles();

  const container = document.createElement('div');
  container.className = 'browgent-ripple-container';
  container.style.left = `${clientX}px`;
  container.style.top = `${clientY}px`;

  const core = document.createElement('div');
  core.className = 'browgent-ripple-ring core';

  const outer = document.createElement('div');
  outer.className = 'browgent-ripple-ring outer';

  container.appendChild(core);
  container.appendChild(outer);

  (document.body || document.documentElement)?.appendChild(container);
  setTimeout(() => container.remove(), 600);
}

export function highlightActiveElement(el: HTMLElement, durationMs = 900): void {
  if (!el || !el.classList) return;
  ensureOverlayStyles();
  el.classList.add('browgent-action-spotlight');
  setTimeout(() => {
    el.classList.remove('browgent-action-spotlight');
  }, durationMs);
}

export function showScrollIndicator(deltaY = 0, deltaX = 0): void {
  if (typeof document === 'undefined') return;
  ensureOverlayStyles();

  let hud = document.getElementById(SCROLL_HUD_ID);
  if (!hud) {
    hud = document.createElement('div');
    hud.id = SCROLL_HUD_ID;
    hud.style.position = 'fixed';
    hud.style.bottom = '28px';
    hud.style.left = '50%';
    hud.style.transform = 'translate(-50%, 0)';
    hud.style.zIndex = '2147483647';
    hud.style.pointerEvents = 'none';
    hud.style.display = 'flex';
    hud.style.alignItems = 'center';
    hud.style.gap = '8px';
    hud.style.padding = '8px 16px';
    hud.style.borderRadius = '9999px';
    hud.style.background = 'rgba(15, 23, 42, 0.88)';
    hud.style.backdropFilter = 'blur(12px)';
    hud.style.border = '1px solid rgba(99, 102, 241, 0.45)';
    hud.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4), 0 0 15px rgba(99, 102, 241, 0.3)';
    hud.style.color = '#FFFFFF';
    hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    hud.style.fontSize = '12px';
    hud.style.fontWeight = '600';
    hud.style.letterSpacing = '0.02em';
    (document.body || document.documentElement)?.appendChild(hud);
  }

  const isDown = deltaY > 0;
  const isUp = deltaY < 0;
  const directionText = isDown ? 'Scrolling down' : isUp ? 'Scrolling up' : deltaX !== 0 ? 'Scrolling sideways' : 'Scrolling page';
  const arrowSvg = isDown
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: browgent-hud-bounce 0.6s infinite;"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>'
    : isUp
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: browgent-hud-bounce 0.6s infinite;"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  hud.innerHTML = `${arrowSvg}<span>${directionText}</span>`;
  hud.style.animation = 'none';
  // Trigger reflow to restart animation
  void hud.offsetWidth;
  hud.style.animation = 'browgent-hud-pop 0.75s ease-in-out forwards';

  if (scrollHudTimer) clearTimeout(scrollHudTimer);
  scrollHudTimer = setTimeout(() => {
    hud?.remove();
  }, 800);

  // Also glide the virtual cursor gently toward the center
  const viewportWidth = window.innerWidth || 800;
  const viewportHeight = window.innerHeight || 600;
  const targetX = Math.round(viewportWidth / 2);
  const targetY = isDown ? Math.min(viewportHeight - 120, lastCursorCoords.y + 100) : Math.max(120, lastCursorCoords.y - 100);
  animateCursorTo(targetX, targetY);
}

export function removeVirtualCursor(): void {
  if (typeof document === 'undefined') return;
  const cursor = document.getElementById(CURSOR_ID);
  if (cursor) cursor.remove();
}

export function cleanupAgentVisuals(): void {
  if (typeof document === 'undefined') return;
  clearElementBadges();
  removeVirtualCursor();
  const hud = document.getElementById(SCROLL_HUD_ID);
  if (hud) hud.remove();
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
  // Note: we intentionally do NOT call removeVirtualCursor() here
  // so the cursor stays visible and glides between agent actions!
}
