# Backlinks UI

## Usage

Open **Backlinks** in the existing Sidebar rail. Linked and unlinked mentions are
grouped by source note. Click a context result to open its range; **Link** turns an
unlinked mention into an internal link with Undo support. The toolbar controls
group collapse, paragraph context, filtering, refresh, a fixed-note tab and inline
backlinks. Settings > Backlinks stores the inline preference and excluded paths
per Vault. Excluded comma-separated file/folder paths affect only unlinked mentions.

## Public integration

Consumes Backlinks/BacklinksChanged, DocumentContent, ActiveDocument and its
change event, DocumentFooters, Sidebar, ActiveScreen, Components and its change
event, Config/ConfigChanged, Settings, Vault/VaultChanged, Localization/LocaleChanged
and Logger. Registers the `lunaris.backlinks-host` controller role and mounts the
replaceable Mantine `lunaris.backlinks` role. The controller accepts an optional
`pinned` or `document` FileTarget and `inline` boolean; otherwise it follows the
active document. Component props include localized labels, source groups,
callbacks, controls and explicit presentation context.

The index provider is independently replaceable. No React, Mantine, native APIs
or private editor/session imports occur in this consumer.

## Ownership and visual reference

The existing Files/Settings panel header and navigation are the product reference.
Workspace owns Sidebar geometry, card surface and overflow; the controller owns
content only. ActiveScreen owns fixed-note tab placement. TextEditor's footer owns
document width, surface and scroll position. Embedded roots remain transparent.
The same viewport menu as Files supplies the themed sort dropdown, including
opened options, keyboard focus and selection. Icons use the existing Lucide pack.

Lunaris currently has one Sidebar, on the left; this feature reuses it instead of
creating a second application shell to imitate Obsidian's right sidebar.

## Acceptance

Automated integration covers the real editor and Workspace layout role, opened
Combobox, footer placement, pinned screen, guarded navigation, link insertion,
Undo and Vault switching. This establishes behavior, not native geometry.

With no open note, the panel shows its localized status and keeps refresh and
the inline preference available. Empty result counts appear once indexing
finishes. Existing results stay available during a refresh. Inline groups share
the editor's vertical scroll area and do not intercept scrolling at their edges.

Manual checks remain: actual Sidebar composition; light/dark themes; long Russian
and English file names; narrow/short windows and mobile drawer; opened sort menu;
keyboard focus; empty/loading/degraded states; inline footer scrolling and width.
Desktop automation is prohibited by repository policy.

See `DOCS/reference/backlinks.md` for the behavior boundary and verification command.


## Backlinks alignment with Files (2026-11-13)

Reference: the Owner's paired Files and Backlinks screenshots. The shared header
and Files action-row styling now also frame Backlinks. Sorting uses the same
ViewportMenu, Lucide sort/check icons and themed menu rows as Files instead of a
permanent form field. All four sort modes remain available. The current note is
secondary context below the toolbar; results share Files' side gutters, compact
rows and themed hierarchy guides. More Backlinks actions may wrap at narrow widths.
Mention previews intentionally retain multiline text and match highlighting.

Workspace owns the Sidebar surface and geometry; TextEditor owns the inline
footer allocation. Backlinks remains transparent and only owns internal content.
The existing public Components role, localized callbacks and controller/index
integration suffice; no SDK or additional plugin connections are needed.
Targeted checks cover sort selection, disclosure/filter focus and editor/footer/
pinned-screen/link integration. Native visual acceptance remains pending: compare
Files and Backlinks in the real Sidebar, opened sort menu, long names, narrow/short
windows, light/dark themes and keyboard focus.
