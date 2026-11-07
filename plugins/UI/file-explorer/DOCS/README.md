# File explorer plugin

Purpose: a replaceable Sidebar file tree and Vault-relative file operations.
Package `@lunaris/file-explorer`, plugin `lunaris.file-explorer`. Tauri starts it by
default. Require `filesystem.access` and `vault.access`; no DOM permission.

Provides no API/event contracts. Consumes Logger, Sidebar, Filesystem,
FilesystemObservation, Vault and Localization APIs; subscribes to FileChanged,
VaultChanged and LocaleChanged. Registers its localized tab using ctx.signal.
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

## File extension presentation

The controller supplies supportedExtensions (currently ["md"]) through public
lunaris.file-explorer component props. This optional list contains extensions
without dots; omission disables suffix presentation. Matching ignores case.
Additional formats require no rendering changes. This controls presentation,
not document-opening support. Supported suffixes appear in a compact Mantine
Badge on the right instead of the name or inline create/rename field. Full paths
remain in row tooltips. Callbacks retain the original suffix including case;
pasted full names do not duplicate it. Unsupported files, stemless dotfiles and
directories retain full names without badges. Empty names cannot submit.
Existing Sidebar/Components callbacks carry full filenames; no driver or SDK
API changes or additional plugin integrations are required.
