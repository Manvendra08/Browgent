import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { extractInteractiveElements } from '../../src/content/extractor';

interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContentResponse {
  success: boolean;
  error?: string;
  rect?: ContentRect;
}

type ContentListener = (
  message: Record<string, unknown>,
  sender: unknown,
  sendResponse: (response: ContentResponse) => void
) => unknown;

let listener: ContentListener;

beforeAll(async () => {
  const addListener = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener },
    },
  });

  await import('../../src/content/index');

  const registered = addListener.mock.calls[0]?.[0] as ContentListener | undefined;
  if (!registered) {
    throw new Error('content script did not register a runtime.onMessage listener');
  }
  listener = registered;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  document.body.innerHTML = `
    <input type="radio" id="radio1" name="group" value="a" />
    <button id="btn1">Buy now</button>
  `;
});

function send(message: Record<string, unknown>): Promise<ContentResponse> {
  return new Promise((resolve) => {
    listener(message, {}, (response) => resolve(response));
  });
}

describe('Content script message protocol', () => {
  it('checks a radio input and dispatches bubbling change and input events', async () => {
    const elements = extractInteractiveElements(document);
    const radio = elements.find((el) => el.tagName === 'INPUT' && el.type === 'radio');
    expect(radio).toBeDefined();

    const radioEl = radio?.domNode as HTMLInputElement;
    const changeSpy = vi.fn();
    const inputSpy = vi.fn();
    radioEl.addEventListener('change', changeSpy);
    radioEl.addEventListener('input', inputSpy);

    const response = await send({ type: 'CLICK_ELEMENT', elementId: radio?.id });

    expect(response.success).toBe(true);
    expect(radioEl.checked).toBe(true);
    // jsdom's own activation behaviour for a radio already fires change/input once,
    // so the content script's explicit dispatch is an additional event.
    expect(changeSpy).toHaveBeenCalled();
    expect(inputSpy).toHaveBeenCalled();
    expect(changeSpy.mock.calls.every((call) => (call[0] as Event).bubbles)).toBe(true);
    expect(inputSpy.mock.calls.every((call) => (call[0] as Event).bubbles)).toBe(true);
  });

  it('rejects a page-forged element that only copies the data-browgent-id attribute', async () => {
    const forged = document.createElement('div');
    forged.setAttribute('data-browgent-id', '999');
    forged.textContent = 'fake button';
    document.body.appendChild(forged);

    const response = await send({ type: 'CLICK_ELEMENT', elementId: 999 });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/not found/i);
  });

  it('rejects a forged element that impersonates a real id after the real node is removed', async () => {
    const elements = extractInteractiveElements(document);
    const button = elements.find((el) => el.tagName === 'BUTTON');
    expect(button).toBeDefined();

    (button?.domNode as Element).remove();

    const forged = document.createElement('div');
    forged.setAttribute('data-browgent-id', String(button?.id));
    forged.textContent = 'fake button';
    document.body.appendChild(forged);

    const response = await send({ type: 'CLICK_ELEMENT', elementId: button?.id });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/not found/i);
  });

  it('returns the rect of a known element for GET_ELEMENT_RECT', async () => {
    const elements = extractInteractiveElements(document);
    const button = elements.find((el) => el.tagName === 'BUTTON');
    expect(button).toBeDefined();

    const buttonEl = button?.domNode as HTMLElement;
    buttonEl.getBoundingClientRect = (() => ({
      x: 12,
      y: 34,
      width: 56,
      height: 78,
      top: 34,
      left: 12,
      right: 68,
      bottom: 112,
      toJSON: () => ({}),
    })) as typeof buttonEl.getBoundingClientRect;

    const response = await send({ type: 'GET_ELEMENT_RECT', elementId: button?.id });

    expect(response.success).toBe(true);
    expect(response.rect).toEqual({ x: 12, y: 34, width: 56, height: 78 });
  });

  it('reports failure for GET_ELEMENT_RECT on an unknown id', async () => {
    const response = await send({ type: 'GET_ELEMENT_RECT', elementId: 4242 });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/not found/i);
  });

  it('sets the value and fires input and change events for TYPE_ELEMENT', async () => {
    document.body.innerHTML = '<input type="text" id="text1" />';
    const elements = extractInteractiveElements(document);
    const field = elements.find((el) => el.tagName === 'INPUT');
    expect(field).toBeDefined();

    const fieldEl = field?.domNode as HTMLInputElement;
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    fieldEl.addEventListener('input', inputSpy);
    fieldEl.addEventListener('change', changeSpy);

    const response = await send({
      type: 'TYPE_ELEMENT',
      elementId: field?.id,
      text: 'headphones',
    });

    expect(response.success).toBe(true);
    expect(fieldEl.value).toBe('headphones');
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it('toggles an already-checked checkbox to unchecked on click', async () => {
    document.body.innerHTML = '<input type="checkbox" id="chk1" checked />';
    const elements = extractInteractiveElements(document);
    const chk = elements.find((el) => el.tagName === 'INPUT' && el.type === 'checkbox');
    expect(chk).toBeDefined();

    const chkEl = chk?.domNode as HTMLInputElement;
    expect(chkEl.checked).toBe(true);

    const response = await send({ type: 'CLICK_ELEMENT', elementId: chk?.id });
    expect(response.success).toBe(true);
    expect(chkEl.checked).toBe(false);
  });

  it('types text into contenteditable elements and handles pressEnter', async () => {
    document.body.innerHTML = `
      <form id="test-form">
        <input type="text" id="inp-form" />
      </form>
      <div id="editable" contenteditable="true">Initial text</div>
    `;

    const elements = extractInteractiveElements(document);
    const editable = elements.find((el) => el.id && (el.domNode as HTMLElement)?.getAttribute('contenteditable') === 'true');
    expect(editable).toBeDefined();

    const editResponse = await send({
      type: 'TYPE_ELEMENT',
      elementId: editable?.id,
      text: 'Updated via agent',
    });
    expect(editResponse.success).toBe(true);
    expect((editable?.domNode as HTMLElement).textContent).toBe('Updated via agent');

    const formInp = elements.find((el) => el.id && el.domNode?.id === 'inp-form');
    const formEl = document.getElementById('test-form') as HTMLFormElement;
    const submitSpy = vi.fn((e: Event) => e.preventDefault());
    formEl.addEventListener('submit', submitSpy);

    const typeResponse = await send({
      type: 'TYPE_ELEMENT',
      elementId: formInp?.id,
      text: 'search query',
      pressEnter: true,
    });
    expect(typeResponse.success).toBe(true);
    expect((formInp?.domNode as HTMLInputElement).value).toBe('search query');
    expect(submitSpy).toHaveBeenCalled();
  });
});
