export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PerceivedElement {
  id: number;
  tagName: string;
  role?: string;
  type?: string;
  text: string;
  label?: string;
  group?: string;
  placeholder?: string;
  value?: string;
  ariaLabel?: string;
  href?: string;
  checked?: boolean;
  disabled?: boolean;
  ariaChecked?: string;
  ariaSelected?: string;
  ariaCurrent?: string;
  stateClasses?: string;
  isModal?: boolean;
  priority?: number;
  rect: ElementRect;
  domNode?: Element;
}

export interface DOMState {
  url: string;
  title: string;
  elements: PerceivedElement[];
  formattedPrompt: string;
  activeModalTitle?: string;
  /**
   * Bounded, whitespace-collapsed digest of the page's visible text. Interactive
   * element labels alone cannot answer "what does this page say" goals, and the
   * completion auditor needs real page content to ground a verdict.
   */
  textExcerpt: string;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
}
