# Active document

The additive DocumentProtection API exposes hasUnprotectedChanges() under
vault.access. Text Editor provides this synchronous query without exposing text.
Browser navigation uses it before unload: pending/failed local storage is not
durable recovery. Existing document identity and transition contracts are unchanged.

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
on manual refresh. The CodeMirror text editor now consumes this API and the additive transition
event, with its screen registered through ActiveScreen. See the
[editor guide](../../plugins/UI/text-editor/DOCS/README.md).

Verification: node tools/scripts/check.mjs active-document active-document-provider
file-explorer mantine-components. Tests cover persisted restoration, per-Vault
isolation, missing files, permission/storage failures, folder relocation, stale
asynchronous operations, active marking after focus/selection changes, revealing
ancestors and stale controller callbacks.
# Editor transitions

The existing 1.0 snapshot API/event remains unchanged. The additional
ActiveDocumentTransitioned 1.0 event carries previous/current and reason:
open, close, restore, relocate, reconcile or vault. Repeated successful open emits
the transition even when identity is unchanged, allowing a return from Settings.
Relocate identifies the same buffer at its committed new target; open loads a
different buffer. Reconciliation and Vault changes are notifications, not vetoes.

BeforeActiveDocumentChange 1.0 guards voluntary open/close before identity or
persisted selection changes. Handlers register onSettled(listener) before awaiting
and return the input with a nullable FsFailure, preserving earlier errors. A
failure retains the previous document; a thrown handler also releases registered
completion listeners. Never recursively call open/close from this serialized hook.
