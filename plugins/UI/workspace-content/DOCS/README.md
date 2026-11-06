# Workspace content provider

Purpose: own portable content registrations independently of UI, Vault lifecycle
and platform rendering. Default export: `@lunaris/workspace-provider`, plugin ID
`lunaris.workspace-provider`. Requires Logger only; no permissions or DOM access.

Provides `api:lunaris.workspace@1.0.0`: `register(content, owner)`, `update(id, props)`
and `list()`. Provides `event:lunaris.workspace-changed@1.0.0`: frozen
`{ kind: "registered" | "updated" | "removed", id }`. Subscribes to no events.
Descriptors declare an ID, component role, optional props and order. Inputs are
validated and shallow copied/frozen. Owner cancellation removes the descriptor.
Registration does not guarantee component availability or successful rendering.

Owner cleanup performs local removal and publishes through this provider's live
event endpoint; it never calls a renderer, Logger or another API. SDK dispatch
skips stopping consumers. Provider shutdown detaches listeners and clears local
state without SDK calls. Meaningful explicit operations, readiness, rejected
requests and original event failures use Logger with `ctx.pluginId` as source;
cleanup errors use independent kernel diagnostics.

The Workspace screen consumes the API/event through the SDK; future content
plugins register component roles there. The provider contains no UI or direct
integration with Mantine/Vault. See the [full reference and usage example](../../../../DOCS/reference/workspace.md).
Run `npm run workspace:check` for ownership, event, restart, rendering and host checks.
