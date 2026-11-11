# Active screen

The active-screen container occupies Workspace main and displays one selected
screen below its tab strip. Workspace owns the main region and Sidebar layout.
ActiveDocument owns file identity and guards document transitions.

## Public SDK contract

Import `ActiveScreen` and optionally `ActiveScreenChanged` from
`@lunaris/active-screen`, declaring the corresponding API/event at `^1.0.0`.
Registration itself requires no DOM permission. Product plugins require Logger.

```ts
const screens = ctx.use(ActiveScreen);
const registered = screens.register({
  id: `${ctx.pluginId}.screen`,
  componentId: "example.screen-view",
  props: { title: localizedTitle },
}, ctx.signal);
if (!registered.ok) {
  logger.warn(ctx.pluginId, "Cannot register screen", { error: registered.error });
  return;
}
screens.select(`${ctx.pluginId}.screen`);
```

The example role is illustrative. Register real product roles through Mantine
components. Screen consumers never import React/Mantine or another plugin's
implementation. Custom props may contain callbacks; data and translations belong
to the contributing plugin.

| Method | Behavior |
|---|---|
| `register(screen, owner)` | Register an owned `{ id, componentId, document?, props? }` without selecting or mounting. |
| `update(id, props)` | Replace custom props without changing identity, role, ownership or selection. |
| `select(id)` | Activate a registered screen; selecting it again does nothing. |
| `select(null)` | Hide screens, retain already mounted instances, show the empty state. |
| `snapshot()` | Frozen `{ screens, activeId }`, preserving registration order. |

Mutations return `{ ok: true, value: null }` or `{ ok: false, error: { code,
message } }`. Codes: `INVALID_ARGUMENT`, `ALREADY_REGISTERED`, `NOT_FOUND`.
Selection accepts registered IDs or null; unknown IDs preserve selection.
Selection success describes logical state, not rendering success.

Descriptors use dotted IDs and plain data-property records. Reject unknown
descriptor keys, symbols, accessors and reserved `workspace`/`__proto__` props.
Copy/freeze descriptors and top-level props; callbacks and nested values retain
identity, consistently with Components/Workspace. IDs express attribution, not
authenticated caller isolation.

Set `document: true` when the role displays the current ActiveDocument. The
container opens a tab for each file activated on that screen and reuses its mounted
role. Other screens open one tab per registration. Supply a localized
`props.tabTitle` when the tab needs a stable name while the screen title changes.
The container falls back to `props.title` and then to a localized generic title.

Owner cancellation removes the registration and any cached view. Removing the
active screen clears selection; another screen is never implicitly selected.
An old owner's callback cannot remove a subsequent registration of the same ID.
`ActiveScreenChanged` publishes a committed frozen snapshot after accepted
registration/update/removal and actual selection changes. Subscribe before reading
`snapshot()`; re-read it in observers rather than relying on earlier payloads.
Mutations do not await observers; observers may use the API without queue deadlock.

## Rendering and lifetime

The container mounts a role lazily on first activation. Later screen switches
retain the component, its draft fields, target and scroll position. Hidden targets
are absent from layout and accessibility navigation and are inert. Focus inside a
screen is released before hiding it; pointer selection does not force focus into
the next screen. There is no automatic background eviction or timer.

Roles receive `{ ...props, workspace: { vaultId, vaultName } }` and an owned view
signal through Components. Prop/theme/locale changes preserve the mounted target.
The container supplies `presentation: { mode: "embedded", sizing: "fill" }` after
custom props, including for its layout and placeholders. The owning Workspace
surface remains visible beneath all screen roots.
Hiding does not abort the view signal or suspend background work; screen authors
must design their own operation lifetime accordingly.

Missing/failed active roles keep logical selection and show a localized unavailable
state. Late/replacement roles can mount; a later props update can retry failed
rendering. Failed updates release the failed instance. Removing the parent layout
releases cached views and shows a fallback until a replacement is available.
Retention does not cover renderer replacement, failures, owner removal, layout
remount, application restart, Vault switches or closure.

VaultChanged clears selection. Reads and selections also check the current Vault,
so earlier Workspace event observers cannot mount the old selection in a new Vault.
Workspace releases every view on Vault switch/close;
plugin-owned registrations remain available for explicit selection in a new Vault.
Old view callbacks cannot attach targets to a new view. The tab list and history
are session state. ActiveDocument continues to persist and restore its current
file per Vault, which opens its tab on restore.

## Composition and integration

The shared Web and Tauri host composes `lunaris.active-screen-provider` and
`lunaris.active-screen`.
The provider requires Logger, Vault and VaultChanged, with `vault.access`. The controller
requires Logger, ActiveScreen/ActiveScreenChanged, Workspace 1.1,
Components/ComponentsChanged and Localization/LocaleChanged, with `ui.dom`.
The host also grants `vault.access` and `filesystem.access` for the Vault,
ActiveDocument/ActiveDocumentTransitioned and BeforeFileMutation integration.
Both use `ctx.use` and mandatory structured logging; cleanup uses local resources
and independent kernel diagnostics rather than closed SDK handles.

Mantine supplies `lunaris.active-screen` with stable owned targets and the tab
controls. The controller mounts screen roles after the layout call returns and
supplies a reserved placeholder target. See the
[container guide](../../plugins/UI/active-screen/DOCS/README.md) for interactions,
ownership, and links to the component role props.

File Explorer opens files through ActiveDocument. The editor selects its registered
screen and maintains document sessions. Settings selects its own screen and retains
the selected category while another tab is visible. The container coordinates
these existing SDK entry points.

## Verification

Run `npm run active-screen:check` for public contracts/types, provider ownership,
selection, retained drafts/scroll/instances, hidden-state accessibility, locale/theme
updates, missing/replaced/failing roles, parent replacement, stale target callbacks,
Vault lifecycle and cleanup. Run `npm run build --workspace @lunaris/tauri` for the
production frontend. Check tooling includes affected consumers, boundaries and
type fixtures; desktop automation is prohibited.

Manual acceptance covers the screenshot geometry, theme inheritance, overflow in a
narrow or short window, focus and disabled controls in the composed Workspace.
