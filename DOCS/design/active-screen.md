# Active screen

Status: original milestone accepted by the Owner and implemented on 2026-11-07.
The [public reference](../reference/active-screen.md) covers the subsequent tab
strip and current behavior.

## Accepted scope

The first milestone is an independent active-screen plugin, not Settings or an
editor. Show one screen at a time without a tab strip. Switching screens retains
their state within the current Vault. Future user settings apply immediately and
exclusively to the current Vault; settings implementation is a later milestone.

## Existing services and missing contract

Workspace supplies the application layout, Vault lifecycle, main region and side
regions. Its main registrations are concurrent components, not selectable screens.
Components supplies owned mounts and updates. Mantine supplies all product visual
roles. SDK scopes, Logger, Localization and Vault events already exist.

There is no public active-screen registry or selection API. Do not implement
selection by manipulating another plugin's DOM, abusing Workspace registration
order, or importing another plugin's implementation. Add the public contract first.
No kernel runtime changes are proposed.

## Proposed SDK surface

Add `@lunaris/active-screen`, exporting `ActiveScreen` API and
`ActiveScreenChanged` event, both version 1.0.0.

```ts
interface ScreenDefinition {
  readonly id: string;
  readonly componentId: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

interface ScreenSnapshot {
  readonly screens: readonly ScreenDefinition[];
  readonly activeId: string | null;
}

interface ActiveScreenApi {
  register(screen: ScreenDefinition, owner: CancellationSignal): ScreenResult;
  update(id: string, props: Readonly<Record<string, unknown>>): ScreenResult;
  select(id: string | null): ScreenResult;
  snapshot(): ScreenSnapshot;
}
```

`ScreenResult` is `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`, with `INVALID_ARGUMENT`,
`ALREADY_REGISTERED` and `NOT_FOUND` codes. `CancellationSignal` comes from
`@lunaris/sdk`.

- Registration declares an available screen but does not activate or mount it.
  Consumers explicitly select it. Duplicate IDs never replace an owner.
- IDs and role IDs use the existing dotted-ID grammar. Descriptions and props
  must be plain data-property records; reject accessors, unknown descriptor keys
  and reserved `workspace` props. Copy and freeze records and top-level props,
  preserving callbacks and nested values consistently with Components/Workspace.
- Update replaces custom props without changing ID, role, owner or selection.
- Selection is idempotent. Unknown IDs fail without changing the active screen.
  `select(null)` hides all screens while retaining already mounted instances.
- Snapshot is immutable and preserves registration order. Selection is logical:
  successful selection does not guarantee an available or successfully mounted role.
- Owner cancellation unregisters its screen and disposes any mounted instance.
  Removing the active screen clears selection; do not select an arbitrary screen.
  Old ownership callbacks must not remove a new registration with the same ID.
- `ActiveScreenChanged` publishes the committed frozen snapshot after registration,
  update, actual selection change and removal. Consumers subscribe before reading.
  Publish without waiting for observers inside registry mutations.

## Plugin boundaries

1. `plugins/UI/active-screen-provider`: portable registration/selection service,
   requiring Logger, Vault and VaultChanged with `vault.access` for selection reset. It
   provides the new SDK API/event and owns no DOM or storage.
2. `plugins/UI/active-screen`: container controller, requiring Logger,
   ActiveScreen/ActiveScreenChanged, Workspace, Components/ComponentsChanged and
   Localization/LocaleChanged. It registers one main component through Workspace.
3. Extend `plugins/UI/mantine-components` with `lunaris.active-screen`:
   a borderless, full-size composition with stable per-screen targets and no tab
   strip, header, card shell or controls. The role lends its owned targets through
   a callback, following WorkspaceLayout. Mount child roles only after the parent
   Components call returns. Business logic stays outside the renderer.

The portable registry does not need DOM permission. The controller uses public
Components with the existing `ui.dom` grant. Every product plugin declares Logger
and logs readiness, selection/registration outcomes, degradation and original
errors with its own `ctx.pluginId`. Cleanup does not call required services after
scope closure.

## Rendering and state lifetime

Mount a screen lazily on first activation. Switching hides the old target without
disposing or recreating its component; preserve local fields, scroll position and
drafts. Hidden screens are inert, absent from accessibility navigation and layout,
and cannot retain keyboard focus. Do not force focus after pointer selection.
Each screen receives the current Workspace context and its own view signal.

Prop/theme/locale updates must preserve target and mounted-instance identity.
Missing or failed active roles show a localized unavailable placeholder and retain
logical selection. Missing roles can appear later. Role removal disposes affected
instances; a replacement may mount again. State retention does not promise survival
of renderer removal, rendering failure, plugin shutdown or application restart.

Workspace view cancellation releases every cached instance. A Vault switch/close
clears screen selection and mounted state, preventing cross-Vault draft leakage;
plugin-owned screen registrations remain available. Rendering must reject stale
callbacks from old views. No Config writes, session persistence, timers or background
screen eviction are included. Screen owners remain responsible for cancelling work
when their view signal closes; hiding alone does not stop a mounted component.

With no active screen, reuse the existing localized Workspace empty presentation
inside the container. No demonstration or fake editor screen ships in production.

## Integration and acceptance

Tauri must compose the provider and container through declared SDK dependencies.
Workspace keeps its layout responsibility and existing main-registration semantics;
the container becomes the default main consumer. Sidebar and File Explorer remain
unchanged in this milestone.

ActiveDocument continues to own the file identity, independently of screen selection.
No editor exists yet, so this milestone does not claim to render file contents or
route file clicks to an editor. Future editor integration must connect
ActiveDocument/ActiveDocumentChanged to a registered editor screen. Future Settings
will register its own screen and use `ActiveScreen.select` when a category opens.
Settings registry, bottom Sidebar placement and theme-engine registration remain
separate milestones.

Targeted automated checks must cover registry validation and ownership, event
reentrancy, no implicit activation, retained instance identity and drafts across
switches, hidden-screen accessibility, update identity, null selection, removal,
missing/replacement/failing roles, Vault switch/close, stale callbacks and shutdown.
Update package references, boundary/check tooling and host composition fixtures.
Native WebView geometry and focus acceptance are manual; desktop automation is
prohibited. Merge into main requires separate Owner approval.
