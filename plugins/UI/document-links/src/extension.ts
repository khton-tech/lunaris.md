import { Prec } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { NoteLink } from "@lunaris/backlinks";

export function linkInteraction(parse: (text: string) => readonly NoteLink[], open: (link: NoteLink, text: string) => void, alive: () => boolean) {
  const links = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    values: readonly NoteLink[] = [];
    constructor(view: EditorView) { this.decorations = this.build(view); }
    build(view: EditorView): DecorationSet {
      // CodeMirror positions count normalized line breaks, while source snapshots
      // retain the file's CRLF convention for guarded document operations.
      this.values = alive() ? parse(view.state.doc.toString()) : [];
      return Decoration.set(this.values.filter(link => link.from < link.to).map(link => Decoration.mark({
        class: "cm-document-link", attributes: { "data-note-link": String(link.from), role: "link", tabindex: "0", title: link.destination },
      }).range(link.from, link.to)), true);
    }
    update(update: ViewUpdate) { if (update.docChanged) this.decorations = this.build(update.view); }
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
    ".cm-document-link:focus-visible": { outline: "1px solid var(--vault-focus, currentColor)", outlineOffset: "2px" },
  })];
}
