# File explorer: implementation proposal and SDK prerequisite

Status: implemented. This document records the original design and prerequisite
specification. See [the implemented file explorer](file-explorer.md) for current
contracts, behavior, verification and outstanding document/editor integration.

## Existing contracts and required work

Existing services cover Sidebar registration, Workspace Vault context, Components,
themes, localization, Logger and Vault-relative filesystem operations. The default
component plugin uses React 19.3.1 and Mantine 9.7.5. React Arborist 4.0.1 declares
React/React DOM >=18, Node >=22.12 and react-dnd/react-dnd-html5-backend ^16 peer
dependencies. These declarations fit the current runtime; actual integration and
production-build compatibility still require verification.

Create `plugins/UI/file-explorer` as a controller consuming public SDK contracts.
Add `lunaris.file-explorer` to `plugins/UI/mantine-components`; React Arborist and
all React/Mantine imports stay inside that renderer plugin. Mantine supplies
controls and menus, Lucide supplies icons and the SDK theme supplies appearance.
The renderer receives plain data and callbacks, and never accesses files.

The controller owns lazy directory loading, selection, expanded directories,
operation state and a Vault-local copy/cut buffer. Preserve logical state across
panel unmounts. Do not retain old Vault authority or apply stale asynchronous
results after Vault replacement. Use controlled tree data; commit filesystem
changes before reflecting successful mutations. Never silently overwrite entries.

Planned operations: file/directory creation, F2 rename, Ctrl/Shift selection,
drag-and-drop moves, copy/cut/paste within a Vault, refresh, contextual actions,
keyboard navigation and external-change reconciliation. Normalize multi-selection
by removing descendants of selected ancestors. Reject transfers into descendants.
Batch operations can partially succeed; report failures and rescan affected paths
without claiming transactional behavior. Directory contents load on demand; list
all immediate children only when needed, not the entire Vault recursively.

Permanent deletion requires explicit confirmation that identifies the selected
items and the absence of trash support. Do not describe removal as recoverable.
File opening remains a separate document-layer integration; no document/editor
service exists yet, so do not invent a private editor dependency or advertise
working file opening.

## Blocking contract gap: owned filesystem watches

`FilesystemApi.watch(target, recursive?)` returns a watch ID without an owner.
The filesystem provider forwards it directly to its driver. SDK event listeners
are scoped, but the underlying watches survive consumer shutdown until the Vault
or driver session closes. `unwatch` requires a live SDK handle. Plugin cleanup
cannot call that handle after the consumer scope closes.

This prevents an independently stoppable/restartable explorer from safely owning
external-change observation. Polling, direct driver access, relying on eventual
Vault closure or calling SDK services during scope cleanup are not acceptable
substitutes. The repository's Strict SDK Dependency rule requires stopping here.

### Required public SDK contract

Add an additive contract in `@lunaris/filesystem`, for example:

```ts
interface FilesystemObservationApi {
  watch(
    target: FileTarget,
    owner: CancellationSignal,
    recursive?: boolean,
  ): Promise<FsResult<string>>;
}
```

Suggested token: `api:lunaris.filesystem-observation@1.0.0`, consumed with
`filesystem.access`. Continue delivering change notifications through the existing
`FileChanged` event and filtering by Vault/watch IDs. Keep the old Filesystem API
compatible; existing explicit `unwatch` may release a watch early and must remain
idempotent.

The filesystem provider owns cancellation bookkeeping and calls its driver through
its own live context. Required semantics:

- An already-aborted owner must not start a native watch. Return a documented
  cancellation failure (for example, a new additive `CANCELLED` FsErrorCode).
- If ownership ends during creation, release any late-created watch exactly once
  and return cancellation rather than exposing an unowned successful watch.
- Owner cancellation automatically releases the watch without consumer SDK calls.
  Do not publish further events for the released watch.
- Explicit unwatch, owner cancellation and Vault close are safe in any order and
  remove cancellation bookkeeping/listeners.
- Provider/driver shutdown must rely on their independently owned native session
  cleanup when SDK handles are closed. No cleanup path may invoke a closed handle.
- Unexpected cleanup failures use live-provider Logger where available and
  independent kernel/native diagnostics during shutdown; never the stopped
  consumer's Logger handle. Keep callback and cleanup promises handled.

No kernel runtime extension is expected: existing `CancellationSignal` and the
owned-root/location APIs demonstrate the provider-owned lifetime pattern. The
filesystem contract/provider need the extension; assess whether driver changes
are required for event suppression and pending-creation cleanup.

### Targeted acceptance checks

Test cancellation before creation, while driver creation is pending, after
successful creation, during an event and concurrently with Vault close. Test
explicit unwatch followed by owner cancellation, provider/driver shutdown and
consumer restart in an open Vault. Assert watcher counts return to baseline and
no late event, unhandled rejection or closed-scope SDK call occurs.

## Explorer integration and verification after the prerequisite

Require Logger and log readiness, operation outcomes, degradation and original
failures with the controller's plugin ID; never log contents or clipboard data.
Register localized messages and update the tab title/renderer props on locale
changes. Register through Sidebar, with no private layout/DOM access.

Compose the explorer in the Tauri host, grant filesystem/Vault access explicitly,
and update package references, boundary checks and scoped verification tooling.
Test lazy expansion, remount state, selection, transfer normalization/conflicts,
partial failures, stale responses, watch refresh and plugin replacement. Verify
the actual Arborist renderer with JSDOM and the production frontend build.
Virtualization limits rendered rows, not directory-list payloads; check a large
directory fixture and document remaining filesystem listing limits.

Native WebView layout, keyboard behavior and physical drag-and-drop need manual
acceptance by the Owner; desktop automation is prohibited. Opening files must be
reported as outstanding until a public document-opening contract and consumer
exist.

## References

- [Filesystem contract](filesystem.md)
- [Sidebar contract](sidebar.md)
- [Mantine component guide](../../plugins/UI/mantine-components/DOCS/README.md)
- [UI guidelines](../UI_GUIDELINES.md)
- [React Arborist](https://github.com/jameskerr/react-arborist)
- [Mantine UI compositions](https://ui.mantine.dev/category/navbars/)
