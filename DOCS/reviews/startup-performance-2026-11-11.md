# Startup and autosave performance review

1. **Status: partial remediation; startup work blocked on a public SDK contract.**
   The working tree was clean before development. Work is isolated on
   `fix/startup-and-autosave-performance`; no merge was performed. This is a
   focused client review, not a completed application-wide or server audit.
   The repository's Strict SDK Dependency rule requires stopping development
   when a missing public contract would otherwise require a workaround.

2. **Fixed: background explorer rescans caused redundant rendering.**
   `file-explorer/src/index.ts` forwards every matching FileChanged notification
   to a refresh. Previously each cached directory toggled the shared loading
   state twice. The Mantine explorer disables new-file, new-folder and expand
   actions while loading. Publishing also disposes the current context menu.
   A save could therefore pulse controls and dismiss a menu even when names and
   kinds were unchanged. Background scans now preserve loading state and publish
   structural changes or errors only. Metadata remains refreshed internally.
   Initial directory loads still show progress. No renderer styles changed.

3. **Evidence for the fix.**
   A real SDK controller test expands one folder and sends three rescan events:
   six directory reads still occur, but the published props retain identity,
   loading remains false, and an open context-menu action remains executable.
   Model tests additionally cover content metadata changes, rename, deletion,
   read failure and recovery. This proves behavior, not native visual acceptance.
   The existing Sidebar/Workspace/Mantine role integration remains in use;
   no new plugin connections or SDK contracts are required for this fix.

4. **Startup diagnosis: activation and usable product state are different.**
   `hosts/application/src/session.ts` awaits each kernel start and then publishes
   loaded. The kernel correctly awaits asynchronous activate functions. However,
   interface-settings starts Vault preference reads with `void load(session)`;
   text-editor starts document loading with `void current.load()`; explorer
   initializes its watch and tree in detached work. Workspace mounts its content
   only in response to loaded, so host activation completion is not even the end
   of all initial view construction. `composeSlotSurface` also explicitly enables
   early surface visibility. No browser paint measurements were taken.

5. **Existing contracts must be reused, but are not a complete readiness barrier.**
   Startup exposes a snapshot and event, with no consumer registration of awaited
   readiness work. PrepareVault already prepares candidate configuration.
   VaultLifecycle already awaits settlement before detached VaultChanged events;
   it must not be replaced with a parallel lifecycle. Nevertheless, product
   restoration currently starts in VaultChanged subscribers, and neither
   Startup nor Workspace has a shared observable preparing/ready/failed boundary
   covering settings, document restoration and initial content mounting.
   Waiting a fixed time, checking another plugin's DOM, or inspecting private
   plugin state would not provide this guarantee. Development stopped here.

6. **Required SDK change: proposed minimal readiness contract.**
   Extend the public startup/lifecycle contracts with owned readiness participant
   registration and an immutable readiness snapshot/event. Keep the existing
   Startup API compatible; use an additive contract rather than silently changing
   validation of version 1 payloads. This is a specification, not implemented API.
   Requirements:
   - A participant registers during activation, under its cancellation scope,
     with an ID and an asynchronous preparation callback. Registration alone
     must not claim readiness. The provider is replaceable and has no UI.
   - Each preparation attempt has an epoch, application/Vault context, explicit
     Vault ID where applicable, cancellation signal, bounded deadline and
     preparing/ready/failed outcome. An old completion cannot ready a newer epoch.
   - Seal the initial participant set after entrypoint activation. Host startup
     waits for required preparation before publishing loaded. Dynamically added
     contributions receive their own preparation lifecycle without reopening a
     completed global attempt or racing a sealed set.
   - Reuse VaultLifecycle settlement for Vault preparation and PrepareVault for
     candidate storage. Restore settings before restoring document/view state;
     document the ordering through public phases, not plugin IDs or incidental
     subscription order. Do not recursively open/close Vaults in settlement.
   - Make model preparation independent of visible mounting. Workspace must be
     able to construct required content while the existing loading surface is
     still authoritative, then expose it after readiness. No participant may
     wait for loaded if loaded is waiting for that participant.
   - Define required failure versus explicitly optional degradation. Preserve
     buffers and the existing save/release guards. A committed Vault cannot be
     falsely rolled back when preparation fails; expose failure/retry instead.
   - Cancellation removes registrations, prevents SDK calls after closure and
     cleans pending work. Diagnostics identify the participant and operation,
     retain the original error, and never include configuration contents.

7. **Integration required after the SDK contract is implemented.**
   Application host and startup-provider coordinate application preparation;
   Vault Manager supplies the existing transition boundary; interface-settings,
   ActiveDocument, text-editor and file-explorer declare their awaited work;
   Workspace and the runner consume readiness through public contracts.
   Theme-settings, Config and Localization remain the owners of their respective
   state. Lime/runtime participants must follow the same epoch and cancellation
   rules. These connections are outstanding. Test delayed reads, startup failure,
   Vault switching, stale completions, stop/retry, missing optional contributions
   and plugin replacement. Verify the actual composed application manually.

8. **Other confirmed work amplification; not yet optimized.**
   Config storage serializes reads by file and reads/decodes the complete TOML
   document for each namespace request. Any caching must retain external-edit
   detection and optimistic write conflict protection. The remote filesystem
   polls every 1500 ms and emits rescan with an empty paths list, forcing explorer
   to reread cached directories. Targeted remote changes need server/protocol
   support, retaining rescan for cursor gaps. The host polls every 250 ms, inspects
   the kernel in refresh and again during publication, and the view serializes
   the whole snapshot. These are source-confirmed operations, not measured
   dominant costs; profile before ranking them or adding caches.

9. **Verification and limits.**
   `node tools/scripts/check.mjs file-explorer` passed 113 tests including affected
   application-host/Tauri/web consumers, build, boundaries and type fixtures.
   After adding the final model regression, the targeted model/controller run
   passed all 23 tests. A separate startup/session/interface-settings/editor
   session run passed 56 of 57 tests; the same failure reproduced on rerun:
   `interface-settings/test/preferences.test.mjs` expects a theme list without
   the actual Lunaris entry. Neither that fixture nor theme code was modified.
   Resolve the product expectation before changing the assertion.

10. **Kernel baseline and remaining acceptance.**
    Existing `tools/scripts/benchmark.mjs`, Node 26.13.0, Windows x64:
    100-node dependency chain registration 5.14 ms, activation 4.19 ms, stop
    3.63 ms; 100 start/stop cycles 1.91 ms. Synthetic startup including imports
    was 59.72 ms. This single run does not measure real startup, network latency,
    document size effects or frame time, and proves no before/after speedup.
    Manual checks remain: type through several autosaves with Files open; retain
    an open menu and keyboard focus; create/delete/rename a file externally;
    confirm failures and retry still work. Desktop automation was not used.
    The startup change, full application audit and beta sign-off remain open.
