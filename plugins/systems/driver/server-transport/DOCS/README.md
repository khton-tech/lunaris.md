# server-transport

Provides the ServerTransport public SDK contract. See [remote contracts](../../../../../DOCS/reference/remote.md) for API methods and ownership.

Required Logger reports readiness, meaningful state changes, degradation and failures
without passwords, tokens, file contents or display paths. Access to dependencies
uses ctx.use; subscriptions and platform resources belong to SDK scopes.

Integration: composed with Filesystem Router, Vault Manager and account access UI.
The transport driver owns HTTP and credentials; account-session gates connection
changes through Vault.close. Remote filesystem owns account-bound attachments and
rescan observations. Browser storage persists device configuration and revisioned
drafts in IndexedDB; drafts-provider validates stable document identities.

Current tests cover the module's lifecycle and failure boundaries. Product visual
acceptance is pending host integration.

## Connection snapshot

Provides ConnectionStatus 1.0 from @lunaris/remote with account.access. current() returns null before server selection or after connection-owner cancellation; otherwise frozen { server, epoch, state }. State is unknown until a request outcome, then connected/offline/expired. This is the last observed request outcome, not a heartbeat or live reachability guarantee. Subscribe to ConnectionChanged and AccountSessionChanged before reading; match server and account session epoch. No credentials are exposed.
