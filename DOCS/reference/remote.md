# Remote service contracts

Durable remote locations include the exact selected server origin and the
account/Vault reference. Only the remote adapter encodes/decodes that format;
consumers keep references opaque. Identical IDs restored on a different server
cannot redirect history to that server. FilesystemSources.locationVisible delegates
history visibility to each backend. Remote history is hidden on logout and for
other accounts/origins, while native unavailable-folder history remains visible.

Account transitions release an active remote Vault through normal guards and keep
a local Vault open. Trash releases only its matching remote Vault. Every successful
login advances the session epoch; stale catalog responses and attachments cannot
survive an account replacement. Optional History integration refreshes cached
visibility through AccountSessionChanged and retains saved references unchanged.

`@lunaris/remote` defines AccountSession, AccountVaults, Drafts and DraftStorage.
These are additive public SDK tokens; they do not implement a server or grant
network access. Account consumers declare `account.access`; draft consumers declare
`drafts.access`. Only a trusted storage driver provides `drafts.storage`.

AccountSession owns connection/login lifetime; connect requires a cancellation
signal. current() contains account and server identities and an epoch, never a
credential. AccountVaults creates account-owned Vaults without a parent folder,
and distinguishes active and trashed records. Catalog IDs are durable; filesystem
attachment IDs remain transient. Consumers open returned locations through Vault.

Drafts keys include server, account, stable Vault ID and relative path. remove
requires the acknowledged revision, preventing late remote saves from deleting
newer local edits. DraftStorage uses the same flat contract behind the provider;
no storage implementation or privileged handles escape through SDK results.

AccountSessionChanged reports identity changes. ConnectionChanged distinguishes
connected/offline/expired for one epoch. Consumers ignore stale epochs. Remote
filesystem failures add OFFLINE, SERVER_UNAVAILABLE, UNAUTHENTICATED,
SESSION_EXPIRED and PROTOCOL_MISMATCH; they never imply successful persistence.

`@lunaris/filesystem` adds defineFilesystemBackend for host-selected backend API
and event tokens. Its flat API includes normal I/O and owned root/location/watch
operations. LocalFilesystemBackend and RemoteFilesystemBackend are distinct
contracts, so a router can acquire both through SDK mediation. FilesystemSources
wraps explicit source locations and exposes capabilities for an attached root.
It does not authorize access based on labels or source strings.

Integration status: transport, account services, remote/backend routing,
IndexedDB drafts, editor recovery and browser/desktop compositions are implemented.
The sibling server stores real files in userData and metadata in SQLite. The
real-server browser integration check exercises opening/editing/offline departure,
draft restoration and conditional saving. Manual browser/WebView visual acceptance
and Docker execution remain outstanding. See [the design](../design/web-server.md).
