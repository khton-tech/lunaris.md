# Text editor

CodeMirror 6 Markdown editor with Live Preview, integrated through public SDK contracts.
Plugin: `lunaris.text-editor`; package: `@lunaris/text-editor`. Tauri starts it
with ui.dom, vault.access and filesystem.access.

## Usage and saving

Open a Markdown file in File Explorer. Wrapped lines, Markdown syntax, standard
text shortcuts, undo/redo, multiple selections and Mod-S are enabled. Tab inserts
a literal tab (`\t`) at the caret or indents selected lines with tabs. Within
Markdown list text, Tab indents the item's source line instead of inserting
whitespace inside the item label; Shift-Tab removes one level. Tabs display at
four columns. Fenced/indented code retains ordinary caret insertion. Markdown's
Enter binding continues nested bullets, ordered lists and task syntax. Escape followed by Tab uses
CodeMirror's temporary focus-navigation mode to leave the editor by keyboard.

List indentation is unrestricted: repeated Tab adds a literal tab on each press,
including first/isolated items and skipped intermediate levels. Shift-Tab removes
one level on each press. The editor's public Lezer Markdown extension consumes
hard-tab list indentation in composite TabListIndent nodes before the indented-code
rule, retaining standard ListItem/BulletList/OrderedList nodes for editing and
preview. Deep markers also end preceding lazy paragraph continuations. Enter
delegates marker/task/number continuation to CodeMirror and preserves the explicit
tab prefix that its CommonMark-only command cannot represent.

This is a Lunaris editing dialect: strict CommonMark readers may interpret a
standalone hard-tab-indented list as code. Space-only indented examples, ordinary
indented code and fenced code retain their existing interpretation. Regression
tests cover four consecutive indentation/dedentation steps, standalone items,
bullets, ordered/task lists, grouped siblings, inline formatting, Enter and disk
persistence. No new SDK contract or cross-plugin wiring is required; native
caret/wrapping acceptance remains manual in the actual Workspace.
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

## Tab routing in Workspace

WorkspaceLayout's temporary chrome traversal policy allows Tab/Shift-Tab events
from editable content to reach the contributing editor. It uses standard HTML
contenteditable semantics along the composed event path, without editor IDs,
private CSS classes or cross-plugin imports. Noneditable descendants retain the
chrome traversal policy. CodeMirror owns indentation, Shift-Tab and its Escape/Tab
focus-navigation mode. Temporary EDITOR_TAB_TRACE listeners have been removed.

The integration regression mounts the real public WorkspaceLayout role around
ActiveScreen and the editor. It verifies caret insertion, selected-line indentation,
Shift-Tab, explicit focus-navigation mode and saving, while a separate check
preserves suppression outside editable content. The regression failed with the
old document-capture suppression and passes with the semantic exception. Native
visual/keyboard acceptance remains manual in the actual Tauri window.

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
