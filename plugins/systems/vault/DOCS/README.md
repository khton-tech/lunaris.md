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
creation, recent history and restoration are separate responsibilities.

See the [complete API/lifecycle reference](../../../../DOCS/reference/vault.md).
Run `npm run vault:check` from the repository root.
