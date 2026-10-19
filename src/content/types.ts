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
  placeholder?: string;
  value?: string;
  ariaLabel?: string;
  href?: string;
  rect: ElementRect;
  domNode?: Element;
}

export interface DOMState {
  url: string;
  title: string;
  elements: PerceivedElement[];
  formattedPrompt: string;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
}
