# System, plugin integration and UI audit

Remediation follow-up (2026-11-10): see [implementation status, regression results and remaining manual acceptance](audit-remediation-2026-11-10.md). Original findings below describe their reviewed baseline.

Date: 2026-11-09, Asia/Yekaterinburg.

Reviewed client: `a08d719e0faf9d06558d79eccdb332c6aff6da64`, branch `feat/maiami-night-theme`.
Paired server: `bbe9d6988ba4347ae1281c0e3e4d04183450d8a8` in the sibling `lunaris-server` repository.
Both working trees were clean at inspection. Product source was not changed.
The audit adds this report and an isolated reproduction script; no merge or deployment was performed.

## Assessment

Follow-up: the [deep non-UI code audit](deep-code-audit-2026-11-09.md) adds three reproduced defects (R10–R12) and one separately classified kernel defensive limitation. The nine findings below retain their original scope and status; no remediation is implied.

The SDK/kernel foundation has substantial lifecycle, permission and contract coverage. The product is nevertheless **not ready for an integration-stability sign-off**: the real client/server check fails, recoverable errors can shut down the whole application, and independent browser writers can destroy each other's recovery drafts.

This review identifies **nine actionable findings: three P1 and six P2**. Six have execution evidence (five focused probes plus one existing integration test); three are confirmed implementation/contract limitations from source inspection. Additional hypotheses and accepted constraints are separated below. No P0 was established. A passing unit suite is not evidence that the composed application is free of these defects.

Priority: P1 = potential loss of unsaved work or a failing essential integration gate; P2 = functional, accessibility or modularity defect requiring a bounded correction.

## Scope and method

- Source inspection: kernel API gateways, resolver, resource scopes, dispatch, lifecycle management and access checks; SDK trust/lifecycle documentation; application composition and host recovery.
- Product paths: Vault transitions, configuration storage, active document/editor sessions and preferences, filesystem router, remote transport/backend, account UI, browser drafts, update guards and status bar.
- UI: public Mantine roles, presentation ownership, Workspace/Sidebar geometry and keyboard handling, settings controls, account forms and context menus, CSS and localization checks. Reference: [UI guidelines](../UI_GUIDELINES.md) and [Mantine plugin guide](../../plugins/UI/mantine-components/DOCS/README.md).
- Native: targeted Windows filesystem tests and inspection of capability/path/version checks and platform-specific rename implementation.
- Cross-repository: real HTTP/server integration and the paired local gate. This is not a fresh exhaustive security audit of every server service or deployment script.

No OS/desktop automation was used. JSDOM probes exercise DOM behavior without a live desktop. Native appearance, real browser geometry, screenshots, screen-reader behavior, Docker and non-Windows execution remain unverified. This is a risk-based audit, not a claim of line-by-line coverage of every plugin.

## Findings

### R1 — P1: handled API failures trigger global shutdown without preserving local buffers

Evidence: [host diagnostic policy](../../hosts/application/src/session.ts#L48), [fault shutdown](../../hosts/application/src/session.ts#L268), [refresh](../../hosts/application/src/session.ts#L285), [editor disposal](../../plugins/UI/text-editor/src/index.ts#L281).

`ApiRuntime` records `API_CALL_FAILED` even when the consumer catches the exception. `HostSession.refresh()` treats this diagnostic as fatal, aborts the application and stops all plugins. Only `requestClose()` invokes `beforeClose`; fault recovery bypasses it. Editor disposal clears every session. Local files have no durable Drafts adapter, so an edit inside the autosave window can be lost when an unrelated plugin call throws. Optional-provider activation failures are also escalated by the host even if the kernel can run the consumer without that provider.

The focused probe catches an API error successfully, then calls `refresh()`: the host enters fallback, disposes the consumer and never calls a rejecting save guard. The local-buffer loss consequence follows from the editor cleanup path; no real user file was damaged in the probe.

Correction: distinguish an operation failure from an unusable application/dependency graph. Keep recoverable failures local. Define an emergency preservation path while dependencies remain usable; do not attempt SDK saves after abort. Review host recovery, editor, Vault and DocumentProtection together. Acceptance: a caught provider failure must not discard another plugin's dirty document; genuinely fatal teardown must have an explicit recovery outcome.

### R2 — P1: independent tabs overwrite the only recovery draft

Evidence: [draft key and database](../../plugins/systems/driver/browser-storage/src/index.ts#L10), [unconditional save](../../plugins/systems/driver/browser-storage/src/index.ts#L43), [protection predicate](../../plugins/UI/text-editor/src/index.ts#L47), [Drafts contracts](../../packages/remote/src/index.ts#L69).

The key contains server/account/Vault/path but no writer identity. `save` unconditionally replaces the previous record. Conditional `remove` protects a newer revision against an old acknowledgement, but does not protect a different writer's text against a newer save.

Reproduction uses two independent plugin hosts and IDB connections sharing one in-memory database. Writer A saves unsynchronized text; B saves different text at the same key; A reads B's text. Removing B's revision leaves no draft for A. Both saves return success. A real tab A can still retain `draftSaved=true` and therefore permit close without a warning after its durable copy has been overwritten by B.

Correction: preserve drafts per writer/session, or introduce an explicit conditional-write/conflict contract and ownership protocol. Do not silently select one competing draft during recovery. This requires a public `Drafts`/`DraftStorage` contract decision before implementation under the strict SDK rule. Connect editor, drafts provider, browser storage and navigation protection; test two writers, offline restart, save acknowledgement and recovery selection.

### R3 — P1: editor preferences access a retired dependency during ordered shutdown

Evidence: [alive check](../../plugins/UI/text-editor/src/preferences.ts#L29), [catch/finally](../../plugins/UI/text-editor/src/preferences.ts#L88), [unobserved ready assignment](../../plugins/UI/text-editor/src/preferences.ts#L112), [real integration test](../../tools/scripts/remote-integration.test.mjs#L27).

The local scope can still be open while its required provider is already unavailable during dependency-ordered shutdown. `alive()` assumes `!ctx.signal.aborted` makes `vaults.current()` safe. When an outstanding preferences load resumes, that call throws `PROVIDER_UNAVAILABLE`; catch/finally invoke `alive()` again and can throw again. `session.ready = load(session)` is not consistently observed.

`npm run remote:check` fails with 51 passed / 1 failed, `failureType: unhandledRejection`, with stack `Access.available -> current -> alive -> load`. The same failure occurred through `server:check` and in a subsequent standalone remote run, excluding the initial parallel-run timing as the sole explanation.

Correction: make liveness checks tolerate documented SDK unavailability and observe background task rejection. The editor's document-session liveness adapter already catches `isSdkUnavailable`; apply the same contract-aware approach to preferences. Audit analogous checks in File Explorer preferences, where the pattern is also present, but do not claim that path was reproduced. Acceptance: existing real-server delayed-read shutdown test passes without unhandled rejection and without suppressing unrelated failures. No new SDK method is necessary for this correction.

### R4 — P2: discarded drafts can return and be autosaved again

Evidence: [discard path](../../plugins/UI/text-editor/src/session.ts#L100), [recovery scheduling](../../plugins/UI/text-editor/src/session.ts#L112), [save cleanup](../../plugins/UI/text-editor/src/session.ts#L149).

`load(true)` awaits `draft.remove` but ignores its `FsResult`. Even on an IO failure it clears the local draft state and loads disk content as clean. On the next open, the undeleted draft is recovered. If its expected version still matches disk, it becomes eligible for automatic save, undoing the user's explicit discard decision. Cleanup after successful writes also ignores removal failures.

The focused probe injects a failing removal, observes a clean disk view with no error, then opens a new session and recovers the supposedly discarded text.

Correction: make discard acknowledgement depend on successful durable removal, retain/reveal an actionable failure and coordinate queued draft saves with discard. Test failure results, thrown failures, delayed writes and reopen. Connect DocumentSession to Drafts through the existing public result contract.

### R5 — P2: Workspace cancels keyboard navigation outside its owned region

Evidence: [Workspace key handler](../../plugins/UI/mantine-components/src/sidebar.tsx#L35).

Workspace installs a capture listener on `document`, cancels every Tab/Shift+Tab and stops propagation unless the event path contains `contenteditable`. Normal inputs, buttons, pickers and content outside Workspace are affected. This prevents ordinary form traversal and overrides other components' keyboard behavior. It violates region ownership and the guideline to preserve deliberate keyboard navigation.

The public component-role probe mounts Workspace, dispatches Tab on a sibling input outside its target, and verifies `defaultPrevented=true`. JSDOM establishes event interception, not visual focus geometry.

Correction: remove document-wide interception and scope any specialized navigation to its owning control. Preserve native input/form traversal and component focus management. Acceptance: Tab/Shift+Tab through settings, rename/create forms and an unrelated sibling view; CodeMirror retains its own indentation behavior.

### R6 — P2: application composition cannot replace bundled providers through its extension API

Evidence: [fixed providers and feature switch](../../hosts/application/src/composition.ts#L50), [fixed registry](../../hosts/application/src/composition.ts#L87), [host definition](../../hosts/application/src/session.ts#L9).

Extensions append plugins but cannot exclude a built-in provider or declare provider selections. A replacement Logger with the same ID is rejected as duplicate. A replacement with a different ID but the same contract leaves multiple candidates; the resolver requires explicit selection. The host never applies `kernel.selectProvider`, and the application definition has no selections field. The default Files feature is compulsory because File Explorer owns Vault navigation.

This is a composition limitation, not a claim that the kernel lacks replacement support: a custom host can construct another registry and use the public selection API. The shipped composition requires source edits for substitutions that the product architecture presents as interchangeable.

Correction: add a small host-owned replacement/selection configuration, with validated defaults and duplicate checks; separate Vault navigation ownership from File Explorer if editor-only profiles are required. Keep the existing kernel selector. Acceptance: replace Logger and one backend without modifying consuming plugins; verify feature omission and required navigation.

### R7 — P2: structured server failures incorrectly announce recovery

Evidence: [response classification](../../plugins/systems/driver/server-transport/src/index.ts#L43), [status-bar consumer](../../plugins/UI/status-bar/src/index.ts#L31), [editor retry subscription](../../plugins/UI/text-editor/src/index.ts#L139).

A failed/non-JSON 5xx response produces `offline`, but a valid JSON failure envelope with `SERVER_UNAVAILABLE` falls through to `status("connected")`. HTTP status is not checked on that path. The probe returns JSON HTTP 503: the caller receives `SERVER_UNAVAILABLE` while ConnectionStatus says `connected`.

This can show a false recovery indicator and trigger retries from ConnectionChanged while the operation service is still unavailable. ConnectionStatus is explicitly an observed outcome, so it need not be a reachability promise, but equivalent failures should not change classification based on response encoding.

Correction: define classification for transport failures, 5xx, session failures and ordinary business refusals, then publish consistent state. Test both JSON and non-JSON 503 and avoid treating ordinary validation errors as offline.

### R8 — P2: remote filesystem capabilities advertise an unsupported maximum

Evidence: [remote capabilities](../../plugins/systems/driver/remote-filesystem/src/index.ts#L21), [server-info contract](../../packages/remote/src/index.ts#L13). Paired server: `plugins/systems/driver/http/index.mjs:55`.

The remote backend advertises `maxFileBytes: Number.MAX_SAFE_INTEGER`; the server HTTP file-request envelope is capped at 16 MiB. JSON arrays, escaping and metadata mean a raw file limit cannot simply equal that envelope limit. No capability/limit negotiation exists in ServerInfo. Native/router limits can also differ from the selected remote source.

This does not bypass server admission. It makes the published contract misleading and permits expensive client serialization of requests that the server will reject. This finding is source-confirmed; no oversized live upload was performed.

Correction: specify remote content and encoded-request limits in the public protocol, expose conservative per-source capabilities, and reject excessive content before serialization. Integrate server policy, transport, remote backend and filesystem consumers. Test boundaries for text and binary encodings. This contract change must precede plugin implementation.

### R9 — P2: generic Config owns a concrete Vault plugin's metadata

Evidence: [PrepareVault integration](../../plugins/systems/config/src/index.ts#L39).

Config reads/writes the hardcoded `lunaris.vault-manager` namespace and interprets its `name` key while preparing every Vault, at hook priority -100. Storage infrastructure therefore contains Vault product policy and a concrete implementation namespace. Replacing the Vault implementation does not make this coupling disappear: it must retain the old storage convention or change generic Config.

Correction: keep file creation/serialization in Config; move Vault name interpretation and migration to a metadata owner using public Config and PrepareVault contracts. Preserve existing data through a documented migration. No general-purpose framework is needed. Acceptance: replacement Vault provider can retain/read existing names through an explicit contract without putting product policy back into storage.

## Hardcode inventory and interpretation

Literal values are not automatically defects. Stable public contract IDs, protocol discriminators and default theme values are expected. The problem is a hidden policy, duplicated source of truth or implementation identity crossing an ownership boundary.

| Location | Hardcoded assumption | Classification / action |
| --- | --- | --- |
| `hosts/application/src/composition.ts:50-87` | Concrete Logger/UI/theme/service set; only editor/files/settings profiles; Files mandatory | R6, replacement limitation |
| `plugins/systems/config/src/index.ts:45` | `lunaris.vault-manager`, `name`, prepare priority -100 | R9, policy coupling |
| `packages/kernel/src/kernel.ts:73`; `hosts/application/src/session.ts:78` | Runtime SDK/engine versions `0.1.0` | Duplicated release metadata; generate from one authoritative build input |
| `hosts/application/src/composition.ts:71-72` | Monochrome theme ID in two settings factories | Valid default, but fragile replacement/migration assumption |
| `plugins/systems/driver/remote-filesystem/src/index.ts:21` | Unlimited-looking maxFileBytes | R8, inaccurate capability |
| Same file, `describe()` | Remote reference is account ID plus 36-character hexadecimal/hyphen Vault ID | Backend protocol assumption stricter than generic `RemoteVault.id: string`; document centrally |
| Same file, poll timer | 1,500 ms observation interval | Fixed cost per active client; expose policy/backoff only if measurements justify it |
| `plugins/systems/client-updates/src/index.ts` | 60-second interval, UUID-shaped build IDs | Contract says string while detector silently ignores other valid strings; align protocol/build-ID specification |
| `plugins/UI/text-editor/src/session.ts:8` | 1,000 ms autosave | Reasonable named default, not itself a bug |
| `plugins/systems/driver/server-transport/src/index.ts:10` | 30-second timeout | Configurable default; appropriate bounded operation |
| `plugins/UI/mantine-components/src/sidebar.tsx:33-70` | 264 px reservation, 60%, 12rem/16rem pane minima, 288 px default | Mixed units and constraints; narrow/zoom acceptance pending |
| `plugins/UI/mantine-components/styles.css:284` onward | Theme-specific fixed dimensions | Theme styling is legitimate; verify large fonts/high zoom and short windows |
| Browser storage | `lunaris-device-v1`, schema version 1 | Intentional storage protocol; writer ownership is missing, R2 |
| Native filesystem | 64 MiB in TypeScript and Rust | Bounded default duplicated across bridge; keep capabilities and enforcement synchronized |
| Public role IDs such as `lunaris.workspace-layout` | Explicit shared contract names | Not cross-plugin implementation coupling by themselves |

## Architectural assumptions and remaining risks

1. **Trusted single JavaScript realm.** Permissions govern SDK calls, not hostile plugin code. Ambient globals and returned objects are not a sandbox. This is documented in [permissions](../concepts/permissions.md); do not market the present model as isolation of untrusted plugins.
2. **Cooperative cancellation.** Abort/deadlines cannot kill arbitrary JavaScript or undo completed external side effects. An open consumer scope does not prove that every bound provider remains callable (R3).
3. **Unbounded runtime dispatch.** `DispatchRuntime` awaits event/hook handlers sequentially. A never-settling handler can stall a caller such as a Vault transition; activation/cleanup deadlines do not impose a general runtime-call deadline. Treat as a contract/liveness risk, not a reproduced hang in this audit. Define timeout/cancellation ownership before adding generic timeouts.
4. **Full-document draft work per edit.** Each edit queues a full text snapshot for persistence. Slow storage and large documents may build a backlog; no performance bound was measured. Coalesce obsolete pending snapshots while preserving the most recent recoverable revision, then benchmark before changing policy.
5. **Platform scope.** Native no-replace rename explicitly returns Unsupported on non-Windows. Windows tests do not certify Linux/macOS/Capacitor behavior. The abstraction exists; implementation coverage is narrower.
6. **Shared configuration authority.** A caller with Config access supplies a namespace; this is trusted shared access, not per-plugin confidentiality. Do not infer namespace isolation from the plugin ID parameter.
7. **Build-time product composition.** Static imports and feature flags are a legitimate initial host strategy, but are not runtime plugin installation/uninstallation. Existing dependency selection and contribution APIs should be reused before introducing a plugin manager.
8. **Localization check scope.** The successful script verifies discovered bilingual catalogs and placeholders. It scans top-level UI `.ts` catalogs, not every JSX literal or every failure path; it does not establish complete visual localization or screen-reader quality.

## UI ownership and manual acceptance

The intended ownership is sound: WorkspaceLayout supplies rail/panel surfaces and main geometry; Sidebar supplies selection/contribution routing; File Explorer and settings navigation supply embedded content; the active main region remains open. `ComponentPresentation` explicitly distinguishes embedded/standalone roots. Settings dropdowns use themed Mantine Combobox, and consumers use public component roles rather than React/Mantine imports.

The concrete violation is the document-wide keyboard interception (R5). Geometry issues below are **pending hypotheses**, not reported as observed clipping. Mixed px/rem pane constraints and non-portaled menus inside scrolling regions warrant composed checks.

Owner manual checks required by repository policy:

| Scenario | Required observation |
| --- | --- |
| Workspace at 320 px, 768 px and ordinary desktop widths; short window; 200% zoom | Panel/main remain reachable, no meaningful controls clipped, local scrolling works |
| Keyboard in Settings, Explorer create/rename and account forms | Tab/Shift+Tab traverse inputs/actions; focus is visible; Escape closes only the intended surface |
| Open settings Combobox, Explorer menus, account menus and context submenus at edges | Menu stays visible and themed, selection/disabled/focus states remain readable |
| Monochrome, light/dark and XP-style themes; long Russian names | One surface per owner, active file marker preserved, no theme background covers a borrowed region |
| Offline edit, session expiry, reconnect and server 503 | Buffer retained, draft status truthful, retry outcome reflected consistently |
| Two tabs editing one file | Reproduce only with disposable data until R2 is fixed; neither recovery draft silently disappears |

Visual acceptance remains pending. Automated DOM and behavior tests do not replace these checks.

## Verification ledger

| Check | Result |
| --- | --- |
| `npm run check -- kernel` | PASS: 322 tests, 0 skipped; affected hosts/test kit/CLI, compilation, boundaries and type fixtures |
| `npm run check -- text-editor mantine-components account-session server-transport remote-filesystem filesystem-provider config-manager vault-manager` | PASS: 255 tests, 0 skipped; compilation, boundaries and type fixtures |
| `npm run ui-localization:check` | PASS: 18 catalogs, 348 messages, matching keys/placeholders |
| `npm run audit` | PASS before this report: 63 documentation files, public exports, dependencies and links |
| `cargo test --locked -p lunaris-filesystem-native -- --test-threads=1` from `hosts/tauri/src-tauri` | PASS: 12 Windows native tests |
| `node tools/scripts/system-review.mjs` | Five defect observations reproduced; in-memory/mock data only |
| `npm run remote:check` | FAIL: 51 passed, 1 failed; R3; repeated standalone with the same stack |
| `npm run server:check` | FAIL at its client/server integration stage, R3; later backend/dev-sync stages not reached by that command |
| `node tools/scripts/check.mjs` in the sibling server repository, separately | PASS: 24 source files, 20 tests, 0 skipped |
| `node tools/scripts/audit.mjs --docs-only` after adding this report | PASS: 64 documentation files, local links |

Counts overlap and must not be added. An initial direct `node tools/scripts/check.mjs kernel` invocation stopped at the CLI fixture's requirement to run under npm; the documented npm invocation above passed. This invocation issue is not a product defect.

The [reproduction script](../../tools/scripts/system-review.mjs) intentionally asserts the observed broken behavior, so exit 0 means **confirmed findings**, not product health. Run the relevant build/check command before using it against changed source. Convert probes to desired-behavior regressions when implementing fixes.

## Remediation order and integration gates

1. Fix R3 and restore the paired integration gate; review analogous preference continuations. Re-run the failing shutdown scenario before widening checks.
2. Define and fix R1 fault classification/preservation and R2 writer-safe drafts. These affect data safety; agree the public draft contract before changing plugins.
3. Fix R4 durable discard handling and R5 keyboard ownership, with composed regression cases and the manual UI matrix above.
4. Align R7 status classification and R8 remote capability/protocol limits across client and server.
5. Improve composition replacement (R6) and move Vault metadata policy out of generic Config (R9), retaining existing public APIs where sufficient.

No integration is claimed complete by this audit: implementation remains unchanged. The report identifies concrete owners/contracts and acceptance criteria rather than prescribing a broad architecture rewrite.
