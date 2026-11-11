# Config manager plugin

Vault preparation resolves/persists the optional display name in
`plugins."lunaris.vault-manager".name` before activation. This uses the public
`PrepareVault@1.1.0` metadata fields and versioned writes, preserves other config
values, and rejects invalid stored names. See [display-name preparation](../../../../DOCS/reference/config.md).

Purpose: persist plugin TOML settings in the application config directory and
`.lunaris/config.toml` per Vault. Local values override global values; tables merge
recursively and arrays/scalars replace global values.

Provides `api:lunaris.config@1.0.0`: `read`, `get`, `set`, `remove`. Consumers declare
`config.access`; a plugin ID selects its own or any other namespace. Writes require
an explicit global/Vault target. Provides `event:lunaris.config-changed@1.0.0` for
persisted mutations, with namespace/key/scope/Vault ID and no setting values.

Requires Logger, Filesystem, ApplicationDirectory, Vault and PrepareVault through
SDK contracts. Registers PrepareVault at priority `-100` to create/validate local
files before readiness; subscribes to no events. Activation initializes the global
file and any already-active Vault. Host grants: `filesystem.access`,
`filesystem.app-config`, `vault.access`.

No platform APIs or concrete drivers are imported. TOML parsing/serialization uses
pinned `smol-toml` in the codec. Storage serializes mutations and checks filesystem
versions. Existing invalid files are never overwritten; persisted modifications
rewrite TOML formatting/comments. All outcomes/failures log through Logger without values.

Vault preparation uses recursive directory creation to accept an existing
`.lunaris` directory without an expected ALREADY_EXISTS error on every reopen.
Drivers that return ALREADY_EXISTS still get an explicit directory-kind check;
a file occupying that name is rejected and preserved.

See [API, format, consistency and error details](../../../../DOCS/reference/config.md).
Run `npm run config:check` from the repository root.

## Namespace snapshots

Provides `api:lunaris.config-snapshots@1.0.0` (`ConfigSnapshots`, config.access).
`capture(pluginId, explicitTarget)` returns a version 1 TOML snapshot of that
namespace only, bounded to 256 KiB of text. `restore(pluginId, text, target)`
validates/copies the snapshot before queuing and replaces only that namespace in
one version-checked file write. Unrelated namespaces/root metadata remain current.
Big integers and TOML date variants retain the existing codec semantics. Affected
keys publish ConfigChanged after commit; logs contain no setting values.

This is a portable backup contract, not a path to the provider's files. The
isolated SDK adapter enforces the same own-namespace/captured-Vault rules as Config.
The Lime managed-data journal can consume it without importing this implementation;
that engine integration is still pending. The operation does not restore unrelated
Vault documents, global settings through a Vault target, or arbitrary side effects.

PrepareVault initializes storage only at priority -100. Vault display-name policy belongs to the Vault persistence owner; generic Config does not read or interpret Vault metadata.
