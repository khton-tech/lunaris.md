# Recent Vault history provider

With optional FilesystemSources and AccountSession integration, require host grants
for filesystem.access/account.access. Lists, reopen requests and changed events
filter locations through the backend's public locationVisible contract. Account
changes immediately republish filtered cached history, without exposing another
account's names. Storage retains device history for future matching logins. Native
unavailable folders retain the original recovery behavior. Consumers do not parse
references or infer a source from plugin IDs. Description refreshes labels while
preserving the exact persisted reference.

Purpose: persist and reopen recent Vault locations without coupling product UI
to filesystem drivers. Lives in `plugins/systems/vault-history`; provides
`VaultHistory` and `VaultHistoryChanged` from `@lunaris/vault`. Requires Logger,
Config, VaultLocations, VaultChanged, and host grants `config.access`/`vault.access`.

## Public API and events

- `VaultHistory.list()` returns `VaultHistoryResult<readonly RecentVault[]>`.
  Results are detached, frozen, deduplicated by location reference and ordered
  most recent first; at most 20 entries are retained.
- `VaultHistory.open(reference)` finds a stored entry and calls
  `VaultLocations.open(location)` without a second folder dialog. It restores the
  current Vault metadata rather than writing the cached history name back.
- `VaultHistoryChanged` publishes `{ entries }` after successful persistence.
  Listener failures cannot roll back persistence. Observers may call list/open.
- `VaultChanged` is the subscribed input. Only successful opens/switches carrying
  a durable location are recorded. Close, cancellation, rejection and legacy
  dialog opens without a location do not modify history.

`RecentVault` contains `{ name, location: { reference, label } }`. References are
driver-owned opaque values, not paths or root IDs. Names, labels and references
are never logged. Global Config stores `entries` in `lunaris.vault-history`.
No Vault must be active to read history; startup opens no dialogs.

## Consistency and failure behavior

Updates serialize and reread persisted configuration before merging. `list/open`
wait for accepted updates. No cross-file transaction spans Vault activation and
history persistence: a history-save failure logs degradation but leaves the open
successful and the Vault usable. The next successful open retries history saving.
Failed saves do not emit `VaultHistoryChanged` or fabricate persisted entries.

Malformed/unreadable history returns `HISTORY_UNAVAILABLE` and is preserved for
recovery, never silently overwritten. Unknown entries return `NOT_FOUND`;
missing/revoked native locations preserve their entries and return the opening
error. Shutdown prevents queued saves and late notifications; an already accepted
Config write may still persist. The provider never invokes SDK handles from cleanup.

Tauri registers this provider as an entrypoint after Config Manager. UI integration
remains part of the selector plugin. Run `npm run vault-history:check` for scoped
provider/host tests, type fixtures and dependency checks; Config Manager tests
additionally exercise the real Vault/Config/history chain.


Location APIs (1.1.0) expose `describe(reference)` to refresh a durable location
without attaching a root or preparing Vault data. The native driver returns the
full absolute display path in `label`; `reference` remains opaque authority.
Recent history refreshes legacy labels on listing and recording, retaining saved
labels on recoverable failures. Display paths must never be logged.

Vault metadata ownership: this Vault persistence plugin registers PrepareVault after Config's storage initialization. It reads/validates the display name and persists explicit renames through Config using the public VAULT_METADATA_NAMESPACE constant. The stable namespace retains existing files without a destructive migration; replacement Vault providers use the same public PrepareVault/displayName contract and may reuse this metadata owner. Config no longer interprets names or embeds a concrete Vault implementation namespace. History and metadata preparation are integrated in both standard host compositions; custom compositions needing persisted names must activate this owner.
