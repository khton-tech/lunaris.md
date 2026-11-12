import { observeVirtualKeyboard } from "@lunaris/components";
import type { KeyboardViewport } from "@lunaris/components";
import { EditorView, ViewPlugin } from "@codemirror/view";

/** Keep the insertion line visible in the editor's own scrolling region. */
export function mobileCaret(viewport?: HTMLElement) {
  return ViewPlugin.define(view => {
    const window = view.dom.ownerDocument.defaultView!;
    let keyboard: KeyboardViewport | null = null;
    let frame = 0;
    const follow = () => {
      if (!keyboard || frame || !view.hasFocus || view.state.readOnly || !view.state.selection.main.empty) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const selection = view.state.selection.main;
        if (!keyboard || !view.hasFocus || view.state.readOnly || !selection.empty) return;
        const caret = view.coordsAtPos(selection.head, selection.assoc || 1);
        if (!caret) {
          view.dispatch({ effects: EditorView.scrollIntoView(selection) });
          return;
        }
        // The public editor role lends a joint title/body scroller in compact
        // layout. CodeMirror owns its internal scroller in other layouts.
        const ownScroll = window.getComputedStyle(view.scrollDOM).overflowY;
        const scroll = viewport && ownScroll === "visible" ? viewport : view.scrollDOM;
        const bounds = scroll.getBoundingClientRect();
        const top = Math.max(bounds.top, keyboard.top);
        const bottom = Math.min(bounds.bottom, keyboard.top + keyboard.height);
        if (bottom <= top) return;
        const margin = Math.min(12, (bottom - top) / 4);
        if (caret.bottom > bottom - margin) scroll.scrollTop += caret.bottom - bottom + margin;
        else if (caret.top < top + margin) scroll.scrollTop += caret.top - top - margin;
      });
    };
    const unsubscribe = observeVirtualKeyboard(window, value => { keyboard = value; follow(); });
    return {
      update(update) {
        if (update.docChanged || update.selectionSet || update.focusChanged) follow();
      },
      destroy() {
        unsubscribe();
        if (frame) window.cancelAnimationFrame(frame);
      },
    };
  });
}
