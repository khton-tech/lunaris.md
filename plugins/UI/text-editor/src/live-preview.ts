import type { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { TaskCheckbox, taskControls } from "./task-checkbox.js";

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
  const quoteLines = new Map<number, number>();
  const hide = (from: number, to: number) => {
    // View plugins must not replace line breaks (vertical layout belongs to CM).
    if (from < to && state.doc.lineAt(from).number === state.doc.lineAt(to).number)
      ranges.push(Decoration.replace({}).range(from, to));
  };
  const tree = syntaxTree(state);
  const controls = state.facet(taskControls);
  for (const visible of view.visibleRanges) tree.iterate({ from: visible.from, to: visible.to, enter(node) {
    const { name, from, to } = node;
    const line = state.doc.lineAt(from);
    if (name === "Blockquote") {
      let depth = 1;
      for (let parent = node.node.parent; parent; parent = parent.parent) if (parent.name === "Blockquote") depth++;
      // Decorate whole source lines, including lazy continuations and empty quote
      // lines. A line background stays continuous through wrapping and selection.
      for (let number = Math.max(line.number, state.doc.lineAt(visible.from).number);
        number <= state.doc.lineAt(Math.min(to, visible.to)).number; number++) {
        const start = state.doc.line(number).from;
        quoteLines.set(start, Math.max(depth, quoteLines.get(start) ?? 0));
      }
    }
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
      if (selected(state, from, to)) {
        if (name === "InlineCode") ranges.push(Decoration.mark({ class: "cm-preview-code" }).range(from, to));
        return false;
      }
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
    if (name === "ListMark" && controls) {
      // Recognize task syntax only directly after a parsed list marker. This also
      // covers parent tasks interrupted by the hard-tab list dialect's parser.
      const task = /^[ \t]+(\[[ xX]\])(?=[ \t]|$)/.exec(state.sliceDoc(to, line.to));
      if (task) {
        const markerFrom = to + task[0].length - 3;
        const markerTo = markerFrom + 3;
        if (!selected(state, markerFrom, markerTo)) {
          ranges.push(Decoration.replace({ widget: new TaskCheckbox(markerFrom, task[1]!,
            state.readOnly || !state.facet(EditorView.editable), state.sliceDoc(markerTo, line.to).trim() || controls.label, controls) }).range(markerFrom, markerTo));
          if (/^[-+*]$/.test(state.sliceDoc(from, to))) hide(from, markerFrom);
        }
        return;
      }
    }
    if (["HeaderMark", "QuoteMark", "ListMark"].includes(name) && !selected(state, line.from, line.to)) {
      const end = state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
      if (name === "ListMark") {
        // Without a component renderer, retain editable task source.
        if (/^\s*\[[ xX]\]/.test(state.sliceDoc(to, line.to))) return;
        const text = state.sliceDoc(from, to);
        if (/^[-+*]$/.test(text)) ranges.push(Decoration.replace({ widget: new Marker("• ", "bullet") }).range(from, end));
      } else hide(from, end);
    }
    if (name === "HorizontalRule" && !selected(state, line.from, line.to)) {
      ranges.push(Decoration.replace({ widget: new Marker("", "rule") }).range(from, to));
      return false;
    }
  } });
  for (const [from, depth] of quoteLines) {
    const bars = Array.from({ length: depth }, () => "linear-gradient(color-mix(in srgb, currentColor 35%, transparent), color-mix(in srgb, currentColor 35%, transparent))").join(",");
    const positions = Array.from({ length: depth }, (_, index) => `calc(clamp(12px, 3cqi, 40px) + 0.35em + ${index * 0.85}em) 0`).join(",");
    ranges.push(Decoration.line({ class: "cm-preview-quote", attributes: {
      style: `--cm-preview-quote-depth:${depth};background-image:${bars};background-position:${positions}`,
    } }).range(from));
  }
  return Decoration.set(ranges, true);
}

/** Rebuild on parser progress too: large documents may parse asynchronously. */
export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.startState.readOnly !== update.state.readOnly || update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
      || update.startState.facet(taskControls) !== update.state.facet(taskControls))
      this.decorations = decorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });

export const livePreviewTheme = EditorView.baseTheme({
  ".cm-preview-strong": { fontWeight: "600" },
  ".cm-preview-emphasis": { fontStyle: "italic" },
  ".cm-preview-strike": { textDecoration: "line-through" },
  ".cm-preview-code, .cm-preview-code-block": { fontFamily: "var(--vault-mono, 'Cascadia Code', Consolas, ui-monospace, monospace)", backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)" },
  ".cm-preview-code": { fontSize: "0.95em", fontWeight: "500", padding: "0.05em 0.3em", border: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderRadius: "0.3em", backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" },
  ".cm-preview-heading": { fontWeight: "600", lineHeight: "1.4" },
  ".cm-preview-h1": { fontSize: "2.4em" }, ".cm-preview-h2": { fontSize: "2em" },
  ".cm-preview-h3": { fontSize: "1.7em" }, ".cm-preview-h4": { fontSize: "1.45em" },
  ".cm-preview-h5": { fontSize: "1.25em" }, ".cm-preview-h6": { fontSize: "1.1em" },
  ".cm-preview-link": { textDecoration: "underline" },
  ".cm-preview-bullet": { whiteSpace: "pre" },
  ".cm-preview-task": { display: "inline-flex", verticalAlign: "middle", lineHeight: "1" },
  ".cm-line.cm-preview-quote": { paddingLeft: "calc(clamp(12px, 3cqi, 40px) + 0.6em + var(--cm-preview-quote-depth) * 0.85em)", backgroundSize: "2px 100%", backgroundRepeat: "no-repeat" },
  ".cm-preview-rule": { display: "inline-block", width: "100%", borderTop: "1px solid currentColor", opacity: "0.25", verticalAlign: "middle" },
});
