# Web slot driver

Purpose: render named slots as undecorated, nested flex targets in an isolated
host-owned DOM surface. Trusted composition calls `createWebSlotDriver(surface)`;
product consumers never import this implementation.

Provides `api:lunaris.slot-driver@1.0.0` with `create(slot, owner, registry)` and
`api:lunaris.slot-dom@1.0.0` with `get(id)`. Requires Logger and host grants for
`ui.surface` and `ui.dom`. Shared tokens live in `@lunaris/slots` and
`@lunaris/slot-dom`, respectively. Browser consumers use `ctx.use(SlotDom)` with
`ui.dom` to borrow a target and mount their owned content.

The driver creates `root` on activation. Owner/registry cancellation removes a
target and its descendants; driver shutdown removes all targets. Cleanup detaches
listeners without SDK calls. No SDK events are published or subscribed to.
Appearance, localized content and component cleanup belong to consumers.

See [contracts, restrictions and ownership](../../../../../DOCS/reference/slots.md).
Run `npm run slots:check` from the repository root. DOM tests use JSDOM.
