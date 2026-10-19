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
    expect(formatted).toContain('[1] <button> Submit Order');
    expect(formatted).toContain('[2] <a> Sign In');
    expect(formatted).toContain('[3] <input type="text"> placeholder="Search products..."');
    expect(formatted).toContain('[4] <textarea> placeholder="Leave comments..."');
    expect(formatted).toContain('[5] <select>');
    expect(formatted).toContain('[6] <div role="button"> Custom Button');
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
