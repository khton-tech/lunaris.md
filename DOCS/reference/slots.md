# UI slots

## Responsibilities and boundaries

Required: independent UI plugins allocate named rendering areas without depending
on the host, kernel, or a particular layout implementation. Existing: SDK typed
APIs, scoped cancellation, permissions, Logger, and the host's isolated application
surface. New: portable `@lunaris/slots` contracts, `@lunaris/slot-provider` in
`plugins/UI/layout`, browser-only `@lunaris/slot-dom` contracts, and
`@lunaris/web-slot-driver` in `plugins/systems/driver/web-slots`.
No SDK or kernel extension is required.

The provider owns slot identity, parentage, metadata and ownership. The driver
owns actual DOM targets and structural flex layout. Host composition supplies an
isolated surface to the driver and attaches it through the host view adapter after
successful application startup. Product plugins never import the host or driver.
Replacing a provider or driver uses standard SDK provider selection.

Slots contain no visible labels, borders, padding, colors or default components.
The root is a column named `root`. Consumers create application-specific regions
under it, including nested rows/columns. No sidebar, editor or status-bar regions
are reserved in advance. Appearance and spacing belong to future theme and
component providers, following [the UI guidelines](../UI_GUIDELINES.md).

## Consumer API

Require `api:lunaris.slots@^1.0.0` and acquire `ctx.use(Slots)` from
`@lunaris/slots`. Allocation needs no native/DOM permission.

```ts
import { Slots } from "@lunaris/slots";

const slots = ctx.use(Slots);
const panel = ctx.scope.child();
const result = slots.create({
  id: `${ctx.pluginId}.content`,
  parent: "root",
  direction: "column",
  order: 10,
  grow: 1,
}, panel.signal);
if (!result.ok) {
  // Map the stable error code to the consumer's localized message.
  return;
}

// Release early, or let plugin shutdown release the owned child scope.
await panel.dispose();
```

| Method | Behavior |
|---|---|
| `create(request, owner)` | Synchronously allocate a unique slot and target; return `SlotResult<SlotInfo>`. |
| `get(id)` | Return immutable metadata, or `undefined` after removal. Includes `root`. |
| `list(parent = "root")` | Frozen snapshot of direct children, ordered by `order`, then creation order. Missing parents have no children. |

Requests accept only `id`, `parent`, `direction`, `order`, and `grow`. Defaults are
`root`, `column`, `0`, and `0`. IDs use canonical dotted plugin-style names;
namespace with `ctx.pluginId` to avoid collisions. `root` is reserved. Direction
is `row` or `column`; order is a safe integer; grow is a finite nonnegative number.
Inputs are copied, property accessors and unknown fields are rejected, and returned
metadata never aliases mutable caller data. IDs express attribution, not caller
authentication: the SDK does not expose authenticated caller identity to providers.

`SlotResult<T>` is `{ ok: true, value: T }` or
`{ ok: false, error: { code, message } }`. Stable codes are `INVALID_ARGUMENT`,
`ALREADY_EXISTS`, `PARENT_MISSING`, and `DRIVER_FAILED`. Duplicate IDs cannot
replace live allocations. Missing parents are rejected without creating a target.
Driver failures leave the registry unchanged and permit a later explicit retry.
Unexpected SDK errors retain normal SDK behavior. Technical messages are not
product UI copy; future presenters own their localization catalogs.

## Browser rendering

UI renderers additionally require `api:lunaris.slot-dom@^1.0.0`, declare and obtain
`ui.dom`, and import the shared token from `@lunaris/slot-dom`:

```ts
import { SlotDom } from "@lunaris/slot-dom";

const targets = ctx.use(SlotDom);
const target = targets.get(`${ctx.pluginId}.content`);
if (target) {
  const content = target.ownerDocument.createElement("div");
  // Obtain user-facing text from Localization; never inject it as HTML.
  target.append(content);
  ctx.scope.own({ dispose() { content.remove(); } });
}
```

`get(id)` returns a borrowed `HTMLElement`, or `undefined`. Consumers may mount
their own content and own its teardown. They must not remove/reparent the slot
target, clear a shared ancestor, or change structural styles (`display`, direction,
flex sizing, order, overflow, minimum sizes). The slot may contain child slots.
Do not retain a borrowed target across removal/reallocation; an old node remains
detached even if another allocation reuses its ID. DOM access is cooperative
in-process access, not an isolation boundary.

Web, Tauri and Capacitor WebViews can share this DOM driver; this milestone only
composes it in Tauri. Other rendering platforms implement `SlotDriver` and expose
their own renderer contract without introducing platform types into `Slots`.

## Ownership and cleanup

The owner must be a live SDK-compatible cancellation signal, normally `ctx.signal`
or an owned child scope's signal. Cancelling it removes the slot and every
descendant, even when descendants have different owners. Child owner signals
themselves are not cancelled: consumers must treat missing parents/targets as
unavailable and own teardown of their content independently. Choose an application
region's lifetime to cover its mounted consumers. No slot-change event or automatic
remount is promised in this first version.

Listeners for removed descendants are detached, so aborting an old child owner
cannot remove a later allocation with the same ID. Registry shutdown also removes
all its targets, including allocations with external owner signals. Driver shutdown
removes its root and all descendants. Cleanup only changes local state and DOM;
it never calls SDK API handles or Logger. Kernel diagnostics cover cleanup failures.
Provider/driver readiness, allocation traces, rejected operations and DOM failures
use the required Logger; DOM failures retain the original error.

The internal `SlotDriver.create(slot, owner, registry)` contract requires
`ui.surface` on both sides. Implementations must remove descendants and detach
listeners when either owner or registry aborts, reject duplicate/missing parents,
and roll back target creation on failure. The driver must supply `root` before
advertising readiness. The browser driver separately provides `SlotDom` with
`ui.dom`. Consumers normally use `Slots`, not `SlotDriver` directly.

## Composition, limits and verification

Tauri registers the provider and a fresh driver for each composition attempt,
grants the provider `ui.surface`, grants the driver `ui.surface`/`ui.dom`, and starts
the provider alongside Config and Localization. The host keeps its independent
System/recovery controls. A successful startup currently shows an empty product
surface; the first visible product UI plugins are separate work.

Targets use shrinkable flex layouts, zero automatic minimum sizes and overflow
containment. DOM order matches visual order for keyboard traversal. No fixed panel
dimensions or decoration are introduced. Arbitrary grid tracks, resize handles,
reparenting, metadata updates, persistence, tab selection and cross-plugin mount
discovery are deferred. Reconfigure a region by releasing its child scope and
allocating it again. Themes, component management and standard components remain
separate plugins.

Run `npm run slots:check` for portable contracts, provider, DOM driver, host recovery,
ownership, permission/type fixtures and import boundaries. Run
`npm run build --workspace @lunaris/tauri` for the frontend bundle.
DOM tests use JSDOM; no desktop automation is used. Actual layout, scrolling and
keyboard behavior in a WebView still require manual acceptance: run
`npm run tauri:dev`, check System/back and retry/exclusion recovery, and check
viewport resizing after mounting the first visible UI consumers.

Local evidence, 2026-11-05: `npm run slots:check` passed 61 targeted tests with
zero skipped, including host integration, contract types and import boundaries.
The CI scope-selection test, frontend production build and documentation link
audit passed. No native window was launched; physical WebView layout/scrolling
and remote CI execution are not claimed.
