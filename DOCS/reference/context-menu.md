# Context menu

## Responsibility and integration

`@lunaris/context-menu` defines the public SDK contract `ContextMenu`
(`api:lunaris.context-menu@1.0.0`). `lunaris.context-menu-provider` in
`plugins/UI/context-menu` owns contributions, immutable menu sessions, action
dispatch and one document overlay. It requires Logger, Components,
ComponentsChanged and `ui.dom`. It provides no events. No SDK/kernel changes
are required. Other plugins import contracts, never provider implementations.

The Mantine component plugin supplies the replaceable `lunaris.context-menu`
role. It owns Mantine Menu/Sub rendering, hover disclosure, keyboard navigation,
viewport collision handling, local overflow and theme inheritance. The provider
owns a body-level overlay so menus escape tool-panel clipping. The renderer stays
inside its borrowed target. Controls use the current theme; labels come already
localized from contributors. See [Mantine Menu](https://mantine.dev/core/menu/)
and the [Mantine UI composition catalog](https://ui.mantine.dev/category/buttons/).

## Register contributions

Declare `api:lunaris.context-menu@^1.0.0` and the mandatory Logger dependency.
Contribution-only consumers need no DOM permission.

```ts
import { ContextMenu } from "@lunaris/context-menu";

const menus = ctx.use(ContextMenu);
const registration = menus.register({
  id: `${ctx.pluginId}.file-tools`,
  build(context) {
    if (context.source !== "lunaris.file-explorer" || context.target !== "file") return [];
    return [{
      kind: "group", id: `${ctx.pluginId}.tools`, label: localizedToolsLabel,
      children: [{
        kind: "action", id: `${ctx.pluginId}.inspect`, label: localizedInspectLabel,
        run(invocation) { return inspectFile(invocation.data); },
      }],
    }];
  },
}, ctx.signal);
```

Check the result and log failures through the consumer's Logger. `register`
captures the contribution ID and build callback. Duplicate contribution IDs are
rejected. Its returned `dispose()` removes it early; owner cancellation removes
it automatically. `build(context)` runs synchronously for every opening, so labels,
visibility and disabled state can reflect current application state. Return `[]`
to hide a contribution. Build callbacks should only describe commands, with no
external effects. Actions may return void or a promise. Contributors remain
responsible for checking their business preconditions when commands execute.

Entries have `kind: action|group`, globally unique `id`, localized `label`, optional
numeric `order` (default 0), `icon` (a public Lucide role name) and `disabled` (default false). Actions require
`run(context)`; groups require `children` and may contain nested groups. Empty
groups are hidden. Unavailable actions and disabled groups are omitted from the
resolved presentation, and groups whose children are all unavailable disappear.
Hidden actions remain guarded against programmatic execution. Icons default to
`actions` for actions and `folder` for groups. File Explorer uses `file-plus`,
`folder-plus`, `rename`, `copy`, `cut`, `paste`, `trash` and `refresh`.
Each level sorts by
ascending order, preserving insertion order for ties. Maximum nesting is 32;
cycles, duplicate IDs and malformed trees fail the opening without executing any
action. Group trees belong to their contribution; cross-contribution insertion
into another group's internals is not part of version 1.

## Open and resolve

`open({ target, x, y, label, context, entries? }, owner)` opens the shared role.
`target` is a connected source/focus element; x/y are viewport coordinates.
`label` is an accessible localized menu name. `context` contains string `source`
and `target` identifiers plus application-specific plain-object `data`.
`entries` optionally supplies built-in, view-local actions alongside registered
contributions, without registering transient renderer callbacks globally.

Context and its data object are shallow copied/frozen. Callers must own nested
data immutability. Context IDs are cooperative routing metadata, not identity
authentication or permission grants. Sensitive data should not be included.

The returned session has frozen `items`, `execute(id)` and idempotent `dispose()`.
Opening another menu closes the previous overlay. Escape/outside clicks, owner
cancellation and removal of the renderer release the overlay. Focus returns to
the source when it is still connected and its owner remains live. An empty menu
creates no overlay. A missing renderer returns `UNAVAILABLE`; consumers may retry
after ComponentsChanged reports the role available.

`resolve(context, owner, localEntries?)` creates the same session without rendering
or replacing the open overlay. It supports alternative renderers and targeted
tests. Always dispose resolved sessions when their view closes.

An action can execute once per session. Disabled actions, expired sessions and
commands from removed contributions cannot execute. A started asynchronous action
may finish after its menu closes; contributors own cancellation of their work.
Opened menus release their overlay and restore source focus before dispatching
the command, so an editor opened by that command keeps its own initial focus.
Owners are checked again at the dispatch boundary.
Provider shutdown disposes sessions and registrations without SDK/logging calls.
Runtime callback errors retain their original error in Logger diagnostics.

Results use `{ ok: true, value }` or `{ ok: false, error: { code, message } }`.
Codes: `INVALID_ARGUMENT`, `ALREADY_REGISTERED`, `NOT_FOUND`, `UNAVAILABLE`,
`BUILD_FAILED`, `ACTION_FAILED`. Messages are English diagnostics, not UI copy.

## File explorer integration

Tauri includes the provider and grants `ui.dom`; the explorer requires ContextMenu
and opens it through its controller. Mantine, Components, Logger and file-explorer
integration is complete. No other existing plugin needs to register actions.

The explorer publishes `source: lunaris.file-explorer`; `target` is `file`,
`directory`, `symlink`, `other`, `root` or `background`. Its data contains:

| Field | Meaning |
| --- | --- |
| `vaultId` | Explicit Vault identity |
| `path` | Vault-relative target path; empty string for root, null for background |
| `selection` | Frozen paths of the invocation selection; empty for root/background |
| `destination` | Vault-relative directory for creation/paste |

Menus use compact regular-weight rows with leading Lucide icons, a subdued
boundary, no shadow, and the Files dropdown's quiet hover/pressed palette.
Right-clicking a selected row preserves multi-selection. An unselected row is
selected first. Root/background menus offer root creation/paste/refresh without
exposing the synthetic root ID to mutations. With an empty clipboard, root and
background show only New file, New folder and Refresh; Paste appears when
available. File targets and multi-selection omit creation, paste and refresh;
single-folder targets retain these directory operations. Root/background invocation
clears previous file selection. Menu actions retain their invocation
selection, including while focus moves to the overlay. Controller updates, Vault
replacement and view disposal close obsolete menus. Keyboard shortcuts retain
their existing behavior; ContextMenu/Shift+F10 open at the focused row.

File Explorer and Text Editor open their product context menus from desktop
pointer and keyboard input. On touch-first and mobile browsers/WebViews both
triggers defer to the platform. Touch context gestures are also left to the
platform on hybrid desktops. These checks happen before selection mutation or
event cancellation. The provider API stays available to explicit callers.

## Verification

Run `npm run context-menu:check` for contract/type fixtures, provider ownership,
origin filtering, nesting/order, disabled/expired commands, errors, overlays,
real Mantine menus, explorer integration and affected host checks. Run
`npm run build --workspace @lunaris/tauri` for the production frontend.

Manual acceptance: check physical hover across nested submenus, keyboard arrows,
Escape and focus restoration, long labels, screen edges, short/narrow windows,
theme changes, multi-selection, panel collapse and Vault replacement in
`npm run tauri:dev`. Desktop automation is prohibited; DOM tests do not prove
WebView placement or pointer traversal geometry.

## Icon islands (API 1.1)

MenuEntry/MenuItem now support kind: "island" with id, localized label, children,
optional icon/order/disabled. Islands are top-level siblings of ordinary actions;
children are actions or dropdown groups. Nested islands are rejected. Empty or
unavailable islands disappear. Existing register(), resolve() and open() transport
islands through the same immutable session, duplicate-ID validation, one-shot
execution, ownership and cancellation rules. No extra renderer or controller is
needed to contribute a contextual quick-action strip.

Mantine owns the full overlay: its placement, separate island surface above the
normal action surface, spacing, corners, overflow and icon menu controls. Island
actions have icon-only content, localized title/accessible names and focus feedback.
Dropdown groups have an arrow and use themed Menu.Sub menus. Ordinary actions
retain labels and icons. Arrow keys, Escape, collision handling and source focus
restoration remain shared. Renderer props remain items/x/y/label/onAction/onClose.

Text Editor contributes its formatting island and cut/copy/paste/select-all entries
at invocation through public local entries. The editor owns commands and buffer
selection; ContextMenu owns overlay/session lifecycle; Clipboard owns system text
access. File Explorer contributions remain list menus unchanged. References: the
Owner's requested isolated toolbar, existing Files menus, [Mantine menu](https://mantine.dev/core/menu/)
and [Mantine UI buttons](https://ui.mantine.dev/category/buttons/). Manual acceptance
remains pending for pointer traversal, submenu position at screen edges, light/dark/
XP themes, short/narrow screens and keyboard focus inside the actual editor.

The coordinate anchor intentionally disables hideDetached on the outer Menu: its
source is validated by the provider, and the synthetic point must not suppress the
menu because it has no layout rectangle. Collision positioning remains enabled.
