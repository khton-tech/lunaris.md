# Product backlog

## Vault Manager

Status: TODO. Requested by the Owner on 2026-11-05. Implement after the filesystem
provider and its first platform driver. This task does not authorize implementation
as part of the filesystem milestone.

Own Vault context and lifecycle: open, expose the active Vault, switch and close;
publish SDK events for these changes. Start with one open Vault. Delegate root
selection/attachment and file operations to the filesystem provider. File APIs
must continue to receive an explicit Vault ID and a Vault-relative path, never
implicitly resolve the active Vault or expose native absolute paths.

Coordinate closure by rejecting new work and awaiting in-flight operations before
releasing the root and watchers. Unsaved-document decisions belong to the future
document layer. Recent-Vault history, session restoration, tabs and per-Vault
settings are deferred. Use mandatory structured logging and SDK scope ownership.

Acceptance: opening/closing emits documented events; switching cannot redirect an
in-flight save; closed IDs reject new operations; consumers access context through
SDK contracts without depending on driver or host internals.
