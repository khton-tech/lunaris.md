import { Facet, StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { readHeader } from "./markdown.js";
import type { CalloutType } from "./markdown.js";

export interface Presentation {
  available: boolean;
  title(type: CalloutType): string;
  toggleLabel: string;
  editLabel: string;
  active(): boolean;
  mount(target: HTMLElement, props: ComponentProps): MountedComponent | null;
  toggled(collapsed: boolean): void;
}
export const presentation = Facet.define<Presentation, Presentation | null>({ combine: values => values[0] ?? null });
export const toggleCallout = StateEffect.define<{ from: number; collapsed: boolean }>({ map: (value, changes) => ({ ...value, from: changes.mapPos(value.from, 1) }) });
const mounts = new WeakMap<HTMLElement, MountedComponent>();
class Header extends WidgetType {
  constructor(readonly from: number, readonly source: string, readonly type: CalloutType, readonly title: string, readonly foldable: boolean, readonly collapsed: boolean, readonly controls: Presentation) { super(); }
  override eq(other: Header) { return this.from === other.from && this.source === other.source && this.type === other.type && this.title === other.title && this.foldable === other.foldable && this.collapsed === other.collapsed && this.controls === other.controls; }
  private props(view: EditorView, dom: HTMLElement): ComponentProps {
    const act = (toggle: boolean) => {
      const state = view.state;
      // Leave the renderer event stack before CodeMirror changes widget roots.
      void Promise.resolve().then(() => {
        if (!this.controls.active() || !mounts.has(dom) || view.state !== state || state.sliceDoc(this.from, this.from + this.source.length) !== this.source) return;
        if (toggle) { view.dispatch({ effects: toggleCallout.of({ from: this.from, collapsed: !this.collapsed }) }); this.controls.toggled(!this.collapsed); }
        else { view.dispatch({ selection: { anchor: this.from + this.source.length }, scrollIntoView: true }); view.focus(); }
      });
    };
    return { title: this.title, kind: this.type, foldable: this.foldable, collapsed: this.collapsed,
      toggleLabel: this.controls.toggleLabel, editLabel: this.controls.editLabel, onToggle: () => act(true), onEdit: () => act(false), presentation: { mode: "embedded", sizing: "content" } };
  }
  toDOM(view: EditorView) {
    const dom = view.dom.ownerDocument.createElement("span"); dom.contentEditable = "false";
    const mounted = this.controls.mount(dom, this.props(view, dom));
    if (mounted) mounts.set(dom, mounted); else dom.textContent = this.source;
    return dom;
  }
  override updateDOM(dom: HTMLElement, view: EditorView) {
    const mounted = mounts.get(dom);
    return this.controls.active() && mounted ? mounted.update(this.props(view, dom)).ok : false;
  }
  override destroy(dom: HTMLElement) { if (this.controls.active()) mounts.get(dom)?.dispose(); mounts.delete(dom); }
  override ignoreEvent() { return true; }
}
interface Fold { collapsed: boolean; source: string }
interface Preview { folds: Map<number, Fold>; decorations: DecorationSet }
const selected = (state: EditorState, from: number, to: number) => state.selection.ranges.some(range => range.from <= to && range.to >= from);
function build(state: EditorState, folds: Map<number, Fold>): DecorationSet {
  const controls = state.facet(presentation);
  if (!controls) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  const lines = new Map<number, { depth: number; kind: CalloutType; header: boolean }>();
  const hidden: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({ enter(ref) {
    if (["FencedCode", "CodeBlock", "HTMLBlock"].includes(ref.name)) return false;
    if (ref.name !== "Callout") return;
    const node = ref.node, header = node.getChild("CalloutHeader");
    if (!header) return;
    const source = state.sliceDoc(header.from, header.to), parsed = readHeader(source);
    if (!parsed) return;
    let depth = 1;
    for (let parent = node.parent; parent; parent = parent.parent) if (parent.name === "Callout") depth++;
    const first = state.doc.lineAt(header.from), last = state.doc.lineAt(node.to);
    const saved = folds.get(header.from);
    const collapsed = controls.available && !!parsed.fold && (saved?.source === source ? saved.collapsed : parsed.fold === "-") && !selected(state, first.to + 1, node.to);
    for (let number = first.number; number <= (collapsed ? first.number : last.number); number++) {
      const line = state.doc.line(number);
      if ((lines.get(line.from)?.depth ?? 0) <= depth) lines.set(line.from, { depth, kind: parsed.type, header: number === first.number });
    }
    if (controls.available && !selected(state, first.from, first.to)) ranges.push(Decoration.replace({ widget: new Header(header.from, source, parsed.type, parsed.title || controls.title(parsed.type), !!parsed.fold, collapsed, controls) }).range(header.from, header.to));
    if (collapsed && node.to > first.to) { ranges.push(Decoration.replace({ block: true }).range(first.to, node.to)); hidden.push({from:first.to,to:node.to}); }
    if (collapsed) return false;
  } });
  // Composite markers belong to this plugin, leaving ordinary quotes untouched.
  syntaxTree(state).iterate({ enter(ref) {
    if (hidden.some(range => ref.from > range.from && ref.to <= range.to)) return false;
    if (ref.name !== "CalloutMark") return;
    const line = state.doc.lineAt(ref.from);
    if (!selected(state, line.from, line.to)) ranges.push(Decoration.replace({}).range(ref.from, Math.min(ref.to + (state.sliceDoc(ref.to, ref.to + 1) === " " ? 1 : 0), line.to)));
  } });
  for (const [from, info] of lines) ranges.push(Decoration.line({ class: "cm-callout" + (info.header ? " cm-callout-header" : ""), attributes: { "data-callout": info.kind, style: `--callout-depth:${info.depth}` } }).range(from));
  return Decoration.set(ranges, true);
}
export const calloutPreview = StateField.define<Preview>({
  create(state) { const folds = new Map<number, Fold>(); return { folds, decorations: build(state, folds) }; },
  update(value, transaction) {
    const folds = new Map<number, Fold>();
    for (const [from, fold] of value.folds) {
      const mapped = transaction.changes.mapPos(from, 1), line = transaction.state.doc.lineAt(mapped);
      if (transaction.state.sliceDoc(mapped, line.to) === fold.source) folds.set(mapped, fold);
    }
    for (const effect of transaction.effects) if (effect.is(toggleCallout)) {
      const line = transaction.state.doc.lineAt(effect.value.from);
      const source = transaction.state.sliceDoc(effect.value.from, line.to);
      if (readHeader(source)) folds.set(effect.value.from, { collapsed: effect.value.collapsed, source });
    }
    return { folds, decorations: build(transaction.state, folds) };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
export function calloutTheme(colors: Readonly<Record<string, unknown>> = {}) {
  const color = (key: string, fallback: string) => typeof colors[key] === "string" ? colors[key] as string : fallback;
  return EditorView.baseTheme({
    ".cm-line.cm-callout": { "--callout-color": color("accent", "currentColor"), backgroundColor: "color-mix(in srgb, var(--callout-color) 8%, transparent)", borderInlineStart: "2px solid var(--callout-color)", paddingInlineStart: "calc(clamp(12px, 3cqi, 40px) + var(--callout-depth) * 0.65em)", backgroundImage: "none !important" },
    '.cm-callout[data-callout="warning"]': { "--callout-color": color("warning", color("colorfulError", color("accent", "currentColor"))) },
    '.cm-callout[data-callout="danger"], .cm-callout[data-callout="failure"], .cm-callout[data-callout="bug"]': { "--callout-color": color("error", "currentColor") },
    '.cm-callout[data-callout="success"]': { "--callout-color": color("success", color("accent", "currentColor")) },
    ".cm-callout-header": { fontWeight: "600" },
  });
}
