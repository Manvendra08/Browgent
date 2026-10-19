import { PerceivedElement } from './types';

const OVERLAY_CONTAINER_ID = 'browgent-overlay-container';

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
}
