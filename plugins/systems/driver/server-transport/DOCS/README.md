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

## Public server identity

ServerInfo adds optional name (nonblank, max 80) and description (max 280).
Transport validates supplied fields; legacy discovery may omit them. AccountAccess
passes them as serverName/serverDescription through Components, rendered as plain
text above authentication. No address footer is shown. Mobile uses auto margins
to center the combined identity/form block when space permits, falling back to
scrolling when content exceeds the allocation. No storage changes. Integration
connects server discovery, transport, account controller and UIKit. Native mobile
centering, keyboard-open scrolling and long descriptions require manual acceptance.

## Persistent desktop sessions

SessionCredentials 1.0 is a trusted, replaceable SDK contract (credentials.access /
credentials.native). It stores only the last { server, account, token }; methods
are load(), save(record), and conditional remove(token). The Tauri credential
driver uses OS credential storage, not Config or note files. Passwords are not
saved. Transport publishes its API immediately. Credential loading and reconnect
run in the background after the host reports loaded, outside activation and
application preparation. The factory's optional restoreAfter promise is a trusted
host readiness boundary, not a service dependency. Without it, restoration is
scheduled after activation. Current state may initially be null; AccountSessionChanged
and ConnectionChanged deliver subsequent outcomes through existing SDK contracts.

Local history and selector startup do not wait for a server or credential storage.
Server history becomes visible when background restoration establishes an identity;
it never automatically opens a remote Vault or replaces the user's local selection.
Explicit connection/login/logout and shutdown take precedence over a delayed
credential read. Failed restoration logs recoverable degradation with its error.

Exact-origin validation prevents forwarding credentials to other servers. Background
reconnect uses the normal configured request timeout. Offline restoration
retains the last-known identity for history visibility without bypassing server
authorization; expired/revoked tokens are removed. Successful logout clears the
matching credential, while normal shutdown preserves it. A missing/unavailable
store logs degraded memory-only behavior. Web authentication remains cookie-based.
See the tauri-credentials plugin guide for native build and acceptance details.


## Local startup independence

Integration uses existing ServerTransport, AccountSessionChanged, ConnectionChanged,
remote filesystem and history contracts. Host composition releases background work
only after the local application is loaded. Regression tests cover stalled discovery
and account verification, delayed/rejected credential reads, user replacement,
shutdown, and local read/write through the full desktop composition while remote
work is pending. Native acceptance: start offline with a saved server, open a local
Vault and edit a note; reconnect must not replace the selected local Vault.
