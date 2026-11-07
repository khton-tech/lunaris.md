import { Compartment, EditorSelection, EditorState, StateEffect, countColumn } from "@codemirror/state";
import type { Extension, StateCommand, StateEffect as Effect } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { Strikethrough } from "@lezer/markdown";
import { livePreview, livePreviewTheme } from "./live-preview.js";
import { tags } from "@lezer/highlight";
import type { ThemeDefinition } from "@lunaris/themes";
import type { DocumentSession } from "./session.js";

/** Use explicit spaces so the inserted indentation has ordinary text geometry. */
const insertIndent: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some(range => !range.empty)) return indentMore({ state, dispatch });
  const changes = state.changeByRange(range => {
    const line = state.doc.lineAt(range.head);
    const column = countColumn(state.sliceDoc(line.from, range.head), state.tabSize);
    const text = " ".repeat(state.tabSize - column % state.tabSize);
    return { changes: { from: range.head, insert: text }, range: EditorSelection.cursor(range.head + text.length) };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input.indent" }));
  return true;
};

function appearance(theme: ThemeDefinition | null) {
  const properties = theme?.properties;
  const colors = properties?.colors as Record<string, unknown> | undefined;
  const typography = properties?.typography as Record<string, unknown> | undefined;
  const color = (key: string, fallback = "currentColor") => typeof colors?.[key] === "string" ? colors[key] as string : fallback;
  const fontSize = typeof typography?.fontSize === "number" ? `${typography.fontSize}${typeof typography.fontSizeUnit === "string" ? typography.fontSizeUnit : "px"}` : "14px";
  return [EditorView.theme({
    "&": { height: "100%", minHeight: "0", flex: "1 1 0%", minWidth: "0", backgroundColor: "transparent", color: color("text"), fontSize },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "var(--vault-mono, ui-monospace, monospace)", lineHeight: String(typeof typography?.lineHeight === "number" ? typography.lineHeight : 1.6), scrollbarWidth: "none" },
    ".cm-scroller::-webkit-scrollbar": { display: "none" },
    ".cm-content": { width: "100%", maxWidth: "780px", minWidth: "0", flexGrow: "0", margin: "0 auto", padding: "clamp(24px, 5cqi, 56px) 0 clamp(12px, 3cqi, 32px)", caretColor: color("caret"), minHeight: "100%" },
    ".cm-line": { padding: "0 clamp(12px, 3cqi, 40px)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: color("caret") },
    // Match the focused layer's specificity so CM's default dark teal cannot win.
    "&.cm-editor .cm-selectionBackground, &.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: color("selection", `color-mix(in srgb, ${color("text")} 25%, transparent)`) },
  }, { dark: properties?.appearance !== "light" }), syntaxHighlighting(HighlightStyle.define([
    { tag: tags.heading, color: color("text"), fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" }, { tag: tags.strong, fontWeight: "600" },
    { tag: tags.link, color: color("accent", color("text")), textDecoration: "underline" },
    { tag: [tags.processingInstruction, tags.meta, tags.comment], color: color("textSecondary") },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]))];
}

/** Reusable view adapter; cached states belong to the controller, not DOM roots. */
export function mountEditor(target: HTMLElement, session: DocumentSession, cached: EditorState | undefined,
  theme: ThemeDefinition | null, label: string, save: () => void, failed: (error: unknown) => void, preview = true,
  traceTab: (data: Readonly<Record<string, unknown>>) => void = () => {}) {
  const mode = new Compartment();
  const skin = new Compartment(); const access = new Compartment(); const attributes = new Compartment();
  let pendingTab: { commandRan: boolean } | undefined;
  const tabCommand = (view: EditorView, backwards = false) => {
    if (pendingTab) pendingTab.commandRan = true;
    return backwards ? indentLess(view) : insertIndent(view);
  };
  // A cached state retains history/selection; replace view-specific compartments
  // and callbacks through a full reconfiguration without replacing the document.
  const extensions = [EditorState.lineSeparator.of(session.text.includes("\r\n") ? "\r\n" : "\n"), indentUnit.of("    "), EditorState.tabSize.of(4), history(), markdown({ extensions: [Strikethrough] }), mode.of(preview ? [livePreview, livePreviewTheme] : []), EditorView.lineWrapping, drawSelection(),
    EditorView.exceptionSink.of(failed),
    keymap.of([{ key: "Mod-s", run: () => { save(); return true; }, preventDefault: true }, { key: "Tab", run: view => tabCommand(view), shift: view => tabCommand(view, true), preventDefault: true }, ...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of(update => { if (update.docChanged) session.edit(update.state.sliceDoc()); }),
    skin.of(appearance(theme)), access.of([EditorState.readOnly.of(session.locks > 0 || session.missing || session.loading), EditorView.editable.of(!session.locks && !session.missing && !session.loading)]),
    attributes.of(EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "true" })),
  ];
  let state = cached && cached.sliceDoc() === session.text ? cached : undefined;
  // StateEffect.reconfigure replaces extensions while preserving compatible fields.
  if (!state) state = EditorState.create({ doc: session.text, extensions });
  else state = state.update({ effects: reconfigure(extensions) }).state;
  const view = new EditorView({ parent: target, state });
  let disposed = false; let attempts = 0;
  // Bounded native-event tracing runs before CodeMirror's composition/focus-mode
  // gates. Never log note text, paths or arbitrary keyboard input.
  const observeTab = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || attempts >= 5) return;
    const attempt = ++attempts; const before = view.state;
    const outcome = { commandRan: false }; pendingTab = outcome;
    const details = { attempt, shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey,
      keyCode: event.keyCode, repeat: event.repeat, composing: event.isComposing, viewComposing: view.composing,
      focused: view.hasFocus, readOnly: before.readOnly, editable: before.facet(EditorView.editable),
      locks: session.locks, loading: session.loading, missing: session.missing };
    traceTab({ phase: "received", ...details });
    queueMicrotask(() => {
      if (disposed) return;
      traceTab({ phase: "settled", attempt, commandRan: outcome.commandRan, prevented: event.defaultPrevented,
        documentChanged: before.doc !== view.state.doc, lengthDelta: view.state.doc.length - before.doc.length,
        caretDelta: view.state.selection.main.head - before.selection.main.head, focused: view.hasFocus });
    });
  };
  view.contentDOM.addEventListener("keydown", observeTab, { capture: true });
  let lastPreview = preview;
  let lastTheme = theme; let lastLabel = label; let lastReadOnly = session.locks > 0 || session.missing || session.loading;
  return {
    view,
    update(nextTheme: ThemeDefinition | null, nextLabel: string, nextPreview = true) {
      const effects: Effect<unknown>[] = [];
      if (nextPreview !== lastPreview) { effects.push(mode.reconfigure(nextPreview ? [livePreview, livePreviewTheme] : [])); lastPreview = nextPreview; }
      const readOnly = session.locks > 0 || session.missing || session.loading;
      if (nextTheme !== lastTheme) { effects.push(skin.reconfigure(appearance(nextTheme))); lastTheme = nextTheme; }
      if (readOnly !== lastReadOnly) {
        effects.push(access.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])); lastReadOnly = readOnly;
      }
      if (nextLabel !== lastLabel) {
        effects.push(attributes.reconfigure(EditorView.contentAttributes.of({ "aria-label": nextLabel, spellcheck: "true" }))); lastLabel = nextLabel;
      }
      if (effects.length) view.dispatch({ effects });
    },
    dispose(): EditorState { disposed = true; view.contentDOM.removeEventListener("keydown", observeTab, { capture: true }); const state = view.state; view.destroy(); return state; },
  };
}

const reconfigure = (extensions: Extension) => StateEffect.reconfigure.of(extensions);
