import type { EditorExtension } from "@lunaris/editor";
import { markupCommand } from "./formatting.js";
import { bindEditorMenu } from "./editor-menu.js";
import type { EditorMenuOptions } from "./editor-menu.js";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import type { Extension, StateCommand, StateEffect as Effect } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess, insertTab } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, indentUnit, syntaxTree } from "@codemirror/language";
import { Strikethrough } from "@lezer/markdown";
import { taskControls } from "./task-checkbox.js";
import type { TaskControls } from "./task-checkbox.js";
import { livePreview, livePreviewTheme } from "./live-preview.js";
import { noSetextHeadings, tabIndentedLists } from "./markdown.js";
import { continueTabIndentedList } from "./markdown-commands.js";
import { pairedInput } from "./paired-input.js";
import { typingAnimation } from "./typing-animation.js";
import { tags } from "@lezer/highlight";
import type { ThemeDefinition } from "@lunaris/themes";
import type { DocumentSession } from "./session.js";
import { defaults } from "./preferences.js";
import type { Preferences } from "./preferences.js";
import type { createDeletionEffects } from "./deletion-effects.js";

/** Lists change indentation at the line start, regardless of caret position. */
const insertIndent: StateCommand = target => {
  const { state } = target;
  if (state.readOnly) return false;
  const contexts = state.selection.ranges.map(range => {
    const cursor = syntaxTree(state).resolveInner(range.empty ? range.head : range.from, range.empty ? -1 : 1).cursor();
    do {
      if (["FencedCode", "CodeBlock"].includes(cursor.name)) return null;
      if (cursor.name === "ListItem") return cursor.node;
    } while (cursor.parent());
    return null;
  });
  if (!contexts.some(Boolean)) return insertTab(target);
  return indentMore(target);
};

function appearance(theme: ThemeDefinition | null, preferences: Preferences) {
  const properties = theme?.properties;
  const colors = properties?.colors as Record<string, unknown> | undefined;
  const typography = properties?.typography as Record<string, unknown> | undefined;
  const color = (key: string, fallback = "currentColor") => typeof colors?.[key] === "string" ? colors[key] as string : fallback;
  const fontSize = preferences.fontSize !== "theme" ? `${preferences.fontSize}px` : typeof typography?.fontSize === "number" ? `${typography.fontSize}${typeof typography.fontSizeUnit === "string" ? typography.fontSizeUnit : "px"}` : "14px";
  return [EditorView.theme({
    "&": { height: "var(--editor-view-height, 100%)", minHeight: "0", flex: "1 1 0%", minWidth: "0", backgroundColor: "transparent", color: color("text"), fontSize },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { height: "var(--editor-view-height, 100%)", flex: "var(--editor-scroller-flex, 0 1 auto)",
      overflow: "var(--editor-view-overflow, auto)", fontFamily: "inherit", lineHeight: preferences.lineHeight !== "theme" ? preferences.lineHeight : String(typeof typography?.lineHeight === "number" ? typography.lineHeight : 1.6), scrollbarWidth: "none" },
    ".cm-scroller::-webkit-scrollbar": { display: "none" },
    ".cm-content": { width: "calc(100% - 2 * var(--editor-gutter, 12px))", maxWidth: preferences.wrapLines && preferences.textWidth !== "full" ? `${preferences.textWidth}px` : "none", minWidth: "0", flexGrow: "0", margin: "0 auto",
      padding: "var(--editor-padding-start, clamp(18px, 2cqi, 24px)) 0 var(--editor-padding-end, clamp(12px, 3cqi, 32px))", caretColor: color("caret"), minHeight: "100%" },
    ".cm-line": { padding: "0" },
    ".cm-preview-code-language": { color: color("accent", color("textSecondary", color("text"))) },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: color("caret") },
    // Match the focused layer's specificity so CM's default dark teal cannot win.
    "&.cm-editor .cm-selectionBackground, &.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: color("selection", `color-mix(in srgb, ${color("text")} 25%, transparent)`) },
  }, { dark: properties?.appearance !== "light" }), syntaxHighlighting(HighlightStyle.define([
    { tag: tags.heading, color: color("text"), fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" }, { tag: tags.strong, fontWeight: "700", fontSynthesis: "weight" },
    { tag: tags.link, color: color("link", color("accent", color("text"))), textDecoration: "underline" },
    { tag: [tags.processingInstruction, tags.meta, tags.comment], color: color("textSecondary") },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]))];
}

/** Reusable view adapter; cached states belong to the controller, not DOM roots. */
export function mountEditor(target: HTMLElement, session: DocumentSession, cached: EditorState | undefined,
  theme: ThemeDefinition | null, label: string, save: () => void, failed: (error: unknown) => void, preview = true, tasks?: TaskControls, menuOptions?: EditorMenuOptions, preferences: Preferences = defaults, contributions: readonly EditorExtension[] = [], deletionEffects?: ReturnType<typeof createDeletionEffects>) {
  let menu: ReturnType<typeof bindEditorMenu> | undefined;
  const mode = new Compartment();
  const contributed = new Compartment(); const language = new Compartment();
  const languageFor = (items: readonly EditorExtension[]) => markdown({ addKeymap: false, extensions: [Strikethrough, tabIndentedLists, ...items.flatMap(item => item.markdown ? [item.markdown] : []), noSetextHeadings] });
  const wrapping = new Compartment();
  const skin = new Compartment(); const access = new Compartment(); const attributes = new Compartment();
  // A cached state retains history/selection; replace view-specific compartments
  // and callbacks through a full reconfiguration without replacing the document.
  const extensions = [EditorState.lineSeparator.of(session.text.includes("\r\n") ? "\r\n" : "\n"), indentUnit.of("\t"), EditorState.tabSize.of(4), history(), language.of(languageFor(contributions)), contributed.of(contributions.map(item => item.extension ?? [])), tasks ? taskControls.of(tasks) : [], mode.of(preview ? [livePreview, livePreviewTheme] : []), wrapping.of(preferences.wrapLines ? EditorView.lineWrapping : []), drawSelection(),
    EditorView.exceptionSink.of(failed),
    pairedInput,
    typingAnimation,
    keymap.of([{ key: "Mod-b", run: markupCommand("bold"), preventDefault: true }, { key: "Mod-i", run: markupCommand("italic"), preventDefault: true }, { key: "Mod-k", run: target => markupCommand("link", menuOptions?.text("linkText"))(target), preventDefault: true }, { key: "Mod-s", run: () => { save(); return true; }, preventDefault: true }, { key: "Tab", run: insertIndent, shift: indentLess, preventDefault: true }, { key: "Enter", run: continueTabIndentedList }, ...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of(update => { if (update.docChanged || update.selectionSet || update.startState.readOnly !== update.state.readOnly) menu?.close(); if (update.docChanged) session.edit(update.state.sliceDoc()); }),
    skin.of(appearance(theme, preferences)), access.of([EditorState.readOnly.of(session.locks > 0 || session.missing || session.loading || session.recoveryCandidates.length > 0), EditorView.editable.of(!session.locks && !session.missing && !session.loading && !session.recoveryCandidates.length)]),
    attributes.of(EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" })),
  ];
  let state = cached && cached.sliceDoc() === session.text ? cached : undefined;
  // StateEffect.reconfigure replaces extensions while preserving compatible fields.
  if (!state) state = EditorState.create({ doc: session.text, extensions });
  else state = state.update({ effects: reconfigure(extensions) }).state;
  const effects = deletionEffects?.mount();
  const view = new EditorView({ parent: target, state, ...(effects ? { dispatchTransactions: effects.dispatch } : {}) });
  if (menuOptions) menu = bindEditorMenu(view, menuOptions);
  let lastContributions = contributions;
  let lastPreview = preview;
  let lastPreferences = preferences;
  let lastTheme = theme; let lastLabel = label; let lastReadOnly = session.locks > 0 || session.missing || session.loading || session.recoveryCandidates.length > 0;
  return {
    view,
    update(nextTheme: ThemeDefinition | null, nextLabel: string, nextPreview = true, nextPreferences: Preferences = defaults, nextContributions: readonly EditorExtension[] = lastContributions) {
      const effects: Effect<unknown>[] = [];
      if (nextContributions !== lastContributions) { effects.push(language.reconfigure(languageFor(nextContributions)), contributed.reconfigure(nextContributions.map(item => item.extension ?? []))); lastContributions = nextContributions; }
      if (nextPreview !== lastPreview) { effects.push(mode.reconfigure(nextPreview ? [livePreview, livePreviewTheme] : [])); lastPreview = nextPreview; }
      const readOnly = session.locks > 0 || session.missing || session.loading || session.recoveryCandidates.length > 0;
      if (nextPreferences.wrapLines !== lastPreferences.wrapLines) effects.push(wrapping.reconfigure(nextPreferences.wrapLines ? EditorView.lineWrapping : []));
      if (nextTheme !== lastTheme || nextPreferences !== lastPreferences) { effects.push(skin.reconfigure(appearance(nextTheme, nextPreferences))); lastTheme = nextTheme; lastPreferences = nextPreferences; }
      if (readOnly !== lastReadOnly) {
        effects.push(access.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])); lastReadOnly = readOnly;
      }
      if (nextLabel !== lastLabel) {
        effects.push(attributes.reconfigure(EditorView.contentAttributes.of({ "aria-label": nextLabel, spellcheck: "false" }))); lastLabel = nextLabel;
      }
      if (effects.length) view.dispatch({ effects });
    },
    dispose(): EditorState { const state = view.state; menu?.dispose(); effects?.dispose(); view.destroy(); return state; },
  };
}

const reconfigure = (extensions: Extension) => StateEffect.reconfigure.of(extensions);
