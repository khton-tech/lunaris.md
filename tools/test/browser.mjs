import { JSDOM } from 'jsdom';

/** Browser globals required by React/Mantine; production code never installs globals. */
export function useBrowser(dom) {
  if (dom.window.location.href === 'about:blank') dom.reconfigure({ url: 'https://lunaris.test/' });
  const view = dom.window;
  // JSDOM omits the FontFaceSet events used by Mantine's autosizing textarea.
  if (!view.document.fonts) Object.defineProperty(view.document, 'fonts', { configurable: true, value: new view.EventTarget() });
  view.matchMedia ??= query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
  view.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  // JSDOM has no layout/scrolling implementation; Combobox calls this browser API.
  view.HTMLElement.prototype.scrollIntoView ??= function () {};
  view.requestAnimationFrame ??= callback => view.setTimeout(() => callback(view.performance.now()), 16);
  view.cancelAnimationFrame ??= id => view.clearTimeout(id);
  for (const [key, value] of Object.entries({ addEventListener: view.addEventListener.bind(view), removeEventListener: view.removeEventListener.bind(view), window: view, document: view.document, AbortController: view.AbortController, AbortSignal: view.AbortSignal, navigator: view.navigator, HTMLElement: view.HTMLElement, HTMLAnchorElement: view.HTMLAnchorElement, Image: view.Image, Element: view.Element, Node: view.Node, getComputedStyle: view.getComputedStyle.bind(view), ResizeObserver: view.ResizeObserver, requestAnimationFrame: view.requestAnimationFrame.bind(view), cancelAnimationFrame: view.cancelAnimationFrame.bind(view) })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  return dom;
}

/** Use the browser setter so React observes the simulated user edit. */
export function typeInput(input, value) {
  const view = input.ownerDocument.defaultView;
  Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new view.Event('input', { bubbles: true }));
}

/** Simulate a touch-first viewport without depending on native browser layout. */
export function mobileViewport(window, height = 720) {
  const matchMedia = window.matchMedia;
  window.matchMedia = query => {
    const media = matchMedia(query);
    return query === '(pointer: coarse)' ? { ...media, matches: true } : media;
  };
  window.innerHeight = height;
  const viewport = Object.assign(new window.EventTarget(), { height, width: window.innerWidth, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return viewport;
}

useBrowser(new JSDOM('<!doctype html><html><body></body></html>'));
