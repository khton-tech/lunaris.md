import { StateEffect, Transaction } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

const clearAnimation = StateEffect.define<null>();
const reducedMotion = "(prefers-reduced-motion: reduce)";

/** A zero-width, noninteractive afterimage; removed text never reenters the document. */
class DeletedText extends WidgetType {
  constructor(readonly text: string) { super(); }
  toDOM(view: EditorView): HTMLElement {
    const anchor = view.dom.ownerDocument.createElement("span");
    anchor.className = "cm-typing-deletion";
    anchor.setAttribute("aria-hidden", "true");
    anchor.contentEditable = "false";
    const text = anchor.appendChild(view.dom.ownerDocument.createElement("span"));
    text.textContent = this.text;
    return anchor;
  }
  override get estimatedHeight(): number { return 0; }
}

const feedback = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none;
  timer: ReturnType<typeof setTimeout> | undefined;
  readonly preference: MediaQueryList | undefined;
  constructor(readonly view: EditorView) {
    this.preference = view.dom.ownerDocument.defaultView?.matchMedia?.(reducedMotion);
    this.preference?.addEventListener("change", this.clear);
  }
  clear = (): void => {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.decorations.size) this.view.dispatch({ effects: clearAnimation.of(null), annotations: Transaction.addToHistory.of(false) });
  };
  update(update: ViewUpdate): void {
    if (update.transactions.some(transaction => transaction.effects.some(effect => effect.is(clearAnimation)))) {
      this.decorations = Decoration.none;
    }
    if (!update.docChanged) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.decorations = Decoration.none;
    // Composition owns its DOM. Paste, history and external updates do not animate.
    if (this.preference?.matches || update.view.composing || update.state.readOnly || update.transactions.length !== 1) return;
    const transaction = update.transactions[0]!;
    if ((!transaction.isUserEvent("input.type") || transaction.isUserEvent("input.type.compose")) && !transaction.isUserEvent("delete")) return;
    const ranges: Range<Decoration>[] = [];
    transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      const added = inserted.toString();
      const removed = transaction.startState.sliceDoc(fromA, toA);
      // Keep feedback local to short edits, never animate paragraphs or bulk changes.
      if (added.length <= 8 && added.trim() && !/[\r\n]/.test(added)) {
        ranges.push(Decoration.mark({ class: "cm-typing-insertion" }).range(fromB, toB));
      }
      if (!added && removed.length <= 8 && removed.trim() && !/[\r\n]/.test(removed)) {
        ranges.push(Decoration.widget({ widget: new DeletedText(removed), side: -1 }).range(fromB));
      }
    });
    this.decorations = Decoration.set(ranges.slice(0, 32), true);
    if (this.decorations.size) this.timer = setTimeout(this.clear, 200);
  }
  destroy(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.preference?.removeEventListener("change", this.clear);
  }
}, { decorations: instance => instance.decorations });

const appearance = EditorView.baseTheme({
  "@keyframes cm-typing-appear": { from: { opacity: "0.45" }, to: { opacity: "1" } },
  "@keyframes cm-typing-disappear": { from: { opacity: "0.55" }, to: { opacity: "0" } },
  ".cm-typing-insertion": {
    animation: "cm-typing-appear clamp(0ms, var(--vault-motion-fast, 120ms), 180ms) var(--vault-motion-easing, ease-out) both",
  },
  ".cm-typing-deletion": {
    display: "inline-block", position: "relative", width: "0", height: "0",
    pointerEvents: "none", userSelect: "none", verticalAlign: "baseline",
  },
  ".cm-typing-deletion > span": {
    position: "absolute", insetInlineStart: "0", bottom: "-0.2em", whiteSpace: "pre",
    animation: "cm-typing-disappear clamp(0ms, var(--vault-motion-fast, 120ms), 180ms) var(--vault-motion-easing, ease-out) both",
  },
  "@media (prefers-reduced-motion: reduce)": {
    ".cm-typing-insertion": { animation: "none" },
    ".cm-typing-deletion": { display: "none" },
  },
});

/** Presentation only: no document, selection, history or persistence changes. */
export const typingAnimation = [feedback, appearance];
