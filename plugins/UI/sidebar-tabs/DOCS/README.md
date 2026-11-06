# Sidebar tab provider

Purpose: own portable sidebar tab registration, ordering and selection independently
of UI, rendering or Vault state. Default export: `@lunaris/sidebar-provider`, ID
`lunaris.sidebar-provider`. Requires Logger only, with no permissions.

Provides `api:lunaris.sidebar@1.0.0`: `register(tab, owner)`,
`update(id, { title, icon, props? })`, `select(id | null)` and `snapshot()`.
Provides `event:lunaris.sidebar-changed@1.0.0` with a frozen `{ tabs, activeId }`
snapshot. Subscribes to no events. Inputs are validated and shallow copied/frozen.

First registration opens automatically. Further additions preserve selection or
collapse. Owner cancellation removes the tab; active removal selects the first
remaining ordered tab, and last removal selects null. Cancellation publishes only
through the provider's still-live event context; dispatch skips stopping consumers.
Cleanup never calls another service/renderer or Logger. Provider shutdown detaches
listeners and clears local data; independent kernel diagnostics cover failures.
Readiness, explicit registrations/selection, updates, rejected inputs and original
event failures use Logger with `ctx.pluginId` as source; no user titles/props are logged.

The separate Sidebar controller consumes these public contracts; tools register
without DOM permission. See the [full API reference](../../../../DOCS/reference/sidebar.md)
for input rules, examples and integration. Run `npm run sidebar:check` for provider,
consumer, UI/host, type and boundary checks.
