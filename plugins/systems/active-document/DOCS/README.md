# Active document provider

Purpose: a replaceable system service that owns the single active file identity,
independently of tree selection, keyboard focus and content rendering. The public
SDK package is @lunaris/active-document; the default implementation lives in
plugins/systems/active-document (lunaris.active-document-provider).

## Public SDK contract

Consumers require the ActiveDocument API and ActiveDocumentChanged event,
version 1.0.0, with vault.access permission. Methods:

- current(): frozen { vaultId, path } or null. Paths are portable and Vault-relative.
- open(target): validate a regular file in the current Vault, activate and persist it.
- close(): clear the active identity and its saved path in the current Vault.
- relocate(source, destination): after a successful same-Vault move, update the
  active file path, including descendants of moved/renamed directories.
- reconcile(): validate current identity after filesystem changes. Missing files
  and files replaced by directories close; temporary I/O/permission errors retain
  identity and are logged. External renames with no authoritative destination
  close the missing document rather than guessing a replacement.

All mutations return Promise<FsResult<null>>. Invalid targets return
INVALID_ARGUMENT, stale Vault sessions return CANCELLED, filesystem failures
retain their original codes. ActiveDocumentChanged publishes { current } after
identity changes. Observers can call the API without blocking the operation queue.
No keyboard-focus changes, selection updates or clicks outside the editor close
or replace the active document. Explicit open/close and file lifecycle do.

## Persistence and lifecycle

The provider requires Logger, Config, Vault/VaultChanged and Filesystem. Host
grants vault.access, config.access and filesystem.access. All access is through
ctx.use; operation outcomes and degraded storage are logged through Logger.

Config stores path under the provider's namespace in each Vault's configuration.
On activation/Vault switch, the provider restores that Vault's saved file after
checking its existence and kind. Missing saved paths are removed; unreadable or
malformed saved values are preserved with warnings. Failed persistence leaves
the active session usable. Accepted operations serialize; session epochs discard
late asynchronous results after Vault switches or shutdown. There is no cleanup
SDK access; an already accepted Config write may finish during shutdown.

## Completed integrations and limits

Tauri composes the provider; File Explorer requires its public API/event.
A plain file click or Enter activates a file; Ctrl/Shift multi-selection does
not change the document. New files activate after successful creation. The
explorer reveals the active file's parent folders and the Mantine component
marks it with data-active/aria-current independently of selection and focus.
Background/menu clicks may clear temporary selection while keeping that mark.
Renames/moves notify relocate only after confirmed filesystem success. Confirmed
deletions and owned observation/manual refresh call reconcile. Failed operations
do not move active identity. Without observation, external changes are discovered
on manual refresh. Content editor integration remains outstanding because no
editor plugin exists; future editors consume this same API/event and register
their rendering role with Workspace. No content viewer is claimed here.

Verification: node tools/scripts/check.mjs active-document active-document-provider
file-explorer mantine-components. Tests cover persisted restoration, per-Vault
isolation, missing files, permission/storage failures, folder relocation, stale
asynchronous operations, active marking after focus/selection changes, revealing
ancestors and stale controller callbacks.
