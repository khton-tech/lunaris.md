# Slot provider

Purpose: own portable named UI regions independently of browser rendering,
themes, components and host internals. Provides `api:lunaris.slots@1.0.0` with
`create(request, owner)`, `get(id)` and `list(parent?)`. Requires Logger and
`api:lunaris.slot-driver@^1.0.0`, plus a host grant for `ui.surface`.

Consumers import `Slots` from `@lunaris/slots`, declare its API in their manifests,
and pass `ctx.signal` or an owned child scope's signal to allocation. IDs should
use the consumer's plugin namespace. Slot lifetime includes all descendants;
owner cancellation releases them without invoking SDK handles during cleanup.
The plugin subscribes to no SDK events. Runtime ownership uses abort listeners.

See [the complete contract and examples](../../../../DOCS/reference/slots.md).
Run `npm run slots:check` from the repository root.
