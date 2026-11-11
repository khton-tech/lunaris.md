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
  const fences = new Set<number>();
  const listLines = new Set<number>();
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
        const last = state.doc.lineAt(to);
        const marks = node.node.getChildren("CodeMark");
        const info = node.node.getChild("CodeInfo");
        // Keep source positions and line breaks intact: only inactive fence text
        // is hidden. Selecting either fence exposes it for normal editing.
        if (name === "FencedCode") {
          for (const mark of marks) {
            if (mark.from < visible.from || mark.from > visible.to || fences.has(mark.from)) continue;
            fences.add(mark.from);
            const fence = state.doc.lineAt(mark.from);
            if (selected(state, fence.from, fence.to)) continue;
            if (mark === marks[0] && info) {
              const language = /^\S+/.exec(state.sliceDoc(info.from, info.to));
              if (language) {
                hide(mark.from, info.from);
                ranges.push(Decoration.mark({ class: "cm-preview-code-language" }).range(info.from, info.from + language[0].length));
                hide(info.from + language[0].length, fence.to);
                continue;
              }
            }
            hide(mark.from, fence.to);
          }
        }
        for (let number = Math.max(line.number, state.doc.lineAt(visible.from).number);
          number <= state.doc.lineAt(Math.min(to, visible.to)).number; number++) {
          const start = state.doc.line(number).from;
          if (start >= visible.from && start <= visible.to && !lines.has(start)) {
            const classes = ["cm-preview-code-block"];
            if (number === line.number) classes.push("cm-preview-code-start");
            if (number === last.number) classes.push("cm-preview-code-end");
            lines.add(start); ranges.push(Decoration.line({ class: classes.join(" ") }).range(start));
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
    if (name === "ListMark" && !listLines.has(line.from)) {
      listLines.add(line.from);
      ranges.push(Decoration.line({ class: "cm-preview-list-line" }).range(line.from));
    }
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
    if (["HeaderMark", "QuoteMark", "ListMark"].includes(name) &&
      ((name === "HeaderMark" && !view.hasFocus) || !selected(state, line.from, line.to))) {
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
    const positions = Array.from({ length: depth }, (_, index) => `${index * 0.85}em 0`).join(",");
    ranges.push(Decoration.line({ class: "cm-preview-quote", attributes: {
      style: `--cm-preview-quote-depth:${depth};background-image:${bars};background-position:${positions}`,
    } }).range(from));
  }
  return Decoration.set(ranges, true);
}

/** Rebuild on parser progress too: large documents may parse asynchronously. */
export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none;
  outerDecorations: DecorationSet = Decoration.none;
  constructor(view: EditorView) { this.refresh(view); }
  refresh(view: EditorView): void {
    const all = decorations(view);
    // Keep the code surface outside animated letter marks so its border never splits.
    this.outerDecorations = all.update({ filter: (_from, _to, decoration) => decoration.spec.class === "cm-preview-code" });
    this.decorations = all.update({ filter: (_from, _to, decoration) => decoration.spec.class !== "cm-preview-code" });
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.startState.readOnly !== update.state.readOnly || update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
      || update.startState.facet(taskControls) !== update.state.facet(taskControls))
      this.refresh(update.view);
  }
}, {
  decorations: plugin => plugin.decorations,
  provide: plugin => EditorView.outerDecorations.of(view => view.plugin(plugin)?.outerDecorations ?? Decoration.none),
});

export const livePreviewTheme = EditorView.baseTheme({
  ".cm-preview-strong": { fontWeight: "700", fontSynthesis: "weight" },
  ".cm-preview-emphasis": { fontStyle: "italic" },
  ".cm-preview-strike": { textDecoration: "line-through" },
  ".cm-preview-code, .cm-preview-code-block": { fontFamily: "var(--vault-mono, 'Cascadia Code', Consolas, ui-monospace, monospace)", backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)" },
  ".cm-preview-code": { fontSize: "0.867em", fontWeight: "500", padding: "0.12em 0.55em", color: "var(--vault-accent, currentColor)", borderRadius: "var(--vault-radius-small, 4px)", backgroundColor: "var(--vault-selection, transparent)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" },
  ".cm-line.cm-preview-code-block": { fontSize: "0.867em", lineHeight: "1.45", padding: "0 calc(var(--editor-block-inset, 2.4em) - 1px)", borderLeft: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderRight: "1px solid color-mix(in srgb, currentColor 25%, transparent)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  ".cm-line.cm-preview-code-start": { borderTop: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderTopLeftRadius: "var(--vault-radius, 10px)", borderTopRightRadius: "var(--vault-radius, 10px)", paddingTop: "0.45em" },
  ".cm-line.cm-preview-code-end": { borderBottom: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderBottomLeftRadius: "var(--vault-radius, 10px)", borderBottomRightRadius: "var(--vault-radius, 10px)", paddingBottom: "0.45em" },
  ".cm-preview-code-language": { fontSize: "0.92em", fontWeight: "500" },
  ".cm-preview-heading": { fontWeight: "600", lineHeight: "1.25" },
  ".cm-preview-list-line": { paddingBlock: "0.14em" },
  ".cm-preview-h1": {
    fontSize: "var(--editor-h1-size, 2.267em)", fontWeight: "var(--editor-h1-weight, 600)",
    lineHeight: "var(--editor-h1-line-height, 1.206)", maxInlineSize: "17em", paddingBlockEnd: "0.22em",
  },
  ".cm-preview-h2": { fontSize: "1.533em", paddingBlock: "0.12em" },
  ".cm-preview-h3": { fontSize: "1.4em" }, ".cm-preview-h4": { fontSize: "1.3em" },
  ".cm-preview-h5": { fontSize: "1.25em" }, ".cm-preview-h6": { fontSize: "1.1em" },
  ".cm-preview-link": { textDecoration: "underline" },
  ".cm-preview-bullet": { display: "inline-block", minInlineSize: "1.4em", color: "var(--vault-accent, currentColor)", whiteSpace: "pre" },
  ".cm-preview-task": { display: "inline-flex", verticalAlign: "middle", lineHeight: "1" },
  ".cm-line.cm-preview-quote": { paddingLeft: "calc(var(--editor-block-inset, 2.4em) + (var(--cm-preview-quote-depth) - 1) * 0.85em)", backgroundSize: "2px 100%", backgroundRepeat: "no-repeat" },
  ".cm-preview-rule": { display: "inline-block", width: "100%", borderTop: "1px solid currentColor", opacity: "0.25", verticalAlign: "middle" },
});
