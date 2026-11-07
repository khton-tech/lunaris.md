import type { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

/** Presentation only: replacements never change Markdown or clipboard contents. */
class Marker extends WidgetType {
  constructor(readonly text: string, readonly kind: string) { super(); }
  override eq(other: Marker) { return this.text === other.text && this.kind === other.kind; }
  toDOM(view: EditorView) {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = `cm-preview-${this.kind}`;
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  override ignoreEvent() { return false; }
}

function selected(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some(range => range.from <= to && range.to >= from);
}

function decorations(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const lines = new Set<number>();
  const hide = (from: number, to: number) => {
    // View plugins must not replace line breaks (vertical layout belongs to CM).
    if (from < to && state.doc.lineAt(from).number === state.doc.lineAt(to).number)
      ranges.push(Decoration.replace({}).range(from, to));
  };
  const tree = syntaxTree(state);
  for (const visible of view.visibleRanges) tree.iterate({ from: visible.from, to: visible.to, enter(node) {
    const { name, from, to } = node;
    const line = state.doc.lineAt(from);
    if (/^(ATX|Setext)Heading[1-6]$/.test(name) && !lines.has(line.from)) {
      lines.add(line.from);
      ranges.push(Decoration.line({ class: `cm-preview-heading cm-preview-h${name.at(-1)}` }).range(line.from));
    }
    // Raw HTML, images and code bodies stay literal; never interpret embedded markup.
    if (["FencedCode", "CodeBlock", "HTMLBlock", "HTMLTag", "Image"].includes(name)) {
      if (name === "FencedCode" || name === "CodeBlock") {
        for (let number = Math.max(line.number, state.doc.lineAt(visible.from).number);
          number <= state.doc.lineAt(Math.min(to, visible.to)).number; number++) {
          const start = state.doc.line(number).from;
          if (start >= visible.from && start <= visible.to && !lines.has(start)) {
            lines.add(start); ranges.push(Decoration.line({ class: "cm-preview-code-block" }).range(start));
          }
        }
      }
      return false;
    }
    if (["StrongEmphasis", "Emphasis", "Strikethrough", "InlineCode", "Link"].includes(name)) {
      if (selected(state, from, to)) return false;
      const style = { StrongEmphasis: "strong", Emphasis: "emphasis", Strikethrough: "strike", InlineCode: "code", Link: "link" }[name];
      ranges.push(Decoration.mark({ class: `cm-preview-${style}` }).range(from, to));
      if (name === "Link") {
        const children = node.node;
        const url = children.getChild("URL");
        // Only inline links with a parsed destination: reference resolution is separate.
        if (url && state.sliceDoc(from, from + 1) === "[") {
          const closing = children.getChildren("LinkMark").find(mark => state.sliceDoc(mark.from, mark.to) === "]");
          if (closing && state.doc.lineAt(closing.from).number === state.doc.lineAt(to).number) {
            hide(from, from + 1); hide(closing.from, to);
          }
        }
      }
    }
    if (["EmphasisMark", "StrikethroughMark", "CodeMark"].includes(name)) hide(from, to);
    if (["HeaderMark", "QuoteMark", "ListMark"].includes(name) && !selected(state, line.from, line.to)) {
      const end = state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
      if (name === "ListMark") {
        // Task items retain their literal, directly editable checkbox syntax.
        if (/^\s*\[[ xX]\]/.test(state.sliceDoc(to, line.to))) return;
        const text = state.sliceDoc(from, to);
        if (/^[-+*]$/.test(text)) ranges.push(Decoration.replace({ widget: new Marker("• ", "bullet") }).range(from, end));
      } else if (name === "QuoteMark") ranges.push(Decoration.replace({ widget: new Marker("│ ", "quote") }).range(from, end));
      else hide(from, end);
    }
    if (name === "HorizontalRule" && !selected(state, line.from, line.to)) {
      ranges.push(Decoration.replace({ widget: new Marker("", "rule") }).range(from, to));
      return false;
    }
  } });
  return Decoration.set(ranges, true);
}

/** Rebuild on parser progress too: large documents may parse asynchronously. */
export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state))
      this.decorations = decorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });

export const livePreviewTheme = EditorView.baseTheme({
  ".cm-preview-strong": { fontWeight: "600" },
  ".cm-preview-emphasis": { fontStyle: "italic" },
  ".cm-preview-strike": { textDecoration: "line-through" },
  ".cm-preview-code, .cm-preview-code-block": { fontFamily: "var(--vault-mono, ui-monospace, monospace)", backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)" },
  ".cm-preview-heading": { fontWeight: "600", lineHeight: "1.4" },
  ".cm-preview-h1": { fontSize: "1.8em" }, ".cm-preview-h2": { fontSize: "1.5em" },
  ".cm-preview-h3": { fontSize: "1.3em" }, ".cm-preview-h4": { fontSize: "1.15em" },
  ".cm-preview-link": { textDecoration: "underline" },
  ".cm-preview-bullet, .cm-preview-quote": { whiteSpace: "pre" },
  ".cm-preview-rule": { display: "inline-block", width: "100%", borderTop: "1px solid currentColor", opacity: "0.25", verticalAlign: "middle" },
});
