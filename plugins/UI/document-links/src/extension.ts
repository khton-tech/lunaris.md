import { Facet, Prec, StateEffect } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { NoteLink } from "@lunaris/backlinks";

const preview = Facet.define<boolean, boolean>({ combine: values => values.includes(true) });
export const wikiPreview = preview.of(true);

export function linkInteraction(
  parse: (text: string) => readonly NoteLink[],
  open: (link: NoteLink, text: string) => void,
  alive: () => boolean,
  missingTargets: (links: readonly NoteLink[]) => readonly number[],
  subscribe: (refresh: () => void) => () => void,
) {
  const refreshStyle = StateEffect.define<null>();
  const links = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    values: readonly NoteLink[] = [];
    private missing = new Set<number>();
    private readonly unsubscribe: () => void;
    constructor(view: EditorView) {
      this.readLinks(view);
      this.decorations = this.build(view);
      this.unsubscribe = subscribe(() => {
        const next = new Set(missingTargets(this.values));
        if (next.size === this.missing.size && [...next].every(offset => this.missing.has(offset))) return;
        this.missing = next;
        view.dispatch({ effects: refreshStyle.of(null) });
      });
    }
    readLinks(view: EditorView): void {
      // CodeMirror positions count normalized line breaks, while source snapshots
      // retain the file's CRLF convention for guarded document operations.
      this.values = alive() ? parse(view.state.doc.toString()) : [];
      this.missing = new Set(missingTargets(this.values));
    }
    build(view: EditorView): DecorationSet {
      const ranges: Range<Decoration>[] = [];
      for (const link of this.values) {
        if (link.from >= link.to) continue;
        const editing = view.hasFocus && view.state.selection.ranges.some(range => range.from <= link.to && range.to >= link.from);
        const label = view.state.facet(preview) && !editing ? link.label : undefined;
        if (label) {
          ranges.push(Decoration.replace({}).range(link.from, label.from));
          ranges.push(Decoration.replace({}).range(label.to, link.to));
        }
        ranges.push(Decoration.mark({
          class: this.missing.has(link.from) ? "cm-document-link cm-document-link-missing" : "cm-document-link",
          attributes: { "data-note-link": String(link.from), role: "link", tabindex: "0", title: link.destination },
        }).range(label?.from ?? link.from, label?.to ?? link.to));
      }
      return Decoration.set(ranges, true);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.readLinks(update.view);
      if (update.docChanged || update.selectionSet || update.focusChanged || update.startState.facet(preview) !== update.state.facet(preview)
        || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshStyle)))) {
        this.decorations = this.build(update.view);
      }
    }
    destroy() { this.unsubscribe(); }
  }, { decorations: value => value.decorations });
  const hit = (event: Event, view: EditorView) => {
    const target = event.target as HTMLElement | null; const marker = target?.closest?.("[data-note-link]");
    if (!marker || !view.dom.contains(marker)) return undefined;
    return view.plugin(links)?.values.find(link => String(link.from) === marker.getAttribute("data-note-link"));
  };
  return [links, Prec.highest(EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || event.altKey || event.shiftKey || !alive() || !hit(event, view)) return false;
      event.preventDefault(); return true;
    },
    click(event, view) {
      if (event.button !== 0 || event.altKey || event.shiftKey || !alive()) return false;
      const link = hit(event, view); if (!link) return false;
      event.preventDefault(); open(link, view.state.sliceDoc()); return true;
    },
    keydown(event, view) {
      if (event.key !== "Enter" || event.altKey || event.shiftKey || !alive()) return false;
      const link = hit(event, view) ?? ((event.ctrlKey || event.metaKey) ? view.plugin(links)?.values.find(link => link.from <= view.state.selection.main.head && link.to >= view.state.selection.main.head) : undefined);
      if (!link) return false;
      event.preventDefault(); open(link, view.state.sliceDoc()); return true;
    },
  })), EditorView.baseTheme({
    ".cm-document-link": { cursor: "pointer", color: "var(--vault-accent, currentColor)", textDecoration: "underline" },
    ".cm-document-link.cm-document-link-missing": { textDecorationStyle: "dashed" },
    // Markdown syntax highlighting can wrap the visible label in another span.
    ".cm-document-link.cm-document-link-missing, .cm-document-link.cm-document-link-missing span": {
      color: "var(--vault-secondary, currentColor)",
    },
    ".cm-document-link:focus-visible": { outline: "1px solid var(--vault-focus, currentColor)", outlineOffset: "2px" },
  })];
}
