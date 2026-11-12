import { observeVirtualKeyboard } from "@lunaris/components";
import type { KeyboardViewport } from "@lunaris/components";
import { EditorView, ViewPlugin } from "@codemirror/view";

const caretPosition = 0.55;
const keyboardPadding = "--editor-keyboard-padding";

/** Align the insertion line within the visible part of the editor's scroller. */
export function mobileCaret(viewport?: HTMLElement) {
  return ViewPlugin.define(view => {
    const window = view.dom.ownerDocument.defaultView!;
    let keyboard: KeyboardViewport | null = null;
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!keyboard || !view.hasFocus || view.state.readOnly) {
          view.dom.style.removeProperty(keyboardPadding);
          return;
        }
        // The public editor role lends a joint title/body scroller in compact
        // layout. CodeMirror owns its internal scroller in other layouts.
        const scroll = viewport && /^(auto|scroll)$/.test(window.getComputedStyle(viewport).overflowY) ? viewport : view.scrollDOM;
        const bounds = scroll.getBoundingClientRect();
        const top = Math.max(bounds.top, keyboard.top);
        const bottom = Math.min(bounds.bottom, keyboard.top + keyboard.height);
        if (bottom <= top) return;
        const target = top + (bottom - top) * caretPosition;
        // Reserve room inside CodeMirror so the last line can reach the target.
        view.dom.style.setProperty(keyboardPadding, `${Math.ceil(bounds.bottom - target)}px`);

        const selection = view.state.selection.main;
        if (!selection.empty) return;
        const caret = view.coordsAtPos(selection.head, selection.assoc || 1);
        if (!caret) {
          view.dispatch({ effects: EditorView.scrollIntoView(selection, { y: "center" }) });
          return;
        }
        scroll.scrollTop += Math.round((caret.top + caret.bottom) / 2 - target);
      });
    };
    const unsubscribe = observeVirtualKeyboard(window, value => { keyboard = value; follow(); });
    return {
      update(update) {
        if (keyboard && (update.docChanged || update.selectionSet || update.focusChanged || update.startState.readOnly !== update.state.readOnly)) follow();
      },
      destroy() {
        unsubscribe();
        if (frame) window.cancelAnimationFrame(frame);
      },
    };
  });
}
