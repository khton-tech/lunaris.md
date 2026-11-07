# Workspace

## Responsibilities and composition

Required: hand an opened Vault to an extensible working surface, show a placeholder
until content is available, and release old views on switching or closing.
Existing: SDK APIs/events, owned scopes, Vault, Slots/SlotDom, Components,
Localization, Startup and Logger. New: portable `@lunaris/workspace` contracts,
the content provider in `plugins/UI/workspace-content`, the screen controller in
`plugins/UI/workspace`, and two Mantine component roles. The SDK/kernel runtime
and slot contracts are unchanged.

The content provider owns registrations independently of rendering. The screen
controller consumes that provider and owns per-Vault slots and mounted views.
Mantine components owns all visible controls and appearance. Tauri composes the
three through public contracts; the selector never imports Workspace.

Tauri enables `createVaultSelector({ art, hideWhenVaultOpen: true })`. After
`Startup` reaches `loaded`, no Vault shows the selector and an open Vault shows
Workspace. Selector handoff releases its child scope. Workspace has no top header,
Vault-name row or close action. Closing through a public Vault service consumer
restores the selector after the committed event. External open/switch/close events
control the same screen lifecycle.

## Content API

Require `api:lunaris.workspace@^1.1.0` and import `Workspace` from
`@lunaris/workspace`. The provider plugin is `lunaris.workspace-provider`.
Registration itself requires no DOM or filesystem permission.

```ts
const workspace = ctx.use(Workspace);
const registered = workspace.register({
  id: `${ctx.pluginId}.files`,
  componentId: "example.main-content",
  order: 10,
  props: { title: localization.text(ctx.pluginId, "files") },
}, ctx.signal);
if (!registered.ok) {
  logger.warn(ctx.pluginId, "Cannot register workspace content", {
    code: registered.error.code,
    error: registered.error,
  });
}
```

The example main-content role is illustrative. The implemented file explorer
registers through Sidebar instead; see [its reference](file-explorer.md).
New product renderers must be added to Mantine components through shared roles,
following [its guide](../../plugins/UI/mantine-components/DOCS/README.md).
Consumer plugins never import React/Mantine or another plugin's implementation.

| Method | Behavior |
|---|---|
| `register(content, owner)` | Register an ID, component role, optional props/order and region (default main). Duplicate IDs and occupied side regions are rejected. |
| `update(id, props)` | Replace all custom props without changing the ID, role or order. |
| `list()` | Frozen snapshot ordered by order, then registration order. |

Results are `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`. Codes: `INVALID_ARGUMENT`,
`ALREADY_REGISTERED`, `REGION_OCCUPIED`, `NOT_FOUND`. A successful registration/update accepts the
descriptor; it does not promise that its component is available or rendered.
Input records must be plain objects with data properties, valid dotted IDs and
safe-integer order. Optional region is main/left-rail/left-panel; optional onDismiss is a callback. Unknown descriptor keys and the reserved `workspace` prop
are rejected. Descriptor and top-level props are copied and frozen; nested prop
values and callbacks retain their identity, matching Components semantics.
IDs provide attribution, not authenticated caller isolation.

The provider publishes `event:lunaris.workspace-changed@1.0.0` with frozen
`{ kind: "registered" | "updated" | "removed", id }`. Observers subscribe before
reading `list()`. Content plugins normally need only the API: Workspace manages
their mounting and Vault transitions. Registrations may precede startup completion
or Vault opening. Owner cancellation removes a registration; stopping a consumer
cannot leave its content attached.

## Rendering and ownership

Each role receives its registered props plus a reserved, frozen context:

```ts
{ ...props, workspace: { vaultId, vaultName } }
```

Treat `workspace.vaultId` as the explicit target for document/filesystem services.
The role's mount signal owns its current view. Switching Vaults cancels every old
view before creating fresh instances; callbacks and asynchronous work must honor
that signal. Registrations persist across Vault switches, but rendered instances
do not. Closing removes the entire screen and its descendants.

Workspace 1.1 supplies main, left-rail and left-panel regions. Main accepts ordered,
equally growing components; each left region accepts one owner and rejects a second
with REGION_OCCUPIED. Existing 1.0 descriptions default to main. The optional
onDismiss callback on left-panel handles Escape; Workspace owns no tab selection.
The separate [Sidebar](sidebar.md) registers its rail and active tool through these
regions. No left registrations means no reserved width. On narrow containers the
left panel overlays main inside the owned layout; scrolling stays region-local.

The composite layout has SDK-owned Slots. The public
lunaris.workspace-layout Components role lends stable main/left targets after mount
and keeps them unchanged on updates. Workspace mounts content through Components
after the layout call returns, and releases old views when the role is replaced.
Consumers never reach into the host or restyle/reparent Slots. The screen owns
lunaris.workspace.screen and lunaris.workspace.content; content plugins use public
registrations rather than private slot IDs. Changes to a region's ordered content
set can remount that region; props updates preserve its existing views.
Workspace owns shared side-region sizing; tab management and status-bar behavior
remain outside its scope. The layout role accepts optional `panelWidth` (pixels),
localized `resizeLabel` and `onPanelWidth(width)` props. Mantine Splitter supplies
pointer and keyboard resizing without replacing the borrowed targets. Arrow keys
resize by 8px (Shift: 32px), Home/End select the constraints, and double-click
restores the default size. Width is constrained to available space while reserving
main content; narrow containers keep a bounded overlay and hide the separator.
Viewport fitting does not overwrite the user's preferred width.

Temporary Owner-directed interaction policy: Workspace suspends Tab/Shift+Tab
traversal while its layout is mounted, including events starting on the document
body or a context-menu overlay. Pointer controls, arrow navigation and explicit
editor focus still work. The owned document listener is removed when Workspace
closes, leaving selector/recovery navigation unchanged. This is an explicit
temporary policy until the final focus traversal design is implemented.

The screen requires Config/`config.access`, restores `sidePanelWidth` from its
global plugin namespace, and writes only committed drag/keyboard changes. This
preserves width across collapse, Vault changes and application restart. Invalid
values use the default 288px. Storage failures log warnings and leave resizing
usable; cleanup makes no Config calls.

`lunaris.workspace-empty` appears in main when zero main components mount successfully,
including registered roles that are missing or fail to render/update. It disappears
when main content becomes available and returns when its last owner stops.
Sidebar content never suppresses the main placeholder. A failed left-panel renderer
gets its own localized failure placeholder.
Failed/missing views do not reserve empty slots. `ComponentsChanged` supports
late and replacement renderers. Component failures log diagnostics; no raw errors
or Vault paths appear in the product UI. Header and empty-state text use the
Workspace catalog, while registered props remain the content plugin's responsibility.
Themes update through Mantine components; locale changes update owned text.

Scope cleanup only releases local resources. Content-owner cleanup changes the
provider registry and publishes through its own still-live SDK context, following
the existing Components/Themes provider pattern. SDK dispatch skips stopping
screen consumers, so cleanup never invokes rendering or required services directly.
Provider/screen scope closure prevents subsequent SDK calls. Cleanup failures are
covered by independent kernel diagnostics.

The separate [active-screen container](active-screen.md) now registers as the default
main consumer in Tauri. It owns one selected screen and retains hidden views;
Workspace retains its existing concurrent registration and layout contracts.

## Integration and verification

Completed: Tauri registers both plugins, starts the screen, grants it `ui.dom` and
`vault.access`/`config.access`, and resolves the provider through its required API/event. The screen
uses Vault, Startup, Slots/SlotDom, Components, Config, Localization and mandatory Logger.
Workspace uses Mantine roles `lunaris.workspace-empty` and `lunaris.workspace-layout`.
The reusable `lunaris.workspace-header` role remains available for other consumers
but is not mounted by the default Workspace. The independent Sidebar uses the new side regions.
Selector hides while a Vault is open and returns after closing. The shared [active-document service](active-document.md) now owns file identity
and restoration; editor rendering remains outstanding because no editor plugin exists. The file explorer is now
connected through Sidebar and does not occupy main. Future content
plugins connect through Workspace registration and public component roles.

Run `npm run workspace:check` for contracts, registry ownership/restart,
selector handoff, existing/switching/closing Vaults, missing/replacement/failing
roles, placeholders, validation/order, theme/locale updates and shutdown.
Run `npm run build --workspace @lunaris/tauri` for the production frontend.
JSDOM checks do not verify native WebView geometry. Manual acceptance: run
`npm run tauri:dev`, open a Vault and confirm the layout fills the product surface
without a top Vault-name/Close vault row. Check empty-state copy, keyboard navigation,
narrow/short windows, theme inheritance and readable local overflow.
Desktop automation is prohibited and is not used.
