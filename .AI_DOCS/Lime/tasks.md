# Implementation task backlog

Implementation is in progress; no task's full completion gate has passed yet.
The Owner explicitly authorized all SDK/kernel/host prerequisite work on 2026-11-10.
Do not stop merely to request that authorization again. IDs are stable tracking keys. Work in dependency order;
each task must produce reviewable contracts/docs and targeted verification.

## L01 - Runtime boundary and integration specification

Dependencies: none.

Status (2026-11-10): source audit and prerequisite specification delivered in
[`DOCS/design/lime-runtime.md`](../../DOCS/design/lime-runtime.md). Gate blocked:
current synchronous DOM-bearing SDK contracts have no verified execution boundary
that preserves extension parity and prevents out-of-Vault access. Native sessions
and Config global access also need authenticated environment authority. Required
runtime management, selected-package transport and awaited Vault lifecycle
contracts are specified there as B01-B04. Follow-up implementation now includes
QuickJS/WASM isolated execution and an SDK bridge (sync/async APIs, callbacks,
validators, signals and scopes). Custom DOM-free viewport contracts, full host
authority review, product composition and host acceptance remain outstanding.

Implementation evidence (2026-11-10):

- L02 partial: shared metadata validator and bounded LUP codec implemented;
  public references are `DOCS/reference/plugin-metadata.md` and `DOCS/reference/lup.md`.
  Installation layout, registry and migration/transaction semantics remain pending.
- L03 partial: Kernel.replace/unregister and host lifecycle ownership implemented;
  focused kernel/affected-consumer checks pass. Public management adapter,
  environment revisions and execution-driver factory rebinding remain pending.
- L04 partial: QuickJS driver and SDK bridge execute isolated definitions against
  the actual public kernel. Scoped Config/Filesystem calls tested. Package picker,
  storage/extraction, real native/browser execution and authority review pending.
- L08 partial: existing CLI now bundles and packs complete static code plus assets
  and inspects .lup without evaluation. External portable generation, distribution
  rehearsal, live host attachment and JSON diagnostic unification remain pending.
- L05-L07, L09 full recipes and L10 acceptance remain pending. No engine/UI
  integration or complete user install workflow is claimed.

- Map required/existing/new responsibilities using the decision inventory.
- Trace current host composition, native bridge, Vault preparation/closure, Config,
  Filesystem, Logger, Settings, Components and provider replacement behavior.
- Specify code execution and native access boundaries, Vault-scoped identity,
  no-prompt authority policy, safe-mode bootstrap and host support matrix.
- Specify the public SDK extensions required for Lime; no kernel object in plugin
  contexts and no private host closures imported by Lime.
- Audit arbitrary UI/custom viewport authoring through public SDK roles. Existing
  fixed product roles must not become the limit of third-party extensibility.
- Deliver public design/decision documents under `DOCS/`, with explicit limits.

Gate: every integration has an owner/public contract; conflicting requirements and
missing SDK primitives have concrete specifications before dependent implementation.

## L02 - Manifest and LUP package specification

Dependencies: L01.

- Define metadata schema, localization behavior, custom display fields and validation.
- Define `universal`/desktop/web/mobile semantics and compatibility with legacy targets.
- Define the versioned archive, complete built assets, module entry and import rules.
- Define package inspection before evaluation, size/count/expansion limits, duplicate
  paths, traversal, symlinks, malformed metadata and identity mismatch handling.
- Define portable on-disk code/data/config/state layout, committed installation
  records, synchronization conflicts and supported version transitions.
- Extend the existing manifest validator; share one implementation across host/CLI.

Gate: schema fixtures cover legacy built-ins, valid metadata and rejected packages;
author and installer consume the same documented format without executing previews.

## L03 - Kernel lifecycle and public runtime management

Dependencies: L01; L02 identity/version rules.

- Implement specified unregister/replacement operations and queue/concurrency rules.
- Define required-consumer stop/restart ordering, provider selection migration,
  optional dependency rebinding and duplicate/built-in ID behavior.
- Add a narrow host-backed SDK management contract accessible by the Lime service;
  distinguish architectural parity from exposing raw kernel internals.
- Resolve automatic internal grants with current declarations; no permission UI.
- Preserve scoped handles, cancellation, cleanup deadlines, original diagnostics and
  stale-activation rejection. Define stop failure and noncooperative code outcomes.

Gate: focused lifecycle tests prove replacement, consumer recovery, rollback and
stale-call rejection; unrelated active services stay intact where graph rules allow.

## L04 - Package transport, storage and execution adapters

Dependencies: L01-L03.

- Add public provider/driver contracts for selecting an external package, reading
  only the selected import and loading validated Vault-owned code/resources.
- Implement host adapters in the correct driver folders, reusing existing I/O.
- Implement extraction staging, atomic commit/recovery journal as supported, fresh
  code loading, cleanup and installation interruption recovery.
- Keep platform imports in drivers. Define web/mobile storage and execution paths
  explicitly; report unsupported host capabilities instead of emulating success.
- Verify installed plugin code cannot use the host bridge to read outside the Vault.

Gate: package import/load works through public contracts, malicious paths cannot
escape the installation root, and outside-file access claims have host evidence.

## L05 - Lunaris Lime engine

Dependencies: L02-L04.

- Implement the replaceable service in `plugins/systems/lime` with separate package,
  installation, dependency and lifecycle responsibilities where warranted.
- Publish preview/list/install/enable/disable/update/remove/retry operations and
  committed state/progress events; finalize names and result/error contracts first.
- Preview is bound to the exact confirmed package bytes/version, not a mutable path.
- Bind every operation to a captured Vault and cancellation/transition generation;
  a pending install must never land in a newly selected Vault.
- Separate installed/enabled/runtime states; persist only durable state, not stale
  active/failed process snapshots. Handle platform warnings and missing dependencies.
- Implement explicit provider choice, affected-dependent reporting, update rollback,
  migration recovery and remove-with-data-choice.
- Require Logger and document APIs/events, integration and cleanup in plugin DOCS.

Gate: headless engine tests cover the acceptance scenarios without depending on UI.

## L06 - Vault lifecycle and recovery integration

Dependencies: L03-L05.

- Integrate preparation/commit/close with Vault and Startup public contracts.
- Stop old Vault plugins and cancel work before releasing their resources; start
  new Vault plugins only against their committed environment. Preserve old Vault
  usability if preparation fails according to the specified transition policy.
- Keep safe-mode entry and essential recovery outside third-party execution, even
  when a plugin replaces a normally essential provider or fails synchronously.
- Restore enabled state on reopen/copy without adding a new permission/trust prompt.
- Handle read-only/missing storage, malformed state and externally changed packages.

Gate: same plugin ID in two Vaults never shares instance/data/settings accidentally;
failed opens and safe-mode recovery have focused integration evidence.

## L07 - Lime settings UI and shared component roles

Dependencies: L05-L06; L01 custom UI route.

- Implement `plugins/UI/lime-settings` as a public Settings/Components consumer.
- Reference existing Settings headers/rows and shared Mantine interactions before
  implementing. Consult Mantine UI compositions during implementation.
- Specify region ownership: Workspace/Settings container owns geometry/surface;
  Lime content inherits it; Mantine owns visible control rendering.
- Provide preview/confirmation, metadata/details, platform-risk action, meaningful
  states, local dependency resolution, update, retry and data-retention choice.
- Empty/no-Vault/cancel/busy/error states need concrete behavior. Preserve focus,
  long metadata, localization and narrow/short layout resilience.
- Keep Lime UI dependent on engine contracts only. Extend Mantine public roles
  when needed; no React/Mantine imports in the consumer or retired kit extensions.
- Add plugin DOCS, required Logger and the explicit integration assessment.

Gate: composed behavior tests pass; Owner manual visual/native checks remain tracked
until performed, including opened menus, themes and compact layouts.

## L08 - External CLI, development session and packaging

Dependencies: L02-L06; may begin design after L01.

- Extend existing CLI/development packages following the DX specification.
- Create self-contained plugin projects without monorepo-relative dependencies.
- Add supported host attachment, focused rebuild/live replacement and disconnect
  cleanup against a disposable development Vault, not an arbitrary production Vault.
- Implement shared validation and `.lup` packaging, readable/JSON diagnostics,
  inspect and concise command summaries. Finalize commands before documenting them.
- Provide a reproducible external install/bootstrap path; tool publication requires
  separate authorization, while local packed distribution rehearsal does not.
- Put repeated checks/rehearsals under `tools/scripts/` and reuse scoped check tools.

Gate: clean external-directory rehearsal completes create/dev/check/pack/install
without consulting or linking the Lunaris checkout.

## L09 - Public documentation, recipes and agent guidance

Dependencies: L01-L08 contracts as they land; not postponed until completion.

- Write quickstart, manifest/package reference, contract catalog, lifecycle,
  provider replacement, recovery, migrations and troubleshooting in `DOCS/`.
- Supply minimal working examples: settings and persistence, a custom non-Markdown
  view, two-plugin dependency, replaceable provider and owned cleanup.
- Generate concise agent instructions in external projects, linking canonical
  supported imports/contracts and prohibiting invented APIs/private imports.
- Check examples against actual exports, manifests and package tooling; mark
  proposals unavailable until implemented. Record tool/SDK/host compatibility.

Gate: documented workflows and examples compile/run/package; no undocumented
knowledge is required to complete the independent-author acceptance exercise.

## L10 - End-to-end acceptance and branch handoff

Dependencies: L01-L09.

- Execute the acceptance matrix with targeted suites and reusable concise scripts.
- Rehearse normal install/update/remove, Vault switching/copy, dependency/provider
  changes, interrupted updates and safe-mode recovery on supported hosts.
- Complete external human/AI authoring exercise with documentation as the only
  architecture reference. Do not spawn agents without separate authorization.
- Record exact verified hosts, manual pending checks, residual limits and outstanding
  integrations. Commit final documentation and hand off the branch for Owner review.

Gate: all required scenarios have evidence or explicit unresolved failures. Do not
mark the branch complete merely because individual plugins or unit tests pass.
