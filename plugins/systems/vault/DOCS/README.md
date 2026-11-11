# Vault Manager plugin

Purpose: manage one active Vault through portable SDK services. All filesystem
operations delegate to the filesystem provider. Logger is a required dependency;
the host grants the manager `filesystem.access`.

Provides `api:lunaris.vault@1.0.0` (`current`, `open`, `close`),
`event:lunaris.vault-changed@1.0.0` (`opened`, `switched`, `closed` payloads), and
`hook:lunaris.prepare-vault@1.0.0` (awaited initialization before readiness).
Consumers declare the contracts they use and obtain `vault.access`.

`open()` selects a root through `FilesystemRoots.selectVault` with a child scope's
signal. It prepares the candidate, drains/closes the previous root through
`Filesystem.closeVault`, and only then publishes the new context. Cancellation and
failed preparation preserve the old Vault. Parallel/reentrant transitions return
`BUSY`. The manager subscribes to no events. Preparation hook handlers belong to
consumers; the manager runs the hook through its advertised SDK contract.

Owned-root cancellation is implemented in the native driver; the manager never
calls SDK handles from cleanup. Startup opens no selection dialog. UI, config
creation and recent history are separate responsibilities.

`api:lunaris.vault-locations@1.1.0` supplies `select(ownerSignal)` and
`open(location, { name? })` through the filesystem location provider/driver.
Selection has no Vault side effects; opening reuses preparation and coordinated
closure. Config Manager persists display names through preparation metadata.
`PrepareVault` and `VaultChanged` are provided at `1.1.0`; named opens fail if no
metadata handler confirms persistence. See [the public reference](../../../../DOCS/reference/vault.md#explicit-folder-selection-and-opening).

See the [complete API/lifecycle reference](../../../../DOCS/reference/vault.md).
Run `npm run vault:check` from the repository root.


Location APIs (1.1.0) expose `describe(reference)` to refresh a durable location
without attaching a root or preparing Vault data. The native driver returns the
full absolute display path in `label`; `reference` remains opaque authority.
Recent history refreshes legacy labels on listing and recording, retaining saved
labels on recoverable failures. Display paths must never be logged.

Provides `api:lunaris.vault-creation@1.0.0` with `create(parent, name)`. Requires DirectoryLocations and uses the existing preparation/transition lifecycle for the newly created child. History events contain its durable location. See [creation semantics](../../../../DOCS/reference/vault.md#create-a-named-child-vault).

## Awaited preparation integration

VaultLifecycle 1.1 accepts optional finite settlementOrder. Runtime settlement defaults to 0; startup-provider uses 100 for product preparation. Release guards retain their original order. Settlement failure is logged without pretending a committed root was rolled back. Version 1.0 consumers remain compatible.
