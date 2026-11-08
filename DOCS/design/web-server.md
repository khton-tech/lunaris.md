# Web server and remote Vault foundation

Status: requirements recorded; implementation blocked on public SDK domain
contracts. No server, browser host, remote driver or migration is implemented.

## Accepted product scope

- An account workspace is its collection of owned Vaults, not the existing UI
  Workspace service. Sharing and collaborative text editing are outside v1.
- Registration is configured as open or invitation-only. An invitation token is
  single-use. Administrators reset passwords; email recovery is outside v1.
- The server may limit active Vault count per account; null means unlimited.
  There are no product quotas for account bytes or file size. Transport safety
  limits must not silently become account storage quotas.
- Work is online. Interrupted saves preserve a durable local draft and retry
  after reconnection with the original expected version. Conflicts never silently
  overwrite remote content. This is not offline Vault replication.
- Desktop switches between local and server Vaults without restarting.
- Deleted Vaults enter a recoverable trash state. Retention is server-configured.
- Plugins are trusted prebuilt composition, as in the current desktop host.
  Per-account package installation and arbitrary uploaded code are outside v1.
- Administrators can build and activate an updated browser bundle. Updating the
  API or database remains a separate release/migration operation.

Proposed defaults, not separately confirmed product requirements: trashed Vaults
do not count toward the active limit; restore checks the limit; shortening
retention affects existing trash. These rules must be explicit in server docs.
No numeric retention or Vault-count default has been selected.

## Existing architecture and implementation gate

The client working tree was clean on main at ef77277 before this work. The sibling
lunaris-server directory was empty and was not a Git repository.

Existing reusable boundaries:

- packages/sdk: APIs, events, hooks, permissions and owned cancellation scopes.
- packages/filesystem and plugins/systems/filesystem: relative paths, explicit
  root targets, conditional writes, mutation guards and owned observation.
- packages/vault and plugins/systems/vault: preparation and save-gated switching.
- Config: global and Vault scopes, currently backed by a platform directory.
- Workspace, ActiveScreen, ActiveDocument, File Explorer, Text Editor, Themes,
  Localization and Mantine Components: shared product behavior and presentation.

Concrete gaps:

1. The filesystem provider captures a single FilesystemDriver, observation driver,
   location driver and directory driver at activation. Global provider selection
   is not per-root routing. Replacing it cannot safely retain local application
   storage while switching to remote Vaults. The single capabilities() snapshot
   also cannot express capabilities of different roots.
2. VaultCreation.create(parent: FolderLocation, name) creates a child directory.
   A server account collection is not a selected parent folder. Reusing that
   contract would hide account lifecycle inside filesystem directory creation.
3. FsErrorCode has no connection/session failures. Treating every disconnection
   as IO_ERROR or VAULT_CLOSED loses the information needed for safe retries.
4. Text Editor's DocumentSession retains dirty text in memory, but there is no
   public durable draft storage contract. Config is not a substitute for a draft
   store and currently requires filesystem-backed initialization before startup.

AGENTS.md requires stopping development when SDK functions are missing and
specifying the required changes. This document is that specification. No private
driver import, plugin-ID routing, fake parent folder or direct browser storage in
a consuming plugin may bypass this gate. These are domain SDK contract changes;
no kernel runtime redesign has been established as necessary.

## Required public contracts

Names below are proposed API names, not shipped tokens. Additive contracts should
preserve existing local consumers; publish a new version if semantics change.
Every asynchronous operation returns a validated result and accepts scoped
ownership where it can create or retain resources.

### Filesystem backend registration and root routing

Provide a host-composed backend registry through SDK contracts. Each backend
declares an opaque source identity and explicitly exposes the supported driver
operations through SDK-mediated APIs. Registrations are scope-owned; consumers
must not receive implementation objects or privileged raw callbacks.

- Source identity distinguishes local storage from each authenticated server
  session. It is not inferred from root ID prefixes, labels or plugin IDs.
- Source attachment returns a router-owned root ID mapped to one immutable
  backend attachment. FileTarget remains explicit and unchanged for consumers.
- Route read/write/list/stat/mutations, pickers, close, observations and change
  events consistently. Translate root and watch IDs at the boundary.
- Expose capabilitiesFor(rootId) as an additive API. Keep capabilities() behavior
  documented for legacy consumers; never overstate mixed-backend guarantees.
- Close drains accepted operations, removes watches and retires mappings.
  Late completions cannot reattach a retired session or publish stale events.
- Backend failure never falls back to another backend. Local application config
  stays local even when a remote Vault is active. Cross-root transfers remain
  unsupported until separately designed.
- Native paths, credentials and backend root handles remain private to drivers.

### Account connection and session

ServerConnection exposes connect(address, owner), status(), disconnect(), and a
changed event. Discovery returns protocol and build compatibility information.
AccountSession exposes register, login, current, logout and a changed event.
Registration accepts an optional invitation token according to server policy.

The transport driver owns credentials and native HTTP/streaming integration;
product consumers receive opaque session identity, never bearer secrets. Session
identity includes an epoch so responses from previous logins cannot mutate the
current account state. SDK permissions are not server authorization.

Logout is a save/draft-gated product transition while the session is usable.
Expired/revoked sessions stop remote requests immediately while preserving drafts
for the correct account. No SDK calls occur after scope closure.

### Account Vault catalog and opening

AccountVaults exposes list(state), create(name), trash(vaultId), restore(vaultId)
and a changed event. Records contain stable server Vault identity, display name,
state and deletion/expiry timestamps. An account's workspace is this catalog.

A public VaultSources boundary supplies source-aware list/open/create entry
points to Vault Selector. It obtains remote attachments through the filesystem
router, then uses the existing preparation and BeforeVaultRelease lifecycle.
Server creation is not DirectoryLocations.create. Failed candidate preparation
preserves the previous active Vault and releases the candidate attachment.

Stable server Vault identity and transient attached root ID are different values.
History keys include server identity and account identity; display labels grant no
authority. Restoring a trash item retains stable Vault identity.

### Remote failure and reconnection state

Add explicit failure classification for OFFLINE, SERVER_UNAVAILABLE,
UNAUTHENTICATED, SESSION_EXPIRED and PROTOCOL_MISMATCH without exposing secrets.
Coordinate affected FsFailure consumers and exhaustive type checks. Conflicts
remain CONFLICT. Permission denial remains distinct from connection failure.

Expose connection-state changes through SDK events. Reconnection recreates owned
watches and emits rescan before consumers trust their cached tree. Lost event
history cannot be represented as an uninterrupted stream.

### Durable drafts

Drafts exposes load(key), save(record), remove(key) through a provider and
replaceable local storage driver. A record contains local text, expected remote
version, timestamp and a stable key: server, account, Vault and relative path.
Transient attachment IDs must not be persisted as document identity.

Persist edits before presenting a draft as recoverable. Serialize saves; remove
only the acknowledged draft revision after a successful conditional remote save.
A late save response must not erase newer local edits. Restore and retry only for
the matching account and Vault. Report storage failure visibly and through Logger;
do not claim durability when browser storage rejects a write.

Moves/deletion and account switching must reconcile drafts explicitly. Logout
must not expose one account's drafts to another. Browser draft storage is local
recovery, not an encrypted backup or protection from hostile same-origin code.

## Server shape

Use one modular server application with replaceable infrastructure boundaries:
accounts, sessions, invitations, account Vault catalog, file storage, change
delivery, administrator commands and bundle releases. Keep authorization in server
services and storage operations rather than trusting client manifests.

Persist account/session/invitation/catalog metadata and migration version in a
database. Store Vault content behind a confined storage adapter. Choose concrete
libraries after checking supported primary documentation at implementation time.
Do not couple the wire protocol to database rows or export native filesystem paths.

Required server invariants:

- Verify account ownership for every Vault and file operation, including watches.
- Redeem invitation and create account in one transaction; concurrent reuse has
  exactly one winner. Store token verifiers, not recoverable invitation secrets.
- Password reset invalidates existing account sessions. Password hashing and
  session handling require a separately documented implementation and tests.
- Count active Vaults and enforce create/restore limits transactionally. Lowering
  the limit preserves existing Vaults and blocks additions above the new limit.
- Trash immediately denies ordinary access, retires observations and retains
  recoverable metadata/content. Cleanup is idempotent and restart-safe. Coordinate
  expiry and restore so partially purged content cannot become active.
- Conditional writes are serialized per resource and enforced on the server;
  competing writes using one version cannot both replace changed content.
- Constrain paths and symlink resolution at the storage boundary. Never accept an
  arbitrary server path supplied by a client.
- Keep passwords, tokens, note contents and sensitive paths out of logs. Product
  plugins use required Logger through ctx.use(Logger), with ctx.pluginId source.
- Document secure browser and desktop authorization, cross-origin behavior and
  write-request protections. Do not expose an unrestricted SDK RPC gateway.
- Back up metadata and files consistently; verify restoration, not just copying.

## Browser host and bundle releases

The browser host belongs in hosts/web in the client repository. Reuse shared
product plugins; exclude Tauri-only window, native IPC and filesystem code.
Bootstrap local config/drafts before login. Registration/login and the selector
use public Mantine component roles and Localization. Read UI_GUIDELINES.md before
implementation and establish container/surface/content ownership explicitly.

A build profile pins a client source revision, lockfile, trusted plugin set,
entrypoints and host grants. It contains no server secrets or account data.
The builder is an administrator-invoked tools/scripts workflow, not user input
executed as shell code and not a build on every server startup.

Build in staging, validate manifest/dependency resolution and protocol range, then
publish an immutable release with build ID and asset hashes. Serve entry HTML
without stale caching and retain old hashed assets for existing tabs. Activate
only complete releases using an atomic pointer switch. A failed build leaves the
current release usable. Retain the previous release for frontend rollback.

Do not automatically update to an unpinned branch on startup. API/database
rollback has separate compatibility constraints and is not guaranteed by retaining
an old browser bundle. Notify existing tabs about updates and gate reload on
successful save or durable draft preservation.

Provide source-build and prebuilt deployment paths. Development and server checks
must run without Docker. Add a Docker image and persistent-volume documentation
after the native launch and recovery paths work.

## Delivery sequence and acceptance

All steps below are pending; this document does not mark them implemented.

1. SDK foundation: implement routing, source-aware Vault creation/opening, remote
   failures and drafts contracts with owned cancellation and compatibility tests.
2. Server bootstrap: initialize sibling repository and feature branch; add config,
   storage migrations, structured diagnostics, account/session/invitation services
   and administrator password reset. Commit each completed feature.
3. Server Vaults: ownership, transactional count enforcement, file operations,
   optimistic conflicts, trash/restore and restart-safe expiry cleanup.
4. Browser composition: build profile, web host, pre-login storage and account UI.
   Verify register -> create Vault -> edit -> reload -> reopen persisted note.
5. Desktop integration: account UI and remote driver through public SDK routing;
   verify local -> remote -> local without restart or redirected pending writes.
6. Recovery: durable drafts, reconnect/rescan, two-client conflicts, expiration
   and logout during edits. Verify no cross-account draft or response leakage.
7. Releases: staged builds, compatibility rejection, activation/rollback, old-tab
   asset loading, deployment documentation, backup/restore and Docker packaging.

Targeted checks must include cross-account denial, concurrent invitation use,
concurrent create/restore at limit, trash expiry races, competing saves, unsafe
paths, cancelled attachments and stale watch events. Use real temporary storage
where invariants depend on persistence; do not rely only on mocked transport.

Integration is incomplete until File Explorer, Text Editor, Vault Selector,
History, Config, Startup and account transitions work together through these
contracts in both hosts. Automated behavior tests do not establish visual
acceptance. The Owner must manually inspect composed login/selector/editor flows,
menus, focus, narrow layouts and themes; desktop automation is prohibited.
