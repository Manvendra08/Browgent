import { describe, it, expect, beforeEach } from 'vitest';
import { captureDOMState, extractInteractiveElements, formatElementsForPrompt, MAX_TEXT_EXCERPT_CHARS } from '../../src/content/extractor';

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

  it('extracts disabled state and formats disabled="true" into prompt', () => {
    document.body.innerHTML = `
      <div>
        <button id="btn-active">Active</button>
        <button id="btn-disabled" disabled>Disabled Button</button>
        <input type="text" id="inp-aria" aria-disabled="true" placeholder="Aria disabled" />
      </div>
    `;

    const elements = extractInteractiveElements(document);
    const disabledBtn = elements.find((e) => e.text.includes('Disabled Button'));
    const ariaDisabled = elements.find((e) => e.placeholder?.includes('Aria disabled'));

    expect(disabledBtn?.disabled).toBe(true);
    expect(ariaDisabled?.disabled).toBe(true);

    const formatted = formatElementsForPrompt(elements);
    expect(formatted).toContain('disabled="true"');
  });

  it('extracts input labels from <label for="..."> and fieldset legends for radio groups', () => {
    document.body.innerHTML = `
      <form>
        <div class="fb-single-line-text">
          <label for="exp-leadership">How many years of experience in project leadership?*</label>
          <input type="text" id="exp-leadership" value="" />
        </div>
        <fieldset>
          <legend>Have you managed multiple projects simultaneously?*</legend>
          <input type="radio" name="mng" id="mng-yes" value="Yes" />
          <label for="mng-yes">Yes</label>
          <input type="radio" name="mng" id="mng-no" value="No" />
          <label for="mng-no">No</label>
        </fieldset>
      </form>
    `;

    const elements = extractInteractiveElements(document);
    const input = elements.find((e) => e.tagName === 'INPUT' && e.type === 'text');
    const radioYes = elements.find((e) => e.tagName === 'INPUT' && e.type === 'radio' && (e.label === 'Yes' || e.text.includes('Yes')));

    expect(input?.label).toContain('How many years of experience in project leadership');
    expect(radioYes?.group).toContain('Have you managed multiple projects simultaneously');

    const formatted = formatElementsForPrompt(elements);
    expect(formatted).toContain('label="How many years of experience in project leadership?*"');
    expect(formatted).toContain('group="Have you managed multiple projects simultaneously?*"');
  });

  it('prioritizes and isolates active modal dialog elements over background elements', () => {
    document.body.innerHTML = `
      <div id="background-page">
        <button id="bg-apply">Easy Apply</button>
        <a href="/jobs/123">Job 1</a>
        <a href="/jobs/456">Job 2</a>
      </div>
      <div role="dialog" aria-modal="true" class="artdeco-modal jobs-easy-apply-modal" aria-labelledby="modal-title">
        <h2 id="modal-title">Apply to Academian Inc</h2>
        <input type="text" id="ans1" />
        <label for="ans1">Your delivery leadership experience</label>
        <button id="modal-submit">Review</button>
      </div>
    `;

    const state = captureDOMState(document);
    expect(state.activeModalTitle).toBe('Apply to Academian Inc');
    expect(state.formattedPrompt).toContain('[ACTIVE MODAL DIALOG DETECTED: "Apply to Academian Inc"]');
    expect(state.formattedPrompt).toContain('Review');
    expect(state.formattedPrompt).toContain('label="Your delivery leadership experience"');

    // Background elements (like the background Easy Apply button) must be excluded to prevent loop clicks
    expect(state.formattedPrompt).not.toContain('Easy Apply');
    expect(state.formattedPrompt).not.toContain('Job 1');
  });
});
describe('captureDOMState page text excerpt', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <h1>Head of Legal Affairs</h1>
        <p>Business leadership role. Identify legal and regulatory risks early.</p>
        <button id="apply">Easy Apply</button>
        <input type="password" id="pw" value="sup3rs3cret" aria-label="Password" />
      </div>
    `;
  });

  it('captures visible page prose, not just interactive labels', () => {
    const state = captureDOMState(document);
    expect(state.textExcerpt).toContain('Head of Legal Affairs');
    expect(state.textExcerpt).toContain('Identify legal and regulatory risks');
  });

  it('does not leak values typed into form fields', () => {
    const state = captureDOMState(document);
    expect(state.textExcerpt).not.toContain('sup3rs3cret');
  });

  it('collapses whitespace and caps the excerpt length', () => {
    document.body.innerHTML = `<div>${'word '.repeat(3000)}</div>`;
    const state = captureDOMState(document);
    expect(state.textExcerpt.length).toBeLessThanOrEqual(MAX_TEXT_EXCERPT_CHARS + 1);
    expect(state.textExcerpt.endsWith('\u2026')).toBe(true);
    expect(state.textExcerpt).not.toMatch(/\s{2,}/);
  });
});