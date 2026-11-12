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
The shared Mantine SettingsSelect supplies the themed sort dropdown, including
opened options, keyboard focus and selection. Icons use the existing Lucide pack.

Lunaris currently has one Sidebar, on the left; this feature reuses it instead of
creating a second application shell to imitate Obsidian's right sidebar.

## Acceptance

Automated integration covers the real editor and Workspace layout role, opened
Combobox, footer placement, pinned screen, guarded navigation, link insertion,
Undo and Vault switching. This establishes behavior, not native geometry.

Manual checks remain: actual Sidebar composition; light/dark themes; long Russian
and English file names; narrow/short windows and mobile drawer; opened sort menu;
keyboard focus; empty/loading/degraded states; inline footer scrolling and width.
Desktop automation is prohibited by repository policy.

See `DOCS/reference/backlinks.md` for the behavior boundary and verification command.
