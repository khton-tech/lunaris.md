# Active screen provider

Purpose: maintain a replaceable, DOM-free registry of available screens and one
explicit active selection. The plugin is `lunaris.active-screen-provider`, exported
as the default from `@lunaris/active-screen-provider`.

Provides SDK `ActiveScreen` and `ActiveScreenChanged` version 1.0.0 from
`@lunaris/active-screen`. Requires Logger, Vault and VaultChanged 1.1; the host grants
`vault.access` to subscribe to Vault lifecycle. No storage or rendering is owned.

Methods: `register(description, owner)`, `update(id, props)`, `select(id | null)`
and `snapshot()`. Registration is lazy and does not select. Snapshots and records
are immutable. Ownership cancellation removes the screen; removing the active
screen clears selection without choosing a fallback. VaultChanged clears selection
but retains registrations. IDs express attribution rather than caller isolation.

Events: publishes frozen snapshots on registry mutations and actual selection
changes. Subscribes to VaultChanged. Observers can read or select through the API;
mutations do not await observer work. Normal operations log through required Logger;
owner cleanup uses the provider's live event endpoint and no required services.

See [the public contract](../../../../DOCS/reference/active-screen.md) for input,
errors, rendering integration and verification. Run `npm run active-screen:check`.
