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
saved. Transport restores before exposing its API, so history and selector can
restore the last remote Vault through existing contracts. Initial state is read
from current(); events report subsequent changes after activation.

Exact-origin validation prevents forwarding credentials to other servers. Startup
reconnect requests have a maximum five-second deadline each. Offline startup
retains the last-known identity for history visibility without bypassing server
authorization; expired/revoked tokens are removed. Successful logout clears the
matching credential, while normal shutdown preserves it. A missing/unavailable
store logs degraded memory-only behavior. Web authentication remains cookie-based.
See the tauri-credentials plugin guide for native build and acceptance details.
