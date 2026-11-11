# Lunaris Lime engine

`createLime({ platform })` from `@lunaris/lime-manager` defines `lunaris.lime`.
It requires public Filesystem, Config, Vault, VaultLifecycle, LimeRuntime,
LimePackagePicker and Logger APIs. It provides Lime 1.0 and LimeChanged 1.0
from `@lunaris/lime`. No kernel, platform IPC, DOM or private driver is imported.

## Implemented service operations

- `plan(id)` returns the runtime dependency plan and revision. `selectProvider(id,
  kind, contractId, providerId, expectedRevision)` validates the exact plan, commits
  selection/recovery intent, applies graph rebinding and settles the record.
  Runtime failure restores the previous durable choice with recovery required.
  Restore reapplies choices before activation; unavailable choices prevent automatic
  restart. Choices survive code updates for still-declared contracts. No dependency
  is downloaded or enabled implicitly. Runtime revisions are not persisted.

- `snapshot()` returns Vault ID, busy/safe-mode/error state and installation rows
  with committed identity, enabled/recovery intent, inspected metadata and current
  runtime observation. Process state is not persisted as a running snapshot.
- `restore(safeMode?)` validates current Vault records and all archives, registers
  definitions without evaluation, then activates enabled, non-recovery packages
  in required-package dependency order unless safe mode is requested.
- `preview()` uses the selected-file driver, validates without evaluation and
  returns a ticket, immutable manifest/digest and a coarse platform warning.
  Only one exact-byte preview is retained. `cancelPreview(ticket)` discards it.
- `install(ticket, enabled=true)` stages a disabled runtime definition to reject
  built-in/duplicate identities before commit, writes an immutable archive and
  commits the registry before optional activation.
- `enable(id)`, `disable(id)` and `retry(id)` manage runtime and durable intent.
  Before activation, recoveryRequired is committed; success clears it. A failed
  or interrupted launch therefore does not automatically repeat on reopen.
- `update(ticket)` requires an installed ID and a different version, writes the
  candidate archive, marks recovery intent, replaces runtime code, then commits
  the new identity. Runtime failure leaves recovery intent and reports failure.
  Registry commit failure attempts runtime code rollback. Same-version updates
  fail explicitly; version downgrades currently use the same explicit update path.
- `remove(id, deleteData)` persists a removal journal, stops/unregisters runtime,
  then removes package archives. The explicit data choice optionally deletes the
  package's managed `.lunaris/plugins/data/<id>` directory and its Vault Config
  namespace. Other Vault documents and global settings are untouched. Only after
  cleanup succeeds is the registry entry removed. Failed/interrupted cleanup stays
  non-executable and resumes idempotently on restore or another remove call;
  the committed data choice cannot be changed after partial deletion begins.

All UI-facing data is inert. Metadata language resolution and visible strings
belong to the Settings/UI consumer. Busy mutations are rejected; previews and
operations capture Vault/generation, and stale confirmation cannot install in a
new Vault. Original failures and meaningful state changes use Logger with ctx.pluginId.
LimeChanged emits current observations; event delivery errors are logged.

## Portable committed layout

```text
.lunaris/plugins/registry.json
.lunaris/plugins/packages/<plugin-id>/<sha256>.lup
```

Registry schema 1 stores revision and records `{ id, version, digest, enabled,
recoveryRequired }`. It contains no absolute machine paths. Reads validate fields,
duplicate IDs, sizes and versions. Archives are revalidated on every restore and
compared with the committed ID/version/digest. Existing digest paths must contain
matching validated bytes. Installation stages immutable archives before one
optimistic create/replace of the registry, using Filesystem's expectedVersion.
External writers are not transactional participants; conflicts fail visibly.
Unreferenced archives can remain after interrupted staging/updates; an orphan
sweep remains pending. An optional record `removing: { deleteData }` is the durable
removal journal; such records require disabled/recovery intent and are never loaded.

## Vault integration

VaultLifecycle runs release only after all save guards accept. Lime seals new
operations, cancels file selection, drains pending work, closes its runtime and
clears previews before the old root closes. Awaited settlement restores the current
root (including recovery after failed native release) under a new generation.
Preparation failures/save vetoes leave old execution untouched. An engine activated
after a Vault is already open requires explicit `restore()` after its own activation
commits; do not start guests depending on Lime from inside Lime activation.

The current safe-mode method prevents package evaluation through Lime. Host-owned
pre-evaluation recovery now uses LimeBootPolicy and HostSession.startSafeMode;
the independent recovery shell exposes the action in both hosts. This is not yet
verified recovery from every essential provider replacement. All archive/module reads/writes
use public Filesystem with explicit captured Vault IDs.

The execution source includes only inspected `assets/` entries as package
resources. Installed code reads them through `ctx.resources`, with bounded
immutable copies and activation revocation. Manifest/source files are excluded.

## Verification and remaining integration

Headless engine tests use public SDK mocks for storage/runtime and cover inert
preview, exact-byte confirmation, builtin collisions before commit, storage failure,
recovery intent, explicit retry, safe-mode skip and cross-Vault preview invalidation.
Actual Kernel/QuickJS runtime tests are separate host adapter evidence.

Unused hash-named archives are swept after restore and committed changes. Cleanup
keeps every committed/tombstoned digest, ignores unknown files/symlinks and data,
bounds scanning and checks the optimistic registry version before each removal.
Failure only defers cleanup and is logged; it does not fail a committed install.
An uncommitted first installation is cleaned after a later registry commit.
External processes do not participate in filesystem locks: a race after a version
check cannot be made atomic by this API. Concurrent synchronization must quiesce
Lime storage; no cross-process transactional deletion guarantee is claimed.

Still pending: managed-data migration backup/rollback, dependency/provider-choice disclosure,
complete native/browser acceptance. Public declarative Views/viewport and package
resources are implemented through SDK contracts. The shared host now
composes the engine, SDK execution driver, picker, runtime adapter and Lime Settings.
Lime management requires the host-only runtime.manage contract; guest code cannot
use it through the execution broker. An update can run arbitrary package side effects against the Vault;
code rollback does not reverse those data changes. Do not claim transactional data
rollback or completed update acceptance until that policy/integration is implemented.
No visual/native acceptance is claimed by these service tests.

## Managed-data backup service

The internal backups service uses public Filesystem and ConfigSnapshots only.
It captures `.lunaris/plugins/data/<id>` and that plugin's explicit Vault namespace
into `.lunaris/plugins/backups/<id>/<backup-id>`. A version 1 JSON descriptor binds
plugin/code identity, directories, settings snapshot and SHA-256 file digests.
The caller retains its descriptor digest for the durable update journal. Limits:
32 MiB total data, 16 MiB per file, 2048 entries, 32 directory levels, 1024 path
characters, 256 KiB Config snapshot and 1 MiB descriptor. Driver limits may be lower.
Symlinks/special files and aliased/invalid paths are rejected; capture is exclusive.

Restore validates the descriptor and all file bytes before changing settings or
removing current managed data. Empty/absent roots are preserved, new candidate
files are removed and arbitrary Vault documents remain untouched. Partial restore
is idempotently retryable from the retained backup. Failed capture cannot create a
committed descriptor; cleanup is best effort. SHA-256 uses the existing pinned pure
JavaScript library, not native filesystem/crypto access.

These services and runtime checkpoints have focused tests. Wiring durable update
journals into install/restore/retry remains in progress; their presence alone does
not make existing updates transactionally recoverable. External writers must be
quiescent; the filesystem contract offers optimistic single-file commits, not a
multi-file or cross-process transaction.
