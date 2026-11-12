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

## Public server identity

ServerInfo adds optional name (nonblank, max 80) and description (max 280).
Transport validates supplied fields; legacy discovery may omit them. AccountAccess
passes them as serverName/serverDescription through Components, rendered as plain
text above authentication. No address footer is shown. Mobile uses auto margins
to center the combined identity/form block when space permits, falling back to
scrolling when content exceeds the allocation. No storage changes. Integration
connects server discovery, transport, account controller and UIKit. Native mobile
centering, keyboard-open scrolling and long descriptions require manual acceptance.

## Embedded desktop server access

AccountAccess 1.1 adds open({ target, owner, onBusyChange? }); open() retains the
standalone screen. The target is a borrowed HTMLElement; owner cancellation
releases only the view. AccountSession and its connection outlive the disclosure
so opening a remote Vault cannot revoke its own session. Busy operations reject
competing open/close actions. Late operation results after owner cancellation
cannot advance forms or open a newly created Vault. Passwords clear on closure.

Vault Selector supplies serverExpanded/onServer/onServerTarget through its public
Components role. The renderer owns a third ln-vault-action with the same CardRow,
ln-vault-toggle, animated disclosure and ln-vault-form surface as Create/Select.
Only one disclosure is open. The target is registered explicitly, never discovered
through DOM ancestry. The selector owns geometry, surface and overflow; the account
role receives presentation embedded/content and renders transparent inner content.
Its sequence is server address, sign-in or invitation-aware registration, then
server Vaults. Change server returns to the first step. Reopening preserves account
and server context. Escape closes the disclosure and restores toggle focus; nested
creation Escape is handled locally first. Pending work disables sibling actions.

Integration is complete through AccountAccess, Components, AccountSession,
AccountVaults, FilesystemSources and VaultLocations. The browser's standalone
screen remains supported. Targeted composed tests cover registration and sign-in,
collapse/reopen, local-form switching, remote opening, owner shutdown, disabled
competition, Escape focus and theme changes. Native desktop/phone geometry,
opened menus, long translations and keyboard scrolling still require manual
acceptance in the actual selector. No storage or server protocol changes.

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
