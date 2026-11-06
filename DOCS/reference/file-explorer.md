# File explorer

## Responsibilities

`lunaris.file-explorer` (`plugins/UI/file-explorer`) is the default Sidebar tool.
It registers a localized Files tab with `lunaris.file-explorer` as its Components
role. The controller imports only public SDK contracts. It requires Logger,
Sidebar, Filesystem, FilesystemObservation, Vault/VaultChanged,
Localization/LocaleChanged and FileChanged. Permissions: `filesystem.access` and
`vault.access`. It provides no API/events and needs no DOM permission.

Context menus require the [ContextMenu API](context-menu.md). The controller
supplies invocation metadata and built-in actions, while the shared provider
adds contributions from other plugins and mounts the Mantine role in its owned
overlay. `onContextMenu(request)` in renderer props returns an optional disposable
menu session. The request carries target element, viewport position, localized
label, entries, logical path/kind, selection and destination; the controller adds
the source and Vault identity. All mutation callbacks remain controller-owned.

Existing providers supply filesystem policy, native operations, active Vault,
Sidebar geometry, localization, logging and themes. The explorer adds a portable
tree/operation model and controller. The Mantine component plugin adds the
replaceable renderer, using React Arborist 4.0.1, react-dnd/HTML5 backend 16.0.1,
Mantine Core controls and Lucide icons. No consuming plugin imports React, Mantine,
Arborist, another plugin's implementation, Tauri IPC or native paths.

The [owned observation prerequisite](filesystem.md#owned-observations) is complete
in the filesystem contract, provider and Tauri driver, including provider-only
shutdown. Other driver implementations need the additive observation-driver
contract. No kernel runtime change was necessary.

## User operations

Dot-prefixed directories (including `.lunaris` and `.git`) and their subtrees
are excluded from the displayed tree. Dot-prefixed files remain visible.
Right-clicking the root/background clears the old file selection before opening
root commands. Clicking the background also clears selection. File targets show
selection operations; creation/paste/refresh are offered only on a single folder,
the root or background. Multi-selection offers only selection operations.

- Expand folders on demand; folders sort before files, followed by name sorting.
- Ctrl/Shift selection and Ctrl+A use Arborist's tree navigation/selection.
- Create an empty file or folder through the context menu, Ctrl+N or Ctrl+Shift+N.
  A protected draft row appears inside the destination directory; ancestors open
  and the row scrolls into view. Enter submits, Escape cancels. There is no separate
  creation form or action toolbar. A failed operation retains the entered name
  for correction/retry; repeated Enter cannot submit parallel creations.
  The localized default name is `Unnamed.md` for files and `Unnamed folder` for
  folders; known sibling collisions get a numeric suffix before the extension.
  The draft sorts folder-first by its initial name and keeps that position while
  typing; the confirmed filesystem entry sorts by its final name. Initial focus
  selects the basename while preserving the file extension. Leaving a nonempty
  creation field submits it; leaving an empty field cancels it. Escape never
  submits through the resulting blur event. Failed blur submissions keep the
  editor available for correction.
- F2 renames in place; Enter submits and Escape cancels. Enter on a folder toggles
  it; file activation has no document-opening action yet.
- Drag selected items into a folder or the root to move them. Tree order is always
  filesystem-derived; dropping between siblings does not create manual ordering.
- Ctrl+C/X/V copy, cut and paste inside the current Vault. The buffer is private
  to the explorer, not the OS clipboard. A single selected directory is the paste
  destination; a selected file uses its parent; multiple/no selection uses root.
- Right-click an ordinary row or use ContextMenu/Shift+F10 for commands. Right-click
  preserves an existing multi-selection when the target is already selected.
- Delete opens a confirmation naming all selected paths and warning explicitly
  that there is no trash or undo. There is no implicit deletion on cut or drag.
- F5 or Refresh reloads cached directories. If watching fails, manual refresh
  remains available and the UI identifies automatic-refresh degradation.

Portable single-segment names are validated before creating/renaming. Creation
uses `mode: create`; all transfers pass `overwrite: false`. Collisions leave the
existing destination intact. Ancestor/descendant selections are normalized so a
selected subtree is transferred only once; transfers into descendants are rejected.
Symbolic-link/other entries remain visible; unsupported driver operations return
an explicit error. Dragging these entries is disabled.

Filesystem operations are serialized per explorer model. The UI reflects confirmed
results and rescans after success or failure. Batch operations are not transactions:
successful items remain, errors appear inline, and partial success has explicit
localized feedback. Failed cut sources stay in the cut buffer; completed sources
are removed. Large directory lists remain complete in memory; Arborist virtualizes
visible rows. This does not add paginated/streaming filesystem enumeration.

## State and lifetime

The active Vault owns a child scope and one recursive root watch. Subscribe to
FileChanged before watch creation, then scan after watch establishment. Match
both Vault and watch IDs. Coalesce refresh requests while refreshing, refresh
parents before cached descendants, invalidate removed subtrees and reject stale
directory responses. Native notifications are hints rather than transactions.

Closing/collapsing the panel unmounts the renderer while retaining tree expansion,
selection, cut/copy buffer and creation/deletion draft in the controller. Reopening
mounts a new tree from that state. These values are in memory for the active Vault;
they are not persisted across application/plugin restart or a Vault replacement.
Switching/closing Vault cancels the old scope and clears its model. Old callbacks
and asynchronous results cannot update a replacement Vault or redirect operations.
An already-submitted native filesystem operation can complete in its original
Vault; cancellation does not claim filesystem rollback.

Cleanup removes the Sidebar registration, owned watcher and localization through
public ownership signals. Cleanup never invokes the stopped consumer's SDK handles.
Live-provider/native cleanup owns watcher release; native session cleanup remains
the final shutdown safety net. Logger uses the controller plugin ID, records
readiness, operation outcomes and original failures, and does not log file contents
or clipboard data.

## Renderer contract

The role is defined by Mantine components; the normal consumer is the explorer
controller. Props:

- `vaultId`, controlled `data` nodes `{ id, name, kind, children? }`, `expanded` and
  `selection` path arrays; directories always have a children array, including
  unloaded/empty folders.
- `busy`, `loading`, `canPaste`, localized `error`/`degraded`, and the localized
  `text` map supplied by the controller catalog.
- `initialDraft: { form, name }`, where form is null, `{ kind: file|folder, parent, initialName? }`
  or `{ kind: delete, paths }`; `onDraft(draft)` retains logical drafts outside the
  mounted view. It captures data only and never calls rendering synchronously.
  Optional `initialName` preserves the draft's sort position across remounts.
- `onToggle(path, open)`, `onSelection(paths)`, `onBuffer(paths, cut)`, `onRefresh()`.
- Async boolean-result callbacks `onCreate(parent, name, directory)`,
  `onRename(path, name)`, `onMove(paths, destination)`, `onPaste(destination)` and
  `onRemove(paths)`. False retains appropriate recovery UI; errors are localized
  by the controller, not interpreted by the renderer.

Workspace injects its reserved context. SDK updates occur outside React effects.
Theme and locale updates preserve input nodes/drafts. The tab selector stays inside the explorer root; shared context menus stay inside
the provider-owned overlay. Row truncation retains full paths in native tooltips; focus,
selection, drop cursors and drag previews use semantic theme colors. Native
scrollbar chrome stays hidden while scroll/keyboard access remains available.

## Integration and verification

Completed: Tauri registers/starts the controller and grants its filesystem/Vault
permissions; Sidebar mounts the role through Workspace; Mantine supplies the
Arborist renderer; localization, Logger and owned filesystem observation are wired
through public contracts. Required product file operations are connected.

Outstanding: document/editor opening. No document-opening contract/provider or
editor currently exists, and this implementation does not claim file activation
opens an editor. Future integration must use a public contract taking explicit
`{ vaultId, path }`, with document identity and dirty-document decisions owned by
the document layer. System clipboard import/export and cross-Vault transfers are
also outside this version.

Run `npm run file-explorer:check` for controller/model, real Arborist/Mantine,
Sidebar and affected host tests, TypeScript and dependency boundaries. Coverage
includes a 10,000-entry directory and bounded rendered rows, SDK registration,
localization, Vault switches, stale callbacks, restart, file policy/conflicts,
partial batches, draft preservation and deletion confirmation. Run
`npm run build --workspace @lunaris/tauri` and `npm run audit` for the production
frontend and public exports/documentation. Filesystem ownership regressions run
with `node tools/scripts/check.mjs filesystem-provider tauri-filesystem`.

Manual acceptance: run `npm run tauri:dev`, open a disposable Vault and check
short/narrow windows, long/deep names, themes, keyboard navigation, right-click,
Ctrl/Shift selection, F2, creation, drag/drop to root/folders, copy/cut/paste,
collision/partial failure, explicit permanent-delete confirmation, external
filesystem changes, panel collapse/reopen and Vault switching. Desktop automation
is prohibited; JSDOM cannot verify physical drag/drop or WebView geometry.

Folder rows select on a single click and toggle on double click or disclosure/Enter. Selection does not change folder geometry before dragging. The header contains a localized Tabs dropdown with Files as its sole current item, without a title or operation buttons. The Workspace Vault name appears in an initially expanded root directory row containing the controller tree. This renderer-owned row cannot be renamed, dragged, copied, cut or deleted and exposes only root-appropriate context-menu operations. Its synthetic identity never reaches controller selection, buffer or mutation callbacks; drop destinations map to the public empty root path. Root disclosure is local view state and resets to expanded on remount. A transient mismatch between Workspace context and controller Vault props shows loading without mounting the old tree or its operations.
