# Text editor

CodeMirror 6 Markdown editor with Live Preview, integrated through public SDK contracts.
Plugin: `lunaris.text-editor`; package: `@lunaris/text-editor`. Tauri starts it
with ui.dom, vault.access and filesystem.access.

## Usage and saving

Open a Markdown file in File Explorer. Wrapped lines, Markdown syntax, standard
text shortcuts, undo/redo, multiple selections and Mod-S are enabled. Tab keeps
normal keyboard navigation. Live Preview is the default; the header mode button
toggles Source mode without replacing the document, selection or undo history.
The mode lasts for the plugin activation and applies across documents; it is not
persisted as a setting. No reading view, formatting toolbar, gutter or CodeMirror
search panel is included. Unsupported extensions never decode as editable text.

Autosave waits 2000 ms after the last edit. Mod-S and document/Vault/file
transitions flush immediately. Writes serialize per document using replace and
expectedVersion; autosave never recreates a removed file. A flush saves edits
made during an in-flight write before reporting the buffer clean. CRLF line
separators are preserved.

Conflicts and write failures retain text and stop background retries. Use Retry
save for recoverable failures. Reload from disk requires explicit Discard changes
and reload confirmation when dirty. Failed reloads preserve text. Confirmed
discard of a missing draft allows departure, keeping text visible until navigation.
No force-overwrite or merge is offered. Failed flushes select the editor to expose
recovery even when Settings was open.

Normal Tauri window closure closes Vault through a host SDK bridge before stopping
the kernel; failed saving prevents closure. Forced shutdown, host recovery, plugin
deactivation and crashes do not persist recovery drafts. Cleanup cancels timers
without SDK calls. Browser refresh is not a guarded desktop close.

## Integration contracts

No editor service API is provided. The following public contracts connect it:

| Contract | Purpose |
| --- | --- |
| ActiveDocument.current / ActiveDocumentTransitioned | Initial file and explicit transitions; repeated open returns from Settings |
| BeforeActiveDocumentChange | Flush before voluntary open/close |
| Vault.current / VaultChanged | Root identity and session lifetime |
| BeforeVaultRelease | Flush buffers while the old root remains writable |
| Filesystem.readText / writeText | Read and optimistic saves through existing drivers |
| BeforeFileMutation | Flush/lock before move/copy/remove; retarget on committed completion |
| FileChanged | Refresh clean buffers, retain dirty buffers and recognize deletion |
| ActiveScreen.register / select | Contribute the editor screen within Workspace |
| Components / ComponentsChanged | Controller host and replaceable Mantine role |
| Themes / ThemeChanged | Colors and typography without replacing document/history |
| Localization / LocaleChanged | English-first messages and accessible editor label |
| Logger | Readiness, load/save/relocation outcomes and failures without document content |

Session management, persistence and CodeMirror adaptation are separate files.
There are no React/Mantine imports, platform filesystem calls, browser storage or
private plugin imports. File Explorer's existing open/relocate/reconcile calls
connect without DOM listeners. Structural completion retargets cached buffers
before returning to Explorer, which then commits ActiveDocument identity.
Structural operations serialize while hook-initiated text writes stay outside
that queue. Native external operations cannot be vetoed; versions detect external
edits on saving, and existing watch notifications improve clean-buffer freshness.

## Public component role

The plugin registers `lunaris.text-editor-host` for ActiveScreen and mounts
`lunaris.text-editor` from Mantine Components. Role props:

- Strings: documentKey, name, status, error, saveLabel, retryLabel, reloadLabel,
  discardLabel, cancelLabel. Product messages are localized by the controller.
- Booleans: ready, dirty, busy.
- Callbacks: onSave(), onReload(), onTarget(HTMLElement | null).
- Public presentation context: embedded/fill.
- Optional mode group: preview (boolean), previewLabel/sourceLabel (localized
  strings), onPreviewChange(). Supply the complete group to show the Mantine
  mode button. Its aria-pressed state indicates Live Preview. The controller
  owns the value; the role only displays it and invokes the callback.

onTarget lends a stable owned element and releases it with null on disposal.
Preserve its identity across status/theme updates. Mount CodeMirror after SDK
mount returns; do not style/reparent borrowed targets. The role confirms dirty
discard before invoking onReload. Controller callbacks become inert on cancellation.

## Ownership and visual reference

Reference: the existing open Workspace main region and Settings inside
ActiveScreen. Composition catalog consulted: [Mantine UI](https://ui.mantine.dev/).
Workspace owns external spacing and the main surface; ActiveScreen owns screen
geometry and hidden/inert behavior. Mantine owns the header, status, recovery
controls and stable text target. CodeMirror owns text, selection, caret and local
scrolling. Embedded roots remain transparent, with no enclosing card, border,
shadow or shell. Semantic theme colors/typography apply. Native scrollbar chrome
is hidden while wheel/touch/keyboard scrolling remains available.

Settings retains the hidden live view. Theme/locale updates reconfigure view
compartments. Document switches and renderer replacement retain compatible
EditorState history/selection in the controller. Live views preserve scrolling
when hidden/themed; renderer replacement does not restore native scroll geometry.

## Verification and manual acceptance

Run `npm run editor:check` for session, provider, composed Mantine/ActiveScreen/
CodeMirror and Tauri regressions. Run `npm run build --workspace @lunaris/tauri`
for the frontend production bundle. JSDOM geometry stubs establish behavior and
DOM ownership, not native appearance. Required code integrations are connected.

Native visual acceptance remains manual. Run `npm run tauri:dev` and check:

1. Empty/long Markdown files, typing, two-second autosave and Mod-S; inspect disk.
2. Undo/redo, selection, Settings and return via the same file; verify focus/history.
3. Dark/light themes, caret/selection contrast, transparent surfaces, narrow/short
   windows, wrapping and region-local scrolling.
4. Rename/move/delete files and parent folders during editing; confirm no old path
   is recreated. Edit externally and exercise conflict recovery.
5. Save failure during Vault switch/window close; retain the window and text.
   Exercise retry and explicit discard/reload.
6. Read-error, unsupported/missing-file states, long translations and keyboard
   focus/recovery actions inside the actual Workspace.
7. Live Preview/Source mode toggle, inline syntax reveal by click and arrow keys,
   nested formatting, multi-cursor/range selection, multiline paragraphs and
   backspace at hidden-marker boundaries. Copy selections and inspect raw Markdown.
8. Heading sizes, bullets, nested quotes, rules and code in dark/light themes;
   check scrolling/wrapping in long documents and narrow/short windows. Mode button
   focus/pressed state and long localized labels must remain usable. Native visual
   acceptance of these states is pending; automated DOM tests do not establish it.

## Live Preview behavior and limits

Research and implementation contract: [Live Preview design](../../../../DOCS/design/live-preview.md).
The adapter uses the Markdown syntax tree, not regular-expression replacement of
document text. It visits visible ranges and rebuilds decorations for document,
selection, viewport and asynchronous parser changes. A dedicated mode compartment
enables/removes the extension without touching history or saving the document.
All selection ranges reveal any intersecting inline construct, including at its
boundaries. Heading/list/quote/rule markers reveal on their active source line.
Nested constructs reveal with their selected outer construct. Focus changes alone
do not alter rendering. Clicking a rendered label edits its source; no navigation
handler or unsafe HTML rendering is introduced.

Supported presentation: strong/emphasis/strikethrough, inline code, inline Markdown
link labels, ATX/Setext headings, unordered bullets, quote markers and horizontal
rules. Ordered list numbers remain literal. Code blocks receive a quiet code
surface; their fences/info strings remain literal. Tasks retain editable `[ ]`/
`[x]` text. Escaped syntax is interpreted by the parser. Images and HTML remain
literal. Link labels may contain nested formatting; reference-style destinations
are not resolved. Multiline syntax that cannot be safely hidden without replacing
line breaks remains visible.

This is the Markdown foundation, not full Obsidian parity. Rendered/editable
tables, interactive tasks, attachment previews, wikilink navigation/transclusion,
callouts, properties, footnotes, math, diagrams, HTML and highlight/comment
extensions remain outstanding. They must use appropriate public SDK contracts;
do not resolve files or navigate through private plugin state or raw platform APIs.
No extra SDK service was required for the implemented presentation layer.

Integration review: Text Editor passes additive mode props through Components to
Mantine Components. The existing ActiveScreen, Workspace, Themes, Localization,
Logger, ActiveDocument and Filesystem integrations remain connected. The role owns
the mode control and target, while the adapter owns text presentation. No other
plugin needs new wiring for this foundation. Optional feature integrations listed
above have not been implemented and must not be reported as complete.
