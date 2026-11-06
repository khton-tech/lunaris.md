import { JSDOM } from 'jsdom';

/** Browser globals required by React/Mantine; production code never installs globals. */
export function useBrowser(dom) {
  if (dom.window.location.href === 'about:blank') dom.reconfigure({ url: 'https://lunaris.test/' });
  const view = dom.window;
  view.matchMedia ??= query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
  view.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  view.requestAnimationFrame ??= callback => view.setTimeout(() => callback(view.performance.now()), 16);
  view.cancelAnimationFrame ??= id => view.clearTimeout(id);
  for (const [key, value] of Object.entries({ addEventListener: view.addEventListener.bind(view), removeEventListener: view.removeEventListener.bind(view), window: view, document: view.document, AbortController: view.AbortController, AbortSignal: view.AbortSignal, navigator: view.navigator, HTMLElement: view.HTMLElement, Image: view.Image, Element: view.Element, Node: view.Node, getComputedStyle: view.getComputedStyle.bind(view), ResizeObserver: view.ResizeObserver, requestAnimationFrame: view.requestAnimationFrame.bind(view), cancelAnimationFrame: view.cancelAnimationFrame.bind(view) })) {
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
useBrowser(new JSDOM('<!doctype html><html><body></body></html>'));
