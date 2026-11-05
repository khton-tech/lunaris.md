# Config manager plugin

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

See [API, format, consistency and error details](../../../../DOCS/reference/config.md).
Run `npm run config:check` from the repository root.
