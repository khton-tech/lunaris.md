# Lunaris Lime engine

`createLime({ platform })` from `@lunaris/lime-manager` defines `lunaris.lime`.
It requires public Filesystem, Vault, VaultLifecycle, LimeRuntime,
LimePackagePicker and Logger APIs. It provides Lime 1.0 and LimeChanged 1.0
from `@lunaris/lime`. No kernel, platform IPC, DOM or private driver is imported.

## Implemented service operations

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
Unreferenced archives can remain after interrupted staging/updates. This layout
does not yet include an orphan sweep or removal/recovery journal.

## Vault integration

VaultLifecycle runs release only after all save guards accept. Lime seals new
operations, cancels file selection, drains pending work, closes its runtime and
clears previews before the old root closes. Awaited settlement restores the current
root (including recovery after failed native release) under a new generation.
Preparation failures/save vetoes leave old execution untouched. An engine activated
after a Vault is already open requires explicit `restore()` after its own activation
commits; do not start guests depending on Lime from inside Lime activation.

The current safe-mode method prevents package evaluation through Lime. Host-owned
pre-evaluation recovery entry/UI still needs integration; this is not yet complete
recovery from every essential provider replacement. All archive/module reads/writes
use public Filesystem with explicit captured Vault IDs.

## Verification and remaining integration

Headless engine tests use public SDK mocks for storage/runtime and cover inert
preview, exact-byte confirmation, builtin collisions before commit, storage failure,
recovery intent, explicit retry, safe-mode skip and cross-Vault preview invalidation.
Actual Kernel/QuickJS runtime tests are separate host adapter evidence.

Still pending: remove with retained/deleted data/settings, storage cleanup journal,
managed-data migration backup/rollback, dependency/provider-choice disclosure,
arbitrary view support, host recovery/bootstrap, product composition and Lime
Settings UI. An update can run arbitrary package side effects against the Vault;
code rollback does not reverse those data changes. Do not claim transactional data
rollback or completed update acceptance until that policy/integration is implemented.
No visual/native acceptance is claimed by these service tests.
