/** Touch-first browsers and mobile WebViews use native text selection. */
export function usesTouchInput(window: Window | null, event?: MouseEvent): boolean {
  if (!window) return false;
  const { navigator } = window;
  return (event as PointerEvent | undefined)?.pointerType === "touch" ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export interface KeyboardViewport {
  /** Height above the keyboard in CSS pixels. */
  readonly height: number;
  /** Offset from the layout viewport when the browser pans to the focused field. */
  readonly top: number;
}

type Listener = (viewport: KeyboardViewport | null) => void;
const observers = new WeakMap<Window, (listener: Listener) => () => void>();
const textEntry = [
  "textarea:read-write", "[contenteditable='true']", "[contenteditable='plaintext-only']", "[contenteditable='']",
  ...["text", "search", "email", "url", "tel", "password", "number"].map(type => `input[type="${type}"]:read-write`),
  "input:not([type]):read-write",
].join(",");

/** Subscribe to keyboard-driven changes without treating pinch zoom as a keyboard. */
export function observeVirtualKeyboard(window: Window, listener: Listener): () => void {
  let subscribe = observers.get(window);
  if (!subscribe) {
    subscribe = watchKeyboard(window);
    observers.set(window, subscribe);
  }
  return subscribe(listener);
}

function watchKeyboard(window: Window): (listener: Listener) => () => void {
  const { document, visualViewport } = window;
  const listeners = new Set<Listener>();
  let current: KeyboardViewport | null = null;
  let expandedHeight = 0;
  let width = 0;
  let frame = 0;
  const measure = () => {
    frame = 0;
    const height = visualViewport?.height ?? window.innerHeight;
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const unzoomed = Math.abs((visualViewport?.scale ?? 1) - 1) < 0.02;
    const focused = document.activeElement;
    const editing = focused?.matches(textEntry) && focused.getAttribute("inputmode") !== "none";
    let next: KeyboardViewport | null = null;
    if (unzoomed && usesTouchInput(window)) {
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        expandedHeight = layoutHeight;
      }
      // Some WebViews shrink both viewports. Retain their pre-focus height.
      const loss = Math.max(layoutHeight, expandedHeight) - height;
      if ((editing || current) && loss >= (current ? 48 : 96)) {
        next = { height: Math.floor(height), top: Math.max(0, Math.round(visualViewport?.offsetTop ?? 0)) };
      } else {
        expandedHeight = editing ? Math.max(expandedHeight, height) : height;
      }
    }
    if (next?.height === current?.height && next?.top === current?.top) return;
    current = next;
    for (const listener of listeners) listener(current);
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
  window.addEventListener("resize", schedule);
  visualViewport?.addEventListener("resize", schedule);
  visualViewport?.addEventListener("scroll", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  measure();
  return listener => {
    listeners.add(listener);
    listener(current);
    return () => {
      if (!listeners.delete(listener) || listeners.size) return;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      observers.delete(window);
    };
  };
}
