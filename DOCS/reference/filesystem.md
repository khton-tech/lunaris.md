# Vault-scoped filesystem

## Responsibilities and scope

Required: portable Vault-relative file operations, safe write modes, optimistic
conflict detection, native selection dialogs and change observation. Existing:
SDK API/event contracts, permission grants, lifecycle ownership, provider selection
and Logger. New:

- `@lunaris/filesystem`: shared API/event contracts and portable path validation.
- `@lunaris/filesystem-provider`: platform-neutral validation, operation logging
  and forwarding through SDK-bound driver APIs/events.
- `@lunaris/tauri-filesystem`: SDK driver and its native Rust backend under
  `plugins/systems/driver/tauri-filesystem/native`. Only its `src/native.ts` imports
  Tauri IPC. The host registers the native command and grants the intended access.

No SDK or kernel changes are needed. The provider never imports the driver or
platform APIs. Both plugins require Logger. The driver logs native bridge failures
with original errors; the provider logs operation failures with relative-resource
context and structured error information. File contents are not logged.

[Vault Manager](../Backlog.md#vault-manager) is a separate product service.
These plugins own low-level root attachments, not an active Vault, workspace
selection policy, recent history or document state. Every target explicitly carries
`{ vaultId, path }`, so switching future UI context cannot redirect pending work.

## Consumer setup

Add `@lunaris/filesystem` as a dependency, require
`{ "kind": "api", "id": "lunaris.filesystem", "range": "^1.0.0" }`, and declare
the required `filesystem.access` permission in the consumer manifest. The host must
grant it. Acquire `ctx.use(Filesystem)` during activation. Subscribe to changes by
also requiring `event:lunaris.filesystem-changed@^1.0.0` and calling
`ctx.events.on(FileChanged, listener)`; that listener is scope-owned by the SDK.

```ts
import { Filesystem, FileChanged } from "@lunaris/filesystem";

const fs = ctx.use(Filesystem);
ctx.events.on(FileChanged, change => {
  // Filter by the Vault/watch IDs owned by this consumer; rescan when requested.
});

// Run from a user action after activation, never await a user dialog in activate().
const selected = await fs.selectVault();
if (selected.ok && selected.value !== null) {
  const target = { vaultId: selected.value.id, path: "notes/example.md" };
  const read = await fs.readText(target);
  if (read.ok) {
    const saved = await fs.writeText(target, read.value.text, {
      mode: "replace", expectedVersion: read.value.version,
    });
    // Inspect saved.ok and handle a possible CONFLICT in the document/UI layer.
  }
}
```

All asynchronous operations return `FsResult<T>`:
`{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Expected domain
failures never throw across the SDK API boundary; `NOT_FOUND`, `CONFLICT` or a
cancelled dialog must not trigger host recovery. SDK declaration, permission and
scope checks still throw independently. Unexpected provider exceptions retain the
normal kernel diagnostics and recovery behavior.

Native I/O failures additionally retain `nativeCode` when supplied by the OS and
`nativeKind` for diagnosis. These fields preserve useful native classification
without exposing absolute paths in error messages.

## API

| Method | Result value / behavior |
|---|---|
| `capabilities()` | Synchronous capability snapshot: watching, atomic replacement, optimistic version checks, trash support and transfer limit. |
| `selectVault()` | Native directory selection; attaches a root and returns `{ id, name }`, or `null` on cancellation. No absolute path is returned. |
| `closeVault(vaultId)` | Releases that root and its watches. Returns `null`; a closed/unknown ID returns `VAULT_CLOSED`. |
| `pickFile(vaultId)` | Selects one existing file and returns a Vault-relative path or cancellation `null`. |
| `pickDirectory(vaultId)` | Selects an existing directory within the root, or returns `null`. |
| `pickSaveLocation(vaultId)` | Returns a proposed relative path or `null`; does not create or write a file. |
| `readText(target)` | `{ text, version }`; strict UTF-8, without changing line endings. Invalid UTF-8 returns `INVALID_ENCODING`. |
| `readFile(target)` | `{ data, version }`; binary data is a readonly byte array of integers 0–255. |
| `writeText(target, text, options)` | UTF-8 write; returns `{ version }`. |
| `writeFile(target, data, options)` | Binary write; returns `{ version }`. |
| `stat(target)` | `{ path, kind, size, modifiedAt }`; `kind` is `file`, `directory`, `symlink` or `other`; time is epoch milliseconds or `null`. |
| `list(target)` | Immediate children with metadata and full relative paths, sorted by path; not a recursive tree. |
| `createDirectory(target, recursive = false)` | Creates a directory; creating missing parents requires explicit recursion. |
| `remove(target, recursive = false)` | Permanent removal; nonempty directories require explicit recursion. Never removes the Vault root. |
| `move(source, destination, overwrite = false)` | Rename/move within the same Vault. Destination conflicts fail unless replacement was explicitly requested. |
| `copy(source, destination, overwrite = false)` | Copy a file or directory tree within the same Vault. Directory copies are not transactions. |
| `watch(target, recursive = true)` | Returns a watch ID; events use SDK subscriptions, not callbacks/disposers returned by an API. |
| `unwatch(vaultId, watchId)` | Releases the watch; unknown watch IDs within an open Vault are harmless. |

Use `stat` and its result for existence inquiries. Do not check existence to decide
whether a subsequent write is allowed: the write's explicit mode enforces that rule.

## Paths and writes

Paths use `/`, preserve spelling/case and never contain an absolute prefix, empty
segments, `.` or `..`. Portable names exclude control characters, Windows reserved
characters/device names and trailing spaces/dots. The empty string denotes the
Vault root and is accepted only by `stat`, `list`, `watch` and directory selection.
The root cannot be overwritten, moved, copied or removed. Native absolute paths
remain inside the backend. Dialog selections outside the Vault are rejected.

`WriteOptions.mode` is required:

- `create`: create a new file only. An existing name returns `ALREADY_EXISTS`.
- `replace`: replace an existing regular file only; missing targets return `NOT_FOUND`.
- `upsert`: create or replace a regular file.

`expectedVersion` is accepted with `replace`/`upsert`, never with `create`. Versions
are SHA-256 content fingerprints from the actual bytes read/written. A changed
content version returns `CONFLICT`, preserving the current file. Equal-length
changes are detected. Driver calls are serialized; two saves with one expected
version cannot both succeed if the first changes the contents.

The backend checks the version before writing and immediately before commit.
This is **optimistic checking**, not an atomic compare-and-swap against external
programs: they can still modify a file between the final check and replacement.
Likewise `replace` checks existence before commit; it cannot lock out every
external deletion. The contract does not claim global filesystem transactions.

Writes prepare a temporary file in the target parent, flush its contents and then
rename it. `create` and no-overwrite moves use the native Windows no-replacement
rename operation, so an externally created destination is not overwritten.
Replacement is a same-directory rename; basic existing permissions are retained.
This avoids exposing half-written replacement content, but does not promise
power-loss durability or preservation of every platform metadata attribute.

## Native boundary and lifecycle

The first supported driver target is Windows x64 in Tauri. Root selection uses
native dialogs; file operations use `cap-std` directory capabilities to constrain
path traversal and link resolution, not a string-prefix check. Writes do not
replace symbolic links. Copy/move of symbolic links and replacement of existing
directories are unsupported. Directory copy can leave completed destination items
if a later item fails; no rollback or merge policy is implied.

Roots/watchers belong to a native driver session. The session uses a fresh UUID
because SDK activation IDs are kernel-local and may repeat across host retries.
The driver owns session cleanup through `ctx.scope.own`; its disposer uses the
native bridge directly, never a closed SDK handle. Native close/end drops root
capabilities and watchers; stale Vault IDs reject future operations. A closed
session cannot be reopened by a late initialization or dialog result. Retired
session IDs are retained as small tombstones until process exit to prevent this
race; they hold no file handles or watchers.

Native filesystem operations run on blocking workers under a shared backend lock.
Close waits for an operation currently holding the lock; queued work that runs
after close receives `VAULT_CLOSED`. Selection dialogs do not hold that lock.
The native dialog library does not support programmatic dialog cancellation;
an already open dialog may need manual dismissal after plugin shutdown, and its
late selection cannot reattach a closed session. No dialog opens at application
startup.

Watching uses native `notify` notifications through a Tauri channel. The driver
publishes `DriverFileChanged`; the provider forwards `FileChanged` through the
SDK. Payloads contain `{ vaultId, watchId, kind, paths }`. Kinds are `created`,
`modified`, `removed`, `renamed`, `rescan`; rename paths are old/new when the OS
reports a pair. Ambiguous notifications/errors request a rescan. Events are hints,
may be duplicated/coalesced, and can include temporary write-file activity.
Install the SDK listener, await `watch`, then perform the initial scan. The driver
ignores callbacks for watches that have been closed/unwatched or whose activation
has stopped. Watches belong to the Vault attachment; stopping an individual
consumer removes its SDK listener, but does not implicitly unwatch the Vault.

In-memory text/binary reads and writes are limited to 64 MiB per file. Streaming,
trash, cross-Vault transfers, directory replacement and other platform drivers
are deferred. Unsupported operations must fail explicitly, without unsafe fallback.

## Host composition and verification

Tauri registers Logger, DevTools sink, filesystem provider and native driver, and
starts the filesystem provider as the root. Composition grants `filesystem.native`
to the driver and `filesystem.access` to the provider. Consumers need their own
explicit grants. `ApplicationDefinition.grants` is a trusted host composition map;
the host applies it after registration, before activation, skipping excluded
plugins. It does not allow undeclared grants or expose grant management to plugins.
Multiple drivers require host selection for both the driver API and its change
event before starting the provider. No active-Vault singleton is introduced.

Run `npm run filesystem:check`: targeted TypeScript/provider/driver/host tests,
native filesystem tests, boundary/type/CI selection checks, Rust formatting,
locked host compilation and the frontend bundle. The tests perform real temporary
file operations and native watching without opening windows or selection dialogs.
`npm run tauri:check` / `npm run tauri:build` also run native filesystem tests.

Manual acceptance: run `npm run tauri:dev` and confirm all four plugins activate.
Native selection/cancellation visuals require a consumer user action; Vault
Manager/product file UI is not implemented yet. No desktop automation is used.

Implementation references: [cap-std directory API](https://docs.rs/cap-std/4.0.3/cap_std/fs/struct.Dir.html),
[native notifications](https://docs.rs/notify/8.2.1/notify/),
[native dialogs](https://docs.rs/rfd/0.17.2/rfd/struct.FileDialog.html),
[Tauri command permissions](https://docs.rs/tauri-build/2.7.4/tauri_build/struct.AppManifest.html),
[Windows rename flags](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw).
