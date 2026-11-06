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
Workspace. Selector handoff releases its child scope. Closing through the
Workspace header calls `Vault.close()`; its committed event restores the selector.
Close is single-flight; failures leave the current screen with a localized retryable
error. External open/switch/close events use the same path.

## Content API

Require `api:lunaris.workspace@^1.0.0` and import `Workspace` from
`@lunaris/workspace`. The provider plugin is `lunaris.workspace-provider`.
Registration itself requires no DOM or filesystem permission.

```ts
const workspace = ctx.use(Workspace);
const registered = workspace.register({
  id: `${ctx.pluginId}.files`,
  componentId: "lunaris.file-explorer",
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

The example role is illustrative: no file explorer ships in this milestone.
New product renderers must be added to Mantine components through shared roles,
following [its guide](../../plugins/UI/mantine-components/DOCS/README.md).
Consumer plugins never import React/Mantine or another plugin's implementation.

| Method | Behavior |
|---|---|
| `register(content, owner)` | Register an ID, component role, optional props and optional order (default 0). Duplicate IDs are rejected. |
| `update(id, props)` | Replace all custom props without changing the ID, role or order. |
| `list()` | Frozen snapshot ordered by order, then registration order. |

Results are `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`. Codes: `INVALID_ARGUMENT`,
`ALREADY_REGISTERED`, `NOT_FOUND`. A successful registration/update accepts the
descriptor; it does not promise that its component is available or rendered.
Input records must be plain objects with data properties, valid dotted IDs and
safe-integer order. Unknown descriptor keys and the reserved `workspace` prop
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

The first version supplies one column of ordered, equally growing content slots.
The header has a separate slot; content order cannot move a panel above it.
No unused sidebar, tabs, status bar, resize controls or decorative chrome is added.
The screen owns `lunaris.workspace.screen` and `lunaris.workspace.content`; content
plugins must use registrations instead of depending on private slot IDs.

`lunaris.workspace-empty` appears when zero components mount successfully,
including registered roles that are missing or fail to render/update. It disappears
when content becomes available and returns when the last content owner stops.
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

## Integration and verification

Completed: Tauri registers both plugins, starts the screen, grants it `ui.dom` and
`vault.access`, and resolves the provider through its required API/event. The screen
uses Vault, Startup, Slots/SlotDom, Components, Localization and mandatory Logger.
Mantine components supplies `lunaris.workspace-header` and `lunaris.workspace-empty`.
Selector hides while a Vault is open and returns after closing. No editor/document
or explorer integration is claimed; these plugins do not exist yet. Future content
plugins connect through Workspace registration and public component roles.

Run `npm run workspace:check` for contracts, registry ownership/restart,
selector handoff, existing/switching/closing Vaults, missing/replacement/failing
roles, placeholders, validation/order, theme/locale updates and shutdown.
Run `npm run build --workspace @lunaris/tauri` for the production frontend.
JSDOM checks do not verify native WebView geometry. Manual acceptance: run
`npm run tauri:dev`, open a Vault, confirm its name, empty-state copy and Close
vault action; close/reopen it, use keyboard navigation and resize to narrow/short
windows. Verify long names, theme inheritance and readable local overflow.
Desktop automation is prohibited and is not used.
