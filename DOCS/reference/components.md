# Component provider

## Responsibilities

Required: shared UI components are supplied by component set plugins (the
initial `Mantine components` and any replacement or extension) and are used by
product plugins without importing a particular set. This keeps the interface
consistent: a plugin asks for `lunaris.button`, not for a private button.
Existing: SDK typed APIs/events, owner signals, permissions, Logger, slot DOM
targets and the theme provider. New: `@lunaris/components` contracts and
`@lunaris/component-provider` in `plugins/UI/components`. No SDK/kernel extension
is required.

The provider owns registration, lookup, instance tracking and cleanup. It
contains no components, CSS, theme access or layout behavior and renders nothing
by itself. Component sets own rendering, prop semantics, localization of their
built-in text, and theme application (through `Themes`, per
[the UI guidelines](../UI_GUIDELINES.md)). Consumers own targets (usually slot
targets) and props. Standard SDK provider selection replaces the registry itself.

## Component IDs

IDs are canonical dotted names describing a **role**, not an implementation:
`lunaris.button`, `lunaris.text-input`, `lunaris.list`. Any compatible set may
supply a role; consumers never depend on which plugin supplied it. A role has one
live implementation at a time: a duplicate registration is rejected and never
replaces the existing one. Plugin-specific components that are not shared roles
should use the plugin namespace (`${ctx.pluginId}.preview`). IDs express
attribution, not caller authentication; this is a cooperative local registry.

Each role's props are documented by the set that defines it. The provider does
not validate prop semantics; see "Props" below.

## Registering components (component sets)

Declare `api:lunaris.components@^1.0.0`, the `ui.dom` permission, and Logger.

```ts
import { Components } from "@lunaris/components";

const components = ctx.use(Components);
const result = components.register({
  id: "lunaris.button",
  mount(target, props, signal) {
    const button = target.ownerDocument.createElement("button");
    button.textContent = String(props.label ?? "");
    target.append(button);
    return {
      update(next) { button.textContent = String(next.label ?? ""); },
      dispose() { button.remove(); },
    };
  },
}, ctx.signal);
if (!result.ok) {
  // Log the stable failure code in the set's own context.
}
```

The definition has exactly `id` and `mount`; it is captured once and later
mutation has no effect. `mount(target, props, signal)` renders into the borrowed
target and returns `{ update(props), dispose() }`:

- `update` receives the complete new props (no merging).
- `dispose` removes everything the instance added. It is called at most once.
- `signal` aborts when the instance is released (before `dispose`). Bind event
  listeners, theme subscriptions and timers to it. If `mount` throws, the signal
  is aborted so partially attached content can be rolled back, and `dispose` is
  not called.

Components must only add content inside the target; they must not remove,
restyle or clear the target itself (it may be a shared slot target).

Cancelling the registration owner removes the component and disposes all its live
instances. Stopping the set plugin does this automatically through `ctx.signal`.

## Using components (consumers)

Declare `api:lunaris.components@^1.0.0` and `ui.dom`; optionally declare
`event:lunaris.components-changed@^1.0.0`.

```ts
import { Components, ComponentsChanged } from "@lunaris/components";

const components = ctx.use(Components);
const result = components.mount("lunaris.button", target, {
  label: localization.text("save"),
  onPress: save,
}, ctx.signal);
if (result.ok) {
  result.value.update({ label: localization.text("saved"), onPress: save });
  // Early release; owner cancellation also releases it.
  result.value.dispose();
}
```

| Method | Behavior |
|---|---|
| `register(definition, owner)` | Add one owned implementation. |
| `has(id)` | Whether a component is registered. |
| `list()` | Frozen, lexically sorted registered IDs. |
| `mount(id, target, props, owner)` | Render; returns `MountedComponent` with `componentId`, `update(props)`, `dispose()`. |

Results are `{ ok: true, value }` or `{ ok: false, error: { code, message } }`.
Codes: `INVALID_ARGUMENT`, `ALREADY_REGISTERED`, `NOT_FOUND`, `RENDER_FAILED`.
`update` on a released instance returns `NOT_FOUND`; `dispose` is idempotent.
Technical messages are English diagnostics, not product UI copy. SDK declaration,
permission and provider-availability errors keep normal SDK behavior.

### Props

Props must be a plain object. The provider passes a shallow frozen copy: top-level
keys are fixed at the call, nested values (including callbacks such as `onPress`)
are passed by reference. Accessor properties and `__proto__` keys are rejected.
User-facing text in props is supplied already localized by the consumer.

### Availability

Components can appear and disappear as sets start and stop. If the role is not
registered yet, `mount` returns `NOT_FOUND`. Subscribe to `ComponentsChanged`
(`{ kind: "registered" | "removed", componentId }`) to mount once it appears.
When a component is removed its instances are disposed by the provider; the
consumer's handle becomes inert and the consumer may mount a replacement after a
new `registered` event. There is no automatic remount.

## Lifecycle and diagnostics

Instance owners are live SDK-compatible signals, normally `ctx.signal` or an owned
child scope. Owner listeners are detached on release, so old owners cannot affect
later instances. Provider shutdown disposes every instance, detaches all owner
listeners and publishes nothing afterwards. Cleanup paths make no Logger/SDK calls;
disposal failures during cleanup are rethrown to kernel diagnostics.

Readiness (`COMPONENTS_READY`), registry changes, rejected operations, render/update
failures (`RENDER_FAILED`, with the original error) and disposal failures
(`DISPOSE_FAILED`) use the required Logger. Mount/release traces are `debug`.
Logs contain component IDs, never props.

## Composition, limits and verification

Tauri registers the provider as an entrypoint and grants it `ui.dom`. It starts
empty, so there is no visible change until a component set and consumer are added.
Tauri now also starts [Mantine components](../../plugins/UI/mantine-components/DOCS/README.md),
which registers `lunaris.startup-screen`, `lunaris.vault-selector`,
`lunaris.workspace-header` and `lunaris.workspace-empty` without mounting them. The remaining
standard component catalog, non-DOM renderers, prop schemas, multiple
simultaneous implementations per role and set priority are out of scope.

Run `npm run components:check` for contracts, provider lifecycle, a real component
set plugin, permission denial, import boundaries and type fixtures. The check also
includes affected consumers, so it runs the Tauri host integration test
`hosts/tauri/test/components.test.mjs`. Tests use JSDOM; no desktop automation is
used.
