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

## Writer-safe recovery (Drafts and DraftStorage 2.0)

Document identity remains server/account/Vault/path. Saving requires a nonempty key.writerId (DraftWriteRecord); each editor session generates an independent random 128-bit identity, since activation IDs are only kernel-local. save replaces that writer's snapshot only. list(documentKey) returns every writer and legacy candidate without selection. load(key) reads the exact writer (or the legacy slot when writerId is absent). remove(key, revision) conditionally acknowledges only that writer and revision; newer revisions and other writers survive. Consumers must upgrade their manifest requirement to ^2.0.0. The provider validates identities and forwards all four methods through the public storage contract.

IndexedDB schema 2 adds draft-writers atomically and retains the original drafts store as legacy recovery data. No legacy record is deleted during upgrade. Version-change closes older connections; blocked upgrades require closing other tabs. Recovery enumerates both stores. The editor copies recovered content into its new writer slot; successful remote saving acknowledges that slot and the selected original revision, leaving all unselected candidates intact. Failed cleanup stays protected and retryable.

Multiple candidates require an explicit choice through the public text-editor component role. The buffer is read-only before selection, and no candidate is autosaved implicitly. A chosen candidate is copied durably and requires explicit save/review. Page-close protection includes pending recovery work and storage failures. Discard waits for saves and removes only the current/selected records before acknowledging success.
