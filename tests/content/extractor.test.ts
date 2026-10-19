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
});
