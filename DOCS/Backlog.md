# Product backlog

## UI slots

Status: IMPLEMENTED on 2026-11-05 before the first visible product UI plugins.
The replaceable provider allocates scoped, nested, ordered regions through SDK
contracts. A separate DOM driver supplies resilient flex targets and a permissioned
browser rendering bridge. Tauri composes both with its independent recovery shell.
See [the slot reference](reference/slots.md) for APIs, ownership and current limits.

Next UI responsibilities, in Owner-requested order: theme manager and theme engine,
component manager, then a standard component set. Determine their individual
contracts and boundaries before implementation. Slots do not own those services.

## Localization

Status: IMPLEMENTED on 2026-11-05 before product UI development.
The replaceable service provides English-first, per-plugin catalogs with scoped
ownership, interpolation, English fallback and locale-change events through SDK
contracts. Only English is shipped; language selection UI, persistence, ICU and
language-pack distribution are deferred. Existing system plugins have only
technical logs/errors, which stay English and independent of localization.
The host recovery shell retains its standalone English dictionary.
See [the localization reference](reference/localization.md).

## Vault Manager

Status: IMPLEMENTED on 2026-11-05, following separate Owner authorization after
the filesystem milestone. See the [Vault Manager reference](reference/vault.md).

Filesystem dependency: [provider and Tauri driver](reference/filesystem.md) are
implemented, including owned roots and coordinated closure. Application configuration
directory access is also available through [SDK storage contracts](reference/application-storage.md).

Own Vault context and lifecycle: open, expose the active Vault, switch and close;
publish SDK events for these changes. Start with one open Vault. Delegate root
selection/attachment and file operations to the filesystem provider. File APIs
must continue to receive an explicit Vault ID and a Vault-relative path, never
implicitly resolve the active Vault or expose native absolute paths.

Coordinate closure by rejecting new work and awaiting in-flight operations before
releasing the root and watchers. Unsaved-document decisions belong to the future
document layer. Recent-Vault history, session restoration, tabs and per-Vault
settings were initially deferred. Per-Vault settings are now implemented by the
separate [config manager](reference/config.md). Use mandatory logging and SDK ownership.

Acceptance: opening/closing emits documented events; switching cannot redirect an
in-flight save; closed IDs reject new operations; consumers access context through
SDK contracts without depending on driver or host internals.

## Config Manager

Status: IMPLEMENTED on 2026-11-05 after completing the storage/Vault prerequisites.
Global application config and `.lunaris/config.toml` expose per-plugin namespaces
through SDK read/get/set/remove methods. Effective reads prioritize local values;
explicit writes, version checks and serialized mutations preserve unrelated data.
See [the config reference](reference/config.md) for format, errors and limits.
