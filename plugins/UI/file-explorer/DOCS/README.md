# File explorer plugin

Purpose: a replaceable Sidebar file tree and Vault-relative file operations.
Package `@lunaris/file-explorer`, plugin `lunaris.file-explorer`. Tauri starts it by
default. Require `filesystem.access` and `vault.access`; no DOM permission.

Provides no API/event contracts. Consumes Logger, Sidebar, Filesystem,
FilesystemObservation, Vault, VaultHistory and Localization APIs; subscribes to FileChanged,
VaultChanged, VaultHistoryChanged and LocaleChanged. Registers its localized tab using ctx.signal.
Calls filesystem list/createDirectory/writeText/move/copy/remove and the owned
observation watch method. All native access remains behind providers/drivers.

Consumes ContextMenu for shared command registration/rendering. Built-in actions
join external contributions with explicit File Explorer/Vault/path/selection
context. The protected Vault root and panel background expose root operations
without root mutation actions. See the [context menu API](../../../../DOCS/reference/context-menu.md).

The UI uses `lunaris.file-explorer` from Mantine components through Sidebar; the
controller never imports React/Mantine/Arborist. English/Russian catalogs cover
all visible copy, including the Tabs dropdown with the current Files entry. The
renderer displays the Workspace Vault name as a protected tree root; operations
remain available for ordinary entries through context menus and keyboard shortcuts. Tree state, operation policy, drafts and an in-memory per-Vault
copy/cut buffer belong to the controller, independent of a mounted view.

Creation drafts carry a localized default name and optional initial sort name.
The renderer keeps folder-first ordering, selects the initial basename, commits
nonempty drafts on blur and cancels empty drafts/Escape. These remain local until
the existing public creation callback succeeds; no file is written merely by
opening the inline editor. Context-menu commands release their overlay first.

See the [full reference](../../../../DOCS/reference/file-explorer.md) for keyboard
commands, public component props, cancellation, operation/error semantics,
completed integrations, outstanding document opening and manual acceptance.
Run `npm run file-explorer:check` and the Tauri frontend build.

## Vault switching

The file panel footer displays the current Vault name. Its upward-opening Mantine
menu shows at most four most-recent-first history entries and Switch vault.
`VaultHistory.list/open` supplies recents; `Vault.open` selects and prepares another
folder without closing the current Vault on cancellation or failure. The dedicated
navigation controller survives file-tree session replacement. It guards duplicate
requests and stopped scopes, ignores stale history reads after history events,
and exposes localized failure/retry UI. History failures do not block folder selection.
Names and display labels are presentation only; references stay opaque and are never logged.

Integration is complete through the public Vault/VaultHistory, Sidebar, Mantine
Components and Localization contracts. Existing VaultChanged handling rebuilds
the tree and ActiveDocument restores the selected file per Vault. Tauri already
registers the required providers and grants vault.access; no driver changes are
needed. Native picker appearance and narrow/short desktop layout acceptance
require manual Owner testing; desktop automation is prohibited.

## File extension presentation

The controller supplies supportedExtensions (currently ["md"]) through public
lunaris.file-explorer component props. The optional list contains extensions
without dots; matching ignores case. Additional formats require no rendering
changes. This controls presentation, not document-opening support.
File suffixes are hidden from names and inline create/rename fields and preserved
in filesystem callbacks, including their original case. Supported formats have
no badge. Only external (unsupported) files show their extension in a small,
subdued right-aligned Mantine Badge. Omission of supportedExtensions treats all
extensions as external. Full paths remain available in row tooltips. Directories,
extensionless files, trailing dots and stemless dotfiles have no badge.
Pasted full names do not duplicate suffixes. Empty names cannot submit.
Existing Sidebar/Components callbacks carry full filenames; no driver or SDK
API changes or additional plugin integrations are required.

## Active document integration

The controller consumes ActiveDocument/ActiveDocumentChanged through the public
SDK. The renderer receives optional activePath and onOpen props. A plain file
click or Enter opens it; Ctrl/Shift selection remains independent. activePath
controls persistent row marking and aria-current even when focus or selection
changes. Restored files reveal their ancestors without taking keyboard focus.
Confirmed file creation activates the new file; rename/move update its identity
and deletion/observation/manual refresh reconcile missing files. See
[the active document reference](../../../../DOCS/reference/active-document.md).
Content editor integration remains outstanding; no editor exists yet.
