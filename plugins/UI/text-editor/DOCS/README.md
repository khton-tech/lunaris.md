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

Typing `(`, `[` or `{` inserts its closing delimiter and leaves the caret inside.
Inline emphasis (`*text*`), strong emphasis (`**text**`) and backtick code spans
use the same behavior. A second star inside an empty emphasis pair expands `**`
to `****`, with the caret between the two delimiter runs. Typing an auto-inserted
closing character advances over it without modifying the document (one character
per press, including the two closing stars). Backspace removes an empty generated
pair, including both sides of empty strong emphasis. Selected text is wrapped;
multiple cursors track their own pairs. Undo/redo retains generated-pair tracking.
Escaped openers, inline markers inside words/code, multi-character paste and
read-only/composition input do not generate pairs. Ordinary `* ` bullets remove
the empty generated closing star. Loaded or manually inserted delimiters remain
literal and are not treated as generated closers.

The existing CodeMirror adapter owns this input behavior in `paired-input.ts`;
it uses public CodeMirror extensions within the existing SDK-mounted text target.
Workspace, ActiveScreen and Mantine keep their existing geometry/surface/content
ownership. No SDK extension or additional plugin integration is required.
Targeted input tests and a composed Workspace regression cover pairing, skipping
and persistence. Native keyboard/IME, caret and Live Preview acceptance remains
manual: in Workspace type each pair, enter text, type its closer, and check
single/double-star emphasis, backticks and empty-pair Backspace.

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

File observations can arrive after a browser save has completed. A clean session
checks the observed file's version and content without entering the loading state;
unchanged save echoes retain the existing CodeMirror view, focus, selection and
history. Real external changes still use the authoritative reload path. Edits,
saves, relocation or closure during the check invalidate its result. This behavior
belongs to the existing editor controller/session; Workspace and Mantine retain
layout/surface ownership, and no public SDK contract changes are required.
Regression coverage uses the composed browser editor with real server observation
and guards against even a transient contenteditable/read-only toggle. Native
keyboard/caret acceptance remains manual: type, wait for autosave and the next
server poll, then continue typing without clicking the editor again.

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

### Typing feedback

Inline code surfaces use CodeMirror's public outerDecorations facet, wrapping
ordinary letter-animation marks. This keeps one continuous outlined span during
typing, deletion and animation expiry rather than temporarily outlining each
animated fragment. Text animations remain enabled inside code. The composed
Workspace regression reproduces the previous three-span split and checks one
outline while typing paired backticks, inserting/deleting within the span and
saving after feedback expiry. Existing public SDK integrations and ownership
remain unchanged; native wrapping/outline acceptance remains manual.

The Owner requested subtle letter appearance/deletion feedback in the existing
editor. The CodeMirror adapter owns this document presentation in
`typing-animation.ts`; Workspace/ActiveScreen own geometry and surfaces, and
Mantine owns the borrowed text target and recovery controls. No new control,
SDK contract, provider or cross-plugin connection is required. Existing Themes,
Components, ActiveDocument, Filesystem and session integrations remain connected.

Following the Owner's modern Word reference, short typed edits softly fade from
low opacity and slight blur to full readability, with no translation or scaling.
Short deletions
leave a fading, zero-width, noninteractive afterimage at the deletion boundary.
Afterimages retain the text baseline through normal inline layout, without an
absolute vertical offset, so deletion fades in place rather than jumping upward.
The document and caret update immediately: afterimages are aria-hidden,
noneditable widgets and never enter document text, clipboard source, history or
saves. Only opacity and a subtle blur animate; document layout is not animated.
The active theme's normal motion/easing tokens are inherited (200 ms fallback,
capped at 240 ms). Feedback expires independently after 260 ms, so rapid typing
does not abruptly finish or restart earlier letters. A subsequent edit replaces
deletion afterimages; retained insertion marks keep their own DOM identity.
The existing CodeMirror-drawn carets slide between left/top coordinates using
the active theme's fast easing, capped at 100 ms. Height, text layout, selection
and actual editing positions update immediately; only caret presentation
interpolates. This applies to primary and secondary carets and does not replace
CodeMirror's cursor layer or blink behavior. Reduced motion removes the transition.
Manually check rapid typing, arrow navigation, mouse placement, line wrapping,
scrolling, multiple carets and both themes in the actual Workspace.
View disposal cancels cleanup and removes the media-query listener.

Paste, external changes, undo/redo, IME composition, whitespace-only edits,
multiline changes and edits exceeding eight UTF-16 units per changed range do
not animate. At most 32 changed ranges receive feedback per transaction.
Reduced-motion preference suppresses feedback and immediately clears active
feedback when changed. There are no typing logs or additional persistence calls.

Targeted tests cover expiry, rapid typing with retained animation nodes, rapid deletion, document/selection/history retention,
multiple carets, reduced motion, exclusions and composed Workspace/Live Preview
saving without afterimages. Native visual acceptance remains pending: type and
delete quickly at line ends and in the middle of text, near Markdown markers,
with Cyrillic/emoji, wrapped headings/code, multiple carets and IME; check caret
hit testing, scrolling, copy/paste, both themes and reduced motion. Zero-width
afterimages follow the deletion boundary after reflow rather than preserving
the previous screen position. Desktop automation is prohibited.

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
rules. Ordered list numbers remain literal. Code blocks receive a continuous,
rounded outline, quiet surface and monospaced text. Inactive fenced blocks show
the first info-string token as a subdued language label above the code; absent
languages add no label. Fence markers and remaining metadata hide without changing
line breaks or source. Selecting a fence line reveals its complete source for
editing; selecting the body retains the card. Empty, unclosed and tilde-fenced
blocks use the same presentation. Tasks render interactive
checkboxes as described below. Escaped syntax is interpreted by the parser. Images and HTML remain
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
tables, attachment previews, wikilink navigation/transclusion,
callouts, properties, footnotes, math, diagrams, HTML and highlight/comment
extensions remain outstanding. They must use appropriate public SDK contracts;
do not resolve files or navigate through private plugin state or raw platform APIs.
No extra SDK service was required for the implemented presentation layer.

### Code block cards

Reference: the existing outlined inline-code presentation, extended to the Owner's
requested bordered code card with a language caption. CodeMirror owns these
document-line decorations, including local borders, padding and wrapping; this
is not a new UIKit control or an enclosing editor surface. Workspace, ActiveScreen
and the Mantine editor target keep their existing geometry and surface ownership.
Colors follow theme text/secondary text; the caption is document content and
requires no translation. There are no new SDK contracts or plugin connections.
Text Editor remains integrated with Mantine Components, Themes and persistence
through the existing public contracts.

Targeted preview and composed Workspace tests cover fence reveal, multiple
selections, literal code contents, optional captions, empty/unclosed blocks,
language edits, theme changes, undo and CRLF saving. Native visual acceptance
remains pending: check the continuous outline/corners, caption placement, empty
blocks, caret/selection, long wrapped lines, nested lists/quotes and scrolling in
light/dark themes and narrow/short Workspace windows.

Integration review: Text Editor mounts the headerless public role through Components
to Mantine Components. The existing ActiveScreen, Workspace, Themes, Localization,
Logger, ActiveDocument and Filesystem integrations remain connected. The role owns
recovery controls and the target, while the adapter owns text presentation. No other
plugin needs new wiring for this foundation. Optional feature integrations listed
above have not been implemented and must not be reported as complete.

## Interactive task checkboxes

Parsed list items beginning with `[ ]`, `[x]` or `[X]` render the public
`lunaris.task-checkbox` role from Mantine Components. Recognition is limited to
the prefix immediately after a parsed ListMark, including ordered lists, quotes
and the hard-tab nesting dialect. It does not interpret code, escaped list
markers, HTML or arbitrary bracketed text as tasks. A narrow prefix check also
covers parent tasks whose paragraph is interrupted by a deep hard-tab child.

Clicking the checkbox (or activating its focused native input with Space) changes
only the character inside the brackets, using lowercase `x` for completion and a
space for reopening. Each change uses the normal CodeMirror transaction/history
and DocumentSession autosave path; CRLF, version checks, conflicts and recovery
retain their existing behavior. Rendering never writes to disk. The control keeps
its DOM identity/focus when checked state changes; caret and selections do not
move. Text remains editable. Touching the task marker with any source selection
reveals its raw syntax; moving away restores the checkbox. Empty task labels use
the editor's localized Task message for their accessible name.

Workspace and ActiveScreen retain region geometry/surfaces. CodeMirror owns task
placement and text; Mantine owns only the embedded checkbox control, its theme,
disabled/focus/hover states. The control uses an embedded/content public
presentation context and does not add a background or card. The existing inline
list preview is the placement reference; the shared Mantine settings controls
define theme/focus conventions. [Mantine UI inputs](https://ui.mantine.dev/category/inputs/)
and the [controlled Checkbox API](https://mantine.dev/core/checkbox/) were consulted.

The Text Editor connects the new role through Components and observes
ComponentsChanged for renderer removal/replacement. Missing renderers retain
readable task markers and report degraded behavior; re-registration restores
controls. Read-only/loading/missing/locked documents disable the controls, and
queued actions recheck scope lifetime, document state and marker identity.
Disposal after owner cancellation relies on SDK-owned component cleanup and does
not access retained SDK handles. Successful toggles log at debug without task
text. No new SDK service or platform access is needed. Required Text Editor /
Mantine integration is connected; no other plugin needs additional wiring.

Targeted tests cover real Mantine controls within Workspace, checked/unchecked
and uppercase markers, focus/selection, undo/redo, deep and ordered items,
literal-code/escape exclusions, source reveal, shifted positions, read-only state,
renderer restart, CRLF persistence and save-failure retention. Native visual and
keyboard acceptance remains pending: manually verify click and Space, source
editing and Enter continuation, long wrapped/nested tasks, checkbox alignment,
focus and disabled contrast in light/dark themes and narrow/short Workspace views.
# Remote recovery

When optional Drafts and FilesystemSources are composed, remote document sessions
persist local revisions under stable server/account/Vault/path identities. Local
Vault behavior is unchanged. Reconnection retries interrupted saves with the
original content version; conflicting drafts require explicit recovery. Empty
drafts remain dirty even when no remote read is available. Acknowledgement removes
only the saved draft revision, preserving edits made during a pending save.

Document/Vault departure during connectivity or authorization failure is accepted
only after a durable local draft succeeds. Structural mutations still require a
successful remote flush. Storage failure is visible and prevents claiming durable
recovery. Forced shutdown before a storage transaction commits cannot guarantee
recovery. ConnectionChanged is subscribed only with the remote recovery services.

## Public statistics

Provides DocumentStatistics and DocumentStatisticsChanged from @lunaris/active-document. Counts cover the raw buffer including unsaved input and recovered drafts, following load/reload, relocation and file changes. Loading/unsupported files expose null counts. See [the SDK contract](../../../../DOCS/reference/active-document.md#buffer-statistics).
