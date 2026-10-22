import { describe, it, expect, beforeEach } from 'vitest';
import { extractInteractiveElements, formatElementsForPrompt } from '../../src/content/extractor';

describe('DOM Extractor', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <h1>Welcome to Store</h1>
        <button id="btn1">Submit Order</button>
        <a href="/login" id="link1">Sign In</a>
        <input type="text" placeholder="Search products..." id="inp1" value="" />
        <textarea placeholder="Leave comments..." id="txt1"></textarea>
        <select id="sel1">
          <option value="1">Option 1</option>
        </select>
        <div role="button" id="roleBtn">Custom Button</div>
        <div style="display: none;"><button id="hiddenBtn">Hidden</button></div>
      </div>
    `;
  });

  it('extracts visible interactive elements with assigned sequential IDs', () => {
    const elements = extractInteractiveElements(document);
    expect(elements.length).toBe(6);
    expect(elements[0].text).toContain('Submit Order');
    expect(elements[1].text).toContain('Sign In');
    expect(elements[2].placeholder).toContain('Search products');
    expect(elements[3].placeholder).toContain('Leave comments');
    expect(elements[4].tagName).toBe('SELECT');
    expect(elements[5].text).toContain('Custom Button');
  });

  it('formats elements into compact token-efficient markdown', () => {
    const elements = extractInteractiveElements(document);
    const formatted = formatElementsForPrompt(elements);
    const button = elements.find((e) => e.text.includes('Submit Order'));
    const link = elements.find((e) => e.text.includes('Sign In'));
    const input = elements.find((e) => e.placeholder?.includes('Search products'));
    const textarea = elements.find((e) => e.placeholder?.includes('Leave comments'));
    const select = elements.find((e) => e.tagName === 'SELECT');
    const roleButton = elements.find((e) => e.text.includes('Custom Button'));

    expect(formatted).toContain(`[${button?.id}] <button> Submit Order`);
    expect(formatted).toContain(`[${link?.id}] <a> Sign In`);
    expect(formatted).toContain(`[${input?.id}] <input type="text"> placeholder="Search products..."`);
    expect(formatted).toContain(`[${textarea?.id}] <textarea> placeholder="Leave comments..."`);
    expect(formatted).toContain(`[${select?.id}] <select>`);
    expect(formatted).toContain(`[${roleButton?.id}] <div role="button"> Custom Button`);
  });

  it('ignores hidden elements', () => {
    const elements = extractInteractiveElements(document);
    const hasHidden = elements.some((el) => el.text.includes('Hidden'));
    expect(hasHidden).toBe(false);
  });

  it('extracts quiz radio options and labels even with hidden opacity radio inputs', () => {
    document.body.innerHTML = `
      <div class="quiz-question">
        <p>Which historical creative revolution?</p>
        <div class="quiz-options">
          <label class="option-row">
            <input type="radio" name="q1" value="opt1" style="opacity: 0; position: absolute;" />
            <span class="option-text">The invention of photography</span>
          </label>
          <label class="option-row">
            <input type="radio" name="q1" value="opt2" style="opacity: 0; position: absolute;" />
            <span class="option-text">The industrial revolution</span>
          </label>
        </div>
        <button id="btn-next">NEXT</button>
        <button id="btn-submit">SUBMIT</button>
      </div>
    `;

    const elements = extractInteractiveElements(document);
    const texts = elements.map((e) => e.text);
    expect(texts.some((t) => t.includes('The invention of photography'))).toBe(true);
    expect(texts.some((t) => t.includes('The industrial revolution'))).toBe(true);
    expect(texts.some((t) => t.includes('NEXT'))).toBe(true);
    expect(texts.some((t) => t.includes('SUBMIT'))).toBe(true);
  });
});
