import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractInteractiveElements,
  assignElementId,
  isKnownElement,
} from '../../src/content/extractor';

describe('Element identity', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <button id="btn1">Submit Order</button>
        <a href="/login" id="link1">Sign In</a>
        <input type="text" id="inp1" value="" />
      </div>
    `;
  });

  it('keeps the same id for the same node across captures', () => {
    const first = extractInteractiveElements(document);
    const second = extractInteractiveElements(document);

    expect(second.map((e) => e.id)).toEqual(first.map((e) => e.id));
  });

  it('never reuses an id for a different node after the old one is replaced', () => {
    const first = extractInteractiveElements(document);
    const oldButtonId = first[0].id;

    // Replace the DOM with DIFFERENT interactive elements, so the new nodes must
    // receive fresh ids rather than inheriting the old numbering.
    document.body.innerHTML = '<div><button id="other1">Replacement A</button><button id="other2">Replacement B</button></div>';
    const second = extractInteractiveElements(document);

    expect(second.length).toBe(2);
    expect(second.some((e) => e.id === oldButtonId)).toBe(false);
    expect(new Set(second.map((e) => e.id)).size).toBe(2);
  });

  it('rejects a page-forged element that only copies the data attribute', () => {
    const elements = extractInteractiveElements(document);
    const targetId = elements[0].id;

    const forged = document.createElement('div');
    forged.setAttribute('data-browgent-id', targetId.toString());
    document.body.prepend(forged);

    expect(isKnownElement(document, forged, targetId)).toBe(false);
    expect(isKnownElement(document, elements[0].domNode as Element, targetId)).toBe(true);
  });

  it('assigns stable ids to the same node when asked directly', () => {
    const node = document.getElementById('btn1') as Element;
    const first = assignElementId(document, node);
    const second = assignElementId(document, node);
    expect(first).toBe(second);
  });
});
