# Text editor

CodeMirror 6 Markdown editor with Live Preview, integrated through public SDK contracts.
Plugin: `lunaris.text-editor`; package: `@lunaris/text-editor`. Tauri starts it
with ui.dom, vault.access and filesystem.access.

## Usage and saving

Open a Markdown file in File Explorer. Wrapped lines, Markdown syntax, standard
text shortcuts, undo/redo, multiple selections and Mod-S are enabled. Tab inserts
a space-based indent to the next four-column tab stop at the caret or indents
selected lines by four spaces; Shift-Tab removes indentation, including existing
hard tabs. Escape followed by Tab uses
CodeMirror's temporary focus-navigation mode to leave the editor by keyboard.
Live Preview is enabled. The editor has no persistent
header, filename, saved status, mode toggle or Save button. Autosave and Mod-S
remain available. Source mode remains an internal adapter capability with no
product control. No reading view, formatting toolbar, gutter or CodeMirror
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

onTarget lends a stable owned element and releases it with null on disposal.
Preserve its identity across status/theme updates. Mount CodeMirror after SDK
mount returns; do not style/reparent borrowed targets. The role confirms dirty
discard before invoking onReload. Controller callbacks become inert on cancellation.

## Ownership and visual reference

Reference: the existing open Workspace main region and Settings inside
ActiveScreen. Composition catalog consulted: [Mantine UI](https://ui.mantine.dev/).
Workspace owns external spacing and the main surface; ActiveScreen owns screen
geometry and hidden/inert behavior. Mantine owns unavailable-state messages, recovery
controls and stable text target. CodeMirror owns text, selection, caret and local
scrolling. Embedded roots remain transparent, with no enclosing card, border,
shadow or shell. Semantic theme colors/typography apply. Native scrollbar chrome
is hidden while wheel/touch/keyboard scrolling remains available.

The Owner's Lunaris/Obsidian comparison defines the document geometry: a centered
reading column within the available editor region, with left-aligned text. The
CodeMirror content is at most 780px wide including its existing responsive line
insets (up to 40px on each side, giving about 700px of text). It shrinks to the
region width on narrow windows. CodeMirror owns this internal content width;
Workspace/ActiveScreen and the Mantine target retain their full allocated size
and surface. Quote rails and code remain within the same centered column. Existing
public SDK integrations require no changes. Native wide/narrow window geometry,
caret hit testing, selection and scrolling remain pending manual verification.

The document top inset is responsive from 24px to 56px; the bottom inset retains
its previous 12–32px range. Selection rectangles use the SDK theme's selection
color in focused and unfocused states, with sufficient selector specificity to
override CodeMirror's built-in dark teal/light purple defaults. Native selection
is still suppressed by drawSelection to avoid painting two highlights. Tests
verify keyboard Tab/Shift-Tab behavior and focused selection CSS precedence under
dark/light themes; native selection geometry and the top inset require manual
acceptance in Workspace. No public SDK or cross-plugin wiring changes are needed.

## Temporary Tab diagnostics

To investigate the Owner-reported native Tab failure, the adapter traces its first
five Tab keydowns per mounted view through the controller's required SDK Logger.
The window capture listener observes events before document handlers and CodeMirror's focus/composition
gates without handling or cancelling them, including when focus is outside the
editor. `EDITOR_TAB_TRACE` emits at info level
so the default logger threshold includes it. Each attempt produces `received`
(modifiers, focus, composition, editability and session locks) and `settled`
(command execution, default prevention, document identity and length/caret deltas).
Version 3 first emits `ready` on installation with `diagnosticVersion: 3`, and a
single `first-key` record containing only focus and Tab-identification booleans.
Tab detection accepts key, code and legacy keyCode, and `inEditor` distinguishes
the input target. Bounded `focus` records identify focus changes on the actual
editor content; `keyup` records distinguish keydown interception from completely
missing Tab delivery. No document content, paths or other key values are logged. Disposal removes the listener
and suppresses queued records after scope closure. Filter the DevTools console by
`EDITOR_TAB_TRACE` after reproducing Tab. The bounded primitive fields also appear
in the message itself so a plain-text console copy preserves them without
expanding DevTools objects. These traces
diagnose native input; passing simulated-key tests does not establish the reported
WebView failure's cause or resolution. Remove this bounded instrumentation once
the native cause is established.

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
7. Headerless Live Preview, inline syntax reveal by click and arrow keys,
   nested formatting, multi-cursor/range selection, multiline paragraphs and
   backspace at hidden-marker boundaries. Copy selections and inspect raw Markdown.
8. Heading sizes, bullets, nested quotes, rules and code in dark/light themes;
   check scrolling/wrapping in long documents and narrow/short windows. Recovery control focus and long localized labels must remain usable. Native visual
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

The Owner's Workspace screenshot is the visual reference for the typography
refinement: H1–H6 use 2.4/2/1.7/1.45/1.25/1.1 times the editor font size.
Quote lines have an inset, full-height theme-derived rail rather than a text
glyph; adjacent lines, empty quoted lines, lazy continuations and wrapped text
share a continuous rail. Nested quotes add rails and indentation. Source markers
still reveal on the active line while rails remain visible. Inline code has a
monospaced font, subtle background, rounded outline and local padding, including
while its backticks are exposed. These are CodeMirror document decorations, not
additional UIKit controls; ownership and public SDK wiring are unchanged.
Manually verify the larger headings, quote continuity across soft wraps and
empty lines, nested quotes and inline-code wrapping/caret contrast in the actual
Workspace in both themes. Native visual acceptance remains pending.

This is the Markdown foundation, not full Obsidian parity. Rendered/editable
tables, interactive tasks, attachment previews, wikilink navigation/transclusion,
callouts, properties, footnotes, math, diagrams, HTML and highlight/comment
extensions remain outstanding. They must use appropriate public SDK contracts;
do not resolve files or navigate through private plugin state or raw platform APIs.
No extra SDK service was required for the implemented presentation layer.

Integration review: Text Editor mounts the headerless public role through Components
to Mantine Components. The existing ActiveScreen, Workspace, Themes, Localization,
Logger, ActiveDocument and Filesystem integrations remain connected. The role owns
recovery controls and the target, while the adapter owns text presentation. No other
plugin needs new wiring for this foundation. Optional feature integrations listed
above have not been implemented and must not be reported as complete.
