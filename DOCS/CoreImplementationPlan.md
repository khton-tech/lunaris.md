# Core implementation plan

## Vault selector delivery — 2026-11-05

Delivered on `feat/vault-selector`: durable folder locations and native restoration,
persisted Vault display names, a dedicated recent-history provider, a themed
Components Kit selector role with Lucide controls, and an SDK-only UI controller.
Tauri releases the runner after loading and mounts the selector with recent Vaults
on the left third and actions on the right two thirds. Cancellation, retry,
duplicate-submit prevention, history reopening and late-result shutdown are
covered by targeted DOM/service tests. Native layout/dialog acceptance remains
manual. Editor/workspace navigation remains deferred; successful opening displays
the active Vault name without navigating to an empty surface. See
[selector integration and acceptance](../plugins/UI/vault-selector/DOCS/README.md).

Status: adjusted local 0.1 implementation complete. 43 tasks DONE; K07.2/K07.3/K07.5 DEFERRED by Owner. Local release checks pass; merge/publishing require separate authorization.
Baseline date: 2026-11-03.
Source: [architecture proposal](TechDoc.md) and [repository rules](../AGENTS.md).

## 1. Outcome and current state

Build a small, platform-independent plugin runtime with an ergonomic public SDK. A plugin author should be able to declare a manifest, activate a plugin, consume or provide a typed capability, and release all owned resources without importing runtime internals.

Repository inspection found only `AGENTS.md` and `DOCS/TechDoc.md`. No application, SDK, runtime, manifest schema, tests, package manifests, Cargo workspace, or automation exists. Git was initialized on `main`; the original documents were committed before this plan was written.

Tools observed locally: Git 2.53.0.windows.3, Node v26.13.0, npm 11.20.0, Cargo 1.99.1, and rustc 1.99.1. These are environment observations, not a selected support matrix. No application build or native target has been validated. Dependency versions must be selected and locked during foundation work.

### Required, existing, and to create

| Responsibility | Existing | Required work |
|---|---|---|
| Architecture and project policy | Proposal and AGENTS.md | Resolve open semantics and maintain decisions |
| Public plugin boundary | Illustrative examples | SDK types, runtime facade, manifest schema, API reference |
| Runtime composition | None | Registry, scopes, lifecycle, resolution, contracts |
| Extension primitives | None | Distinct API, event, and hook behavior |
| Access control | Proposal only | Host policy, scoped permission gateway, revocation |
| Host/loader | None | In-memory host first, local development loader later |
| Developer workflow | Node/npm available | Workspace, focused checks, CLI, examples, test kit |
| Platform integration | Rust tools available | Future platform hosts and driver plugins; no native core required initially |
| Application capabilities | None | Separate logger and command plugins for validation; UI and storage later |

## 2. Delivery boundaries

### First usable core: 0.1

Deliver SDK-first plugin definitions; validated manifests; deterministic registration and dependency resolution; transactional activation; cancellation and cleanup; typed API/event/hook contracts; scoped access control; structured diagnostics; an in-memory test host; a reusable test kit (standalone reference plugins deferred by Owner); and local `create-plugin`, `dev`, `test`, `validate`, and `inspect` workflows. Version numbers and CLI names below express intended behavior, not existing commands.

Use trusted, locally supplied plugins in one JavaScript realm for this milestone. This is a logical sandbox, not hostile-code isolation: a plugin can still access ambient JavaScript globals. SDK permission checks protect mediated operations; they do not make arbitrary JavaScript safe. Never claim that static import checks or TypeScript types create a security boundary.

### Deferred beyond 0.1

- Markdown/editor features, tabs, themes, layout, localization implementation, and product UI.
- Real filesystem, network, clipboard, storage, and native bridge capabilities.
- Tauri/Capacitor applications, native Rust runtime, and mobile packaging.
- Marketplace, remote downloads, publishing, signatures, certification, and billing.
- Worker/process/WASM isolation, transparent hot swapping, remote RPC, lazy activation, contract adapters, and migration generators.

Design extension points for these needs only where the first milestone requires them. Do not build speculative abstractions. Local pack validation and compatibility hardening follow 0.1; public distribution requires a separate security and delivery plan.

## 3. Architecture baseline and decision gate

The following are proposed implementation defaults. Record them in `DOCS/decisions/` during P0, including alternatives, consequences, and acceptance evidence. A change to an accepted decision must update affected tasks and tests.

| ID | Decision to settle before dependent work | Proposed default | Unlocks |
|---|---|---|---|
| D01 | Runtime language and platform boundary | TypeScript runtime and SDK; no Node, DOM, Tauri, or Capacitor dependency in kernel; Rust only when a native host needs it | P1 |
| D02 | Workspace and package boundaries | npm workspaces, locked dependencies, TypeScript strict mode; select test/build tools at P1 without writing custom infrastructure | P1 |
| D03 | Authoritative manifest and declarations | One serializable manifest for identity, versions, provides/requires, and permissions; definition references it; validate token declarations against it | P2, P4 |
| D04 | SDK versus privileged host API | Plugins import SDK and shared contracts only; host has a separate management API; kernel implements SDK contracts without exposing internals | P2, P3 |
| D05 | Contract identity and multiplicity | Canonical string ID plus full semantic version; one selected provider per API requirement in 0.1; reject ambiguity unless host explicitly selects | P4 |
| D06 | Lifecycle concurrency and failure | Serialize management transitions per plugin; reject reentrant cycles; transactional registrations; bounded stop; no forced JS termination | P3 |
| D07 | Ordering and dispatch | Deterministic start/stop; events are notifications; hooks are sequential waterfall pipelines with documented failure semantics | P4, P5 |
| D08 | Permission policy and trust | Host owns grants; manifests request access but never grant it; recheck revocable handles on every call; trusted local code only | P6 |
| D09 | Logging and commands | Replaceable capability plugins outside kernel; bounded internal diagnostics available before a logger exists; commands excluded from base context | P2, P7 |
| D10 | Version and support policy | Independently version plugin/kernel/SDK/contracts; initial 0.x policy; select tested Node/browser targets before claiming support | P1, P9 |

The source proposal's `ctx.log` and `ctx.commands` examples must not silently turn application services into mandatory kernel dependencies. Prefer ordinary typed capabilities; convenience SDK accessors may be added only with documented optionality and no hidden coupling.

### Dependency direction

```text
plugin -> public SDK + shared capability contracts
host/loader -> kernel management API
kernel -> SDK contract definitions and platform-neutral utilities
provider plugin -> SDK -> driver contract -> selected driver plugin
native driver -> platform bridge (restricted to the driver boundary)
```

The SDK must not import the concrete kernel. A host composes the implementation. A plugin must not import another plugin's implementation, reach a registry directly, or obtain raw host objects. Platform calls are confined to the appropriate driver; consumers access a provider through the SDK.

### Proposed repository layout

Create directories when their first task needs them, not as empty scaffolding.

```text
DOCS/
  decisions/
  quickstart/
  concepts/
  guides/
  reference/
  releases/
.AI_DOCS/                        # Agent-only temporary plans/data
packages/
  sdk/                          # Public definitions and scoped interfaces
  kernel/                       # Runtime and host-facing management API
  manifest/                     # Shared schema and validation
  test/                         # In-memory host and fixtures helpers
  cli/                          # Local developer commands
  contracts/                    # Initial shared capability definitions
hosts/
  development/                  # Local loader; Node-specific work lives here
plugins/
  systems/
    logger/                     # Replaceable logging capability
    commands/                   # Replaceable command capability
    driver/<plugin_name>/       # Future platform drivers
  UI/<plugin_name>/              # Future UI components
examples/plugins/<example>/      # SDK-only instructional fixtures
tools/scripts/                  # Repeatable repository workflows
```

Each actual plugin, including instructional examples, has a `DOCS/` folder covering purpose, usage, provided/required APIs, emitted/subscribed events, hooks, permissions, and lifecycle behavior. Use English for new documentation and comments. Future UI-facing messages use stable localization keys and parameters; runtime diagnostic codes remain stable and machine-readable.

## 4. Runtime behavior to specify and test

### Lifecycle and ownership

States: `registered -> resolving -> starting -> active -> stopping -> stopped`. Resolution or activation can lead to `failed`; retry from `failed` or restart from `stopped` creates a fresh scope. Invalid transitions return structured errors. Registration validates metadata without executing plugin code.

Activation stages registrations privately until successful completion. Required consumers start only after their provider commits activation. Failed activation rolls back all staged registrations and resources. External effects cannot be rolled back automatically; authors must use scoped cleanup or explicitly document irreversible work.

Stop first marks the scope closed and aborts its signal, then runs plugin teardown and owned disposables in a documented reverse order. Cleanup is idempotent and continues after individual errors; failures are aggregated. Late async registrations are rejected and immediately disposed where applicable. Each activation has an identity so stale completions cannot mutate a later activation.

A host-configurable deadline bounds waiting for activation and teardown. Timeout closes SDK access and records a failure; it cannot terminate arbitrary JavaScript. A non-cooperative plugin may keep executing in the logical sandbox. The host must report this accurately.

### Contract resolution and provider loss

Resolve required capability edges before execution. Missing or incompatible required contracts prevent activation; absent optional contracts do not. Explain cycles using the dependency path. Use deterministic topological ordering and stable ID tie breaks. Stop consumers before providers in reverse dependency order.

Use a mature version-range implementation rather than inventing a parser. Specify prerelease handling, engine/SDK compatibility, duplicate contract IDs, incompatible token metadata, and multiple major versions in D05/D10. Token identity must survive duplicate copies of a contract package; object identity alone is insufficient.

For 0.1, choose providers at activation. An optional dependency is a fixed available/absent binding for that activation. Provider loss invalidates existing handles and stops required consumers; optional consumers get a documented unavailable result through their handle. Replacement uses explicit stop, reselection, and restart, with no silent rebinding. A cached handle cannot bypass deactivation, grant revocation, or provider loss.

### API, events, and hooks

| Primitive | Proposed semantics | Required edge cases |
|---|---|---|
| API | Typed request/response through a scoped handle; preserve sync/async shape | Provider throw/reject; closed caller; revoked access; lost provider |
| Event | Notification, no response aggregation; stable subscription order and snapshot per dispatch; await listener settlement for deterministic tests | Listener failure isolated and diagnosed; subscribe/unsubscribe during dispatch; nested emission |
| Hook | Sequential async waterfall; ascending numeric priority, then stable plugin ID and registration order; no handlers returns input | Handler failure aborts pipeline; cancellation; invalid output when validators are supplied |

Treat event payloads as immutable by contract and readonly in types; document that arbitrary objects are not deeply isolated at runtime. Define nested dispatch behavior and cancellation checks between handlers. TypeScript types do not validate data from untyped plugins: validate manifests always and support explicit contract validators where runtime checks are needed.

### Permissions and diagnostics

Keep permission declarations, host grants, and current effective access separate. Check both the right to provide a sensitive capability and the right to consume it. Optional permission requests delegate to a host callback; the kernel contains no prompt UI. A denial must yield a stable code without activating a privileged operation. Revocation affects subsequent calls; in-flight cancellation is best effort and cannot undo an already completed external action.

Diagnostics include code, plugin ID, activation ID, contract ID where applicable, lifecycle state, and cause. Retain bounded history; omit sensitive arguments and payloads by default. Introspection returns snapshots, never mutable registry objects. A failed logger must not recurse through itself or prevent cleanup.

## 5. Ordered implementation backlog

Status vocabulary: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DEFERRED`. All tasks below start at `TODO`. Check a task only after its acceptance checks pass and implementation, relevant documentation, and evidence are committed. Milestones depend on predecessor gates unless explicitly stated otherwise.

### P0 — Architecture and public contract design

Dependencies: repository baseline. Output: accepted architecture decisions and executable design scenarios.

- [x] **K00.1** Record D01–D10, distinguish accepted decisions from unresolved questions, and define the first supported runtime target. Acceptance: no unresolved decision blocks P1/P2.
- [x] **K00.2** Specify manifest fields, SDK surface, host management API, lifecycle transitions, and stable error categories. Acceptance: ownership, failure, version, and permission behavior are unambiguous.
- [x] **K00.3** Draft 5–10 SDK-only examples: hello, provider, consumer, event, hook, optional capability, permission denial, activation failure, and dependency loss. Acceptance: no internal imports or application services required by the base kernel; minimum example targets fewer than 30 authored source lines excluding manifest/test/docs.
- [x] **K00.4** Review scope against the proposal and record deliberate deferrals. Acceptance: each scenario maps to a public SDK method and backlog task; missing SDK operations are specified before plugin implementation.

Gate: SDK design can express all milestone scenarios without workarounds. Proposed names in this document become binding only through this gate.

### P1 — Workspace and focused developer checks

Dependencies: P0 decisions D01/D02/D10.

- [x] **K01.1** Create an isolated foundation feature branch; add npm workspace metadata, strict compiler configuration, selected test runner, lockfile, and appropriate ignore rules. Acceptance: clean install and scoped package build succeed on the documented environment.
- [x] **K01.2** Establish SDK/kernel/manifest package exports and import-boundary checks. Acceptance: a plugin cannot resolve private package paths; kernel build has no platform imports.
- [x] **K01.3** Add repeatable scripts under `tools/scripts/` for environment checks and package-focused validation. Acceptance: failures return nonzero, summaries identify checked scope, and default output stays concise.
- [x] **K01.4** Document setup and contribution workflow, including commands, branch policy, commit cadence, and owner-controlled merges. Acceptance: a fresh checkout can follow the written setup without global package dependencies.

Gate: a small test runs through the supported command and package boundaries are enforceable. Do not create a Cargo workspace until there is a Rust responsibility to implement.

### P2 — SDK definitions and manifest validation

Dependencies: P1 and D03/D04/D09. Start minimal in-memory test infrastructure here and grow it with each runtime feature.

- [x] **K02.1** Implement public plugin/context/disposable/signal types and `definePlugin`. Acceptance: design scenarios typecheck; negative type fixtures reject mismatched provider and consumer shapes.
- [x] **K02.2** Implement API/event/hook token definitions and canonical identity. Acceptance: duplicate package copies agree on identity; incompatible duplicate declarations are rejected.
- [x] **K02.3** Implement schema validation and structured diagnostics for ID, semantic versions, engine/SDK ranges, entry, provides/requires, optional requirements, and permissions. Acceptance: malformed manifests fail before entry evaluation; errors identify the field and plugin.
- [x] **K02.4** Eliminate metadata drift between manifest and plugin definition. Acceptance: mismatched IDs and undeclared registrations fail predictably; serialized manifests and runtime definitions use the same validation rules.
- [x] **K02.5** Publish the draft SDK/manifest reference and compile the design examples against it. Acceptance: examples import only public exports; host-only operations are unavailable in plugin context.

Gate: the runtime can be implemented against a documented public boundary; no plugin needs an internal escape hatch.

### P3 — Registry, scopes, and transactional lifecycle

Dependencies: P2. Use plugins without dependencies until P4.

- [x] **K03.1** Implement kernel instance creation, registration, lookup snapshots, and duplicate-ID rejection. Acceptance: independent kernel instances share no mutable state.
- [x] **K03.2** Implement ownership scopes, child scopes, cancellation, and reverse-order disposal. Acceptance: nested cleanup is idempotent and continues after a disposer throws.
- [x] **K03.3** Implement start, stop, retry, and restart with transactional publication. Acceptance: partial activation failure exposes no committed services and leaves zero owned resources after cooperative cleanup; noncooperative cleanup is timed out and reported without claiming release.
- [x] **K03.4** Handle concurrent transitions, direct reentrancy, deadlines, and late async completions. Acceptance: repeated start/stop has defined results; stale activations cannot register in a fresh scope; indirect async host-closure self-waits are deadline-bounded as specified in D06's P3 refinement.
- [x] **K03.5** Add bounded diagnostics and lifecycle inspection. Acceptance: failures are attributable even without a logger plugin; snapshots cannot mutate internal state.

Gate: targeted lifecycle tests cover success, rollback, teardown failure, cancellation, timeout, and restart with no leaked registrations/listeners/timers owned through the SDK.

### P4 — Capability registry and dependency graph

Dependencies: P3 and D05.

- [x] **K04.1** Register advertised capabilities and match semantic-version ranges. Acceptance: no-match and conflicting metadata errors explain requested and available versions.
- [x] **K04.2** Build required/optional dependency resolution and deterministic activation ordering. Acceptance: chains, diamonds, cycles, missing dependencies, and incompatible ranges behave as specified.
- [x] **K04.3** Implement explicit host provider selection and ambiguity errors. Acceptance: consumer source remains unchanged when the host selects another conforming provider.
- [x] **K04.4** Implement scoped API handles with activation and availability checks. Acceptance: handles retained after stop/restart cannot call an old provider.
- [x] **K04.5** Implement provider loss and reverse-order shutdown. Acceptance: required consumers stop before their provider; optional behavior matches the documented binding policy; replacement requires controlled restart.

Gate: two interchangeable providers satisfy the same unchanged consumer, and dependency loss leaves no usable stale references through the SDK.

### P5 — Event and hook runtimes

Dependencies: P4 for contract identity, ownership, and scoped access.

- [x] **K05.1** Implement typed event subscription/emission with automatic disposal. Acceptance: deterministic dispatch, isolated listener failure, and mutation-during-dispatch tests pass.
- [x] **K05.2** Implement waterfall hooks with stable priorities and async handlers. Acceptance: exact ordering, no-handler identity, failure, and cancellation are tested.
- [x] **K05.3** Connect dispatch to lifecycle scopes and diagnostics. Acceptance: stopped plugins receive no new invocations; in-flight behavior and nested dispatch match the specification.
- [x] **K05.4** Add recipes explaining API versus event versus hook selection. Acceptance: compiled examples demonstrate each primitive without duplicating registry logic in plugin code.

Gate: each primitive has distinct, documented semantics, including cleanup and async behavior.

### P6 — Permission gateway and host policy

Dependencies: P4/P5. Restricted operations must not be released before this gate.

- [x] **K06.1** Implement declaration/grant/effective-access separation and default denial. Acceptance: declaring a permission alone never enables the operation.
- [x] **K06.2** Add host-mediated optional permission requests and grant revocation. Acceptance: denial, grant, later revocation, and host callback failure have deterministic results.
- [x] **K06.3** Apply scoped authorization to API calls, event operations, and hook registration/invocation where contracts require it. Acceptance: cached handles and undeclared providers cannot bypass checks.
- [x] **K06.4** Add minimal and restricted test policies; document trusted-realm limitations and future isolation requirements. Acceptance: every sensitive fixture operation maps to a tested policy check; no claim of arbitrary-code containment.

Gate: permissions are enforced at the public runtime boundary, with explicit limits for ambient globals and in-flight work.

### P7 — Test kit (standalone reference plugins deferred by Owner)

Dependencies: P3–P6; basic harness already developed incrementally since P2.

- [x] **K07.1** Stabilize `createTestKernel`, mock capability installation, lifecycle assertions, diagnostics capture, and controllable scheduling/deadlines. Acceptance: tests use explicit synchronization, not arbitrary sleeps or a product app.
- [ ] **K07.2** **DEFERRED by Owner (2026-11-03)**. Original scope: Implement the P0 examples as executable fixtures, including failing activation and dependency loss. Acceptance: all examples build using SDK exports only and include their own `DOCS/`.
- [ ] **K07.3** **DEFERRED by Owner (2026-11-03)**. Original scope: Implement replaceable logger and command plugins with shared contract definitions. Acceptance: kernel can start without either; substitute implementations pass the same consumer test.
- [x] **K07.4** Add repeated activation/stop leak checks and independent-kernel checks. Acceptance: owned resource counters return to baseline and diagnostics remain bounded.
- [ ] **K07.5** **DEFERRED by Owner (2026-11-03)**. Original scope: Add a provider-to-fake-driver example using an in-memory driver under `plugins/systems/driver/`. Acceptance: consumer calls the provider through the SDK, provider calls the driver contract through the SDK, and neither imports platform internals.

Gate: a plugin author can test lifecycle, capabilities, failure, and permissions without booting Lunaris UI or a native host.

### P8 — Local development host and CLI

Dependencies: P7; CLI reuses manifest validation and the test host.

- [x] **K08.1** Implement local loader with manifest-first checks, package-root entry containment, engine compatibility checks, and readable load errors. Acceptance: invalid/traversing entries fail before execution; valid local modules load through the host.
- [x] **K08.2** Implement `create-plugin` template with manifest, source, test, and plugin docs. Acceptance: generation does not overwrite existing work silently; generated plugin passes validation and its test.
- [x] **K08.3** Implement `dev`, `test`, and `validate`. Acceptance: one-shot commands have correct exit codes; `dev` shuts down scopes on exit; validation shares runtime rules. Use explicit restart initially rather than promising module-cache-safe hot reload.
- [x] **K08.4** Implement `inspect` over read-only host diagnostics. Acceptance: output explains states, selected providers, permissions, and failures without exposing mutable registries or sensitive payloads.
- [x] **K08.5** Write and rehearse the first-plugin quickstart. Acceptance: from installed documented prerequisites to a working generated plugin in at most ten minutes, with measured conditions and result recorded.

Gate: a fresh directory can produce, run, inspect, test, and validate an SDK-only plugin using the documented workflow.

### P9 — 0.1 verification and release documentation

Dependencies: all preceding gates.

- [x] **K09.1** Add focused CI jobs and a supported-environment matrix. Acceptance: touched packages and dependents are checked; release validation runs all core acceptance scenarios on declared targets.
- [x] **K09.2** Review exports, diagnostics, manifest reference, lifecycle/permissions guides, and import boundaries. Acceptance: public examples match executable behavior and no deferred feature is advertised as implemented.
- [x] **K09.3** Record baseline performance for test-host startup, resolution at increasing graph sizes, and repeated lifecycle operations. Acceptance: reproducible commands and environment are included; investigate regressions rather than invent unsupported scale claims. Initial test-host startup target is under five seconds after dependencies are installed.
- [x] **K09.4** Write the 0.1 release checklist, known limitations, compatibility policy, and change log. Acceptance: no open blocker affecting a required scenario; evidence links and commit IDs are recorded.
- [x] **K09.5** Present completed branch changes and validation to the Owner. Acceptance: merge only after explicit Owner approval; do not equate task completion with merge or public publishing authorization.

Gate: 0.1 is a usable local plugin platform with documented trust limits and repeatable validation.

## 6. Beyond the first milestone

| Stage | Prerequisite | Deliverable | Exit evidence |
|---|---|---|---|
| Compatibility hardening | 0.1 usage feedback | Previous-release fixture matrix, deprecation policy, API diff review | All declared supported fixtures pass; intentional breaks documented |
| Local package artifacts | Stable manifest and loader | Pack/integrity checks and reproducible local install | Tampered and invalid packages rejected before activation |
| First real platform host | Selected product requirement | Web or Tauri host, provider, and driver as separate responsibilities | Same consumer works against fake and real driver; native prerequisites validated |
| Untrusted plugin execution | Separate threat model and SDK serialization review | Worker/process isolation and mediated transports | Security tests prove the claimed boundary; API differences documented |
| Registry beta | Packaging, identity, review, and distribution policies | Publishing and compatibility pipeline | Separate approved registry readiness checklist |
| Stable 1.0 | External plugin feedback and public API stability | Stability commitment and migration guidance | All supported compatibility scenarios pass; no unresolved public-contract blocker |

Do not use an arbitrary compatibility percentage to excuse failures in supported scenarios. Do not promise an identical in-process API across a future process boundary before validating serialization, cancellation, and error transport.

## 7. Validation strategy

Tests accompany the feature that introduces behavior; P7 consolidates tooling rather than postponing tests. Prefer small unit tests plus a narrow integration scenario for each boundary. Run touched-package checks and directly affected consumers for routine changes; reserve the complete core matrix for release gates or genuine cross-cutting changes.

| Area | Minimum verification |
|---|---|
| Manifest | Valid/invalid fixtures, missing fields, malformed versions, metadata drift, entry containment in loader |
| SDK | Positive and negative type fixtures; public-export/import-boundary checks |
| Lifecycle | Transition table, rollback, reverse cleanup, repeated stop, timeout, stale async work |
| Resolution | Missing/optional/ambiguous providers, ranges, cycles, deterministic graph ordering |
| API | Provider substitution, error propagation, invalidated handles |
| Events/hooks | Exact order, async errors, cancellation, nested dispatch, disposal during dispatch |
| Permissions | Default denial, grant, revocation, provider authority, cached-handle access |
| Host/CLI | Temp-directory generator and loader scenarios; exit codes; graceful shutdown |
| Integration | Provider + consumer + event + hook + stop + restart through public APIs |
| Portability | No platform imports in kernel/SDK; execution on each explicitly supported target |

No desktop automation is permitted. If later acceptance requires visual or OS interaction, provide the Owner with manual steps and expected results and record the returned outcome. For documentation-only changes, verify links, task identifiers, diff integrity and Git status. Foundation package-boundary/type tests exist from P1; feature runtime tests accompany P2 onward.

## 8. Tracking and execution rules

The checklist is the human-readable backlog. Keep agent scratch notes and machine-only execution data in `.AI_DOCS/`. Use task IDs in commits and review descriptions where useful. Do not create a second manually synchronized copy of task status.

For each task, append a completion/blocker entry using this shape:

```text
Task: Kxx.y
Status: TODO | IN_PROGRESS | BLOCKED | DONE | DEFERRED
Branch / responsible contributor:
Depends on:
Required / existing / new responsibilities:
Changed files and public API impact:
Verification command and outcome:
Evidence commit / review:
Remaining limitations or blocking SDK specification:
```

A task is DONE only when its acceptance criteria pass, documentation describes actual behavior, targeted checks pass, and work is committed. Reference its implementation commit in a subsequent tracking update rather than trying to embed a commit's own hash in itself. A phase is complete only when all its tasks and gate pass.

Before each implementation slice: inspect all uncommitted changes, determine their context, and commit the baseline. Develop new modules/plugins/subsystems on isolated feature branches such as `feat/core-foundation`, `feat/core-sdk`, or `feat/core-lifecycle`. Keep coherent changes small and commit immediately upon completion. For dependent work, use explicitly documented stacked branches when predecessor branches are not merged; do not merge into the target branch without Owner approval.

### SDK blocker procedure

If plugin work requires an absent SDK function, stop the affected implementation immediately. Do not import internals, add raw host access, or implement a plugin-specific workaround. Report the blocker to the Owner with:

1. The blocked task and minimal plugin scenario.
2. The missing public operation and proposed typed signature.
3. Ownership, cleanup, cancellation, permission, and error semantics.
4. Compatibility impact and SDK/runtime files that must change.
5. Focused acceptance tests and dependent tasks to unblock.

Resume plugin work only after the SDK change is implemented and verified as its own slice. Core internals implement the SDK boundary; this does not authorize plugin code to bypass it.

### Principal risks

| Risk | Response |
|---|---|
| Kernel absorbs application services | Enforce boundaries; logger/commands/UI/storage stay replaceable plugins |
| Manifest and TypeScript definitions disagree | One metadata source plus validation at load and registration |
| Async work outlives activation | Fresh activation IDs, closed scopes, stale-handle rejection, deadline tests |
| Replacement breaks consumers silently | Explicit provider selection and restart; contract-based integration tests |
| Permissions mistaken for isolation | Publish logical-sandbox limits; defer hostile code until isolation is validated |
| SDK becomes difficult to learn | Compile examples early and measure first-plugin workflow |
| Native work dominates core delivery | Introduce Rust/platform dependencies only for an actual host/driver requirement |
| Plan expands without completion | Keep 0.1 gates fixed; route optional features to the later-stage table |

## 9. Immediate next slice

The Owner-adjusted local 0.1 scope is complete: 43 DONE tasks and three Owner-DEFERRED reference-plugin tasks (K07.2/K07.3/K07.5). No implementation task remains in this adjusted milestone. Review [the candidate checklist and evidence](releases/0.1.0.md) before an explicitly authorized merge or publication.

Latest stacked branches: `feat/core-test-kit` on `feat/core-permissions` at `f8d7333`; `feat/core-local-tools` on test-kit at `c347d2a`; `feat/core-release-checks` on local-tools at `35e20eb`. Prior P0–P6 branches remain unmerged. The implementation/evidence commits below identify each slice; historical branch names are retained where applicable.

## 10. Execution evidence

Task: K00.1–K00.4
Status: DONE
Branch / responsible contributor: codex/core-foundation / Codex
Depends on: repository baseline 729da7d
Required / existing / new responsibilities: architecture proposal exists; accepted decisions, public boundary and nine SDK-only design scenarios added.
Changed files and public API impact: DOCS/decisions/0001-core-baseline.md; DOCS/reference/core-boundary.md; DOCS/reference/design-scenarios.md. API signatures are specified, not implemented.
Verification command and outcome: git diff --check; manual review of all nine scenario mappings and relative documentation links. No unresolved P1/P2 design blocker; no plugin implementation bypasses SDK.
Evidence commit / review: aca8c65 (P0); tooling choice refined in 72df52f after verifying the registry package API.
Remaining limitations or blocking SDK specification: scenarios are drafts until P2 typechecks; lifecycle and dispatch require P3–P6 evidence. No runtime exists yet.
Task: K01.1
Status: DONE
Branch / responsible contributor: codex/core-foundation / Codex (base main at 729da7d)
Depends on: P0 aca8c65
Required / existing / new responsibilities: no workspace existed; added npm workspaces, exact TypeScript 6.0.3 dependency, lockfile, strict ES2022/ESM configuration and ignore rules. Node built-in test runner selected.
Changed files and public API impact: root package/configuration files and package manifests; root exports only, packages private pending release readiness.
Verification command and outcome: npm ci; node node_modules/typescript/bin/tsc -b --clean; npm run check -- manifest. Clean install and fresh package builds passed on Node 26.13.0/npm 11.20.0 Windows x64.
Evidence commit / review: 72df52f
Remaining limitations or blocking SDK specification: only observed environment verified; no runtime implementation or browser execution claim.

Task: K01.2
Status: DONE
Branch / responsible contributor: codex/core-foundation / Codex
Depends on: K01.1
Required / existing / new responsibilities: manifest/SDK/kernel public package roots, package exports, source dependency direction, no platform ambient types and AST import-boundary checks added.
Changed files and public API impact: packages/* and tools/scripts/boundaries*.mjs; serializable manifest/disposable/lifecycle vocabulary types only. No fake runtime functions exported.
Verification command and outcome: npm run check -- manifest passed; three root-export runtime tests and positive/negative type fixtures passed; eight architecture-checker cases passed. Private src/dist/package.json subpaths fail; platform/kernel/private/escaping/dynamic imports are rejected.
Evidence commit / review: 72df52f
Remaining limitations or blocking SDK specification: architecture checks enforce trusted source conventions, not adversarial isolation; P2 defines plugin/context and token interfaces.

Task: K01.3
Status: DONE
Branch / responsible contributor: codex/core-foundation / Codex
Depends on: K01.1–K01.2
Required / existing / new responsibilities: repeatable environment and package-focused validation scripts under tools/scripts/ added.
Changed files and public API impact: tools/scripts/environment.mjs, check.mjs, boundaries.mjs; no plugin API change.
Verification command and outcome: npm run environment and npm run check -- manifest passed with concise summaries; direct check.mjs with missing/unknown scopes returned exit code 1. TypeScript build/test failures propagate nonzero.
Evidence commit / review: 72df52f
Remaining limitations or blocking SDK specification: scope graph currently contains only the three existing core packages; extend it when adding packages.

Task: K01.4
Status: DONE
Branch / responsible contributor: codex/core-foundation / Codex
Depends on: K01.1–K01.3
Required / existing / new responsibilities: documented fresh-checkout setup, focused commands, branch/commit policy, SDK boundaries and Owner-controlled merges.
Changed files and public API impact: DOCS/guides/contributing.md; documents actual foundation exports separately from planned API.
Verification command and outcome: rehearsed npm ci, npm run environment and npm run check -- manifest; no global compiler dependency. git diff --check passed.
Evidence commit / review: 72df52f
Remaining limitations or blocking SDK specification: P2/P3 remain necessary to build/run a plugin. No merge or publication performed.

Task: K02.1
Status: DONE
Branch / responsible contributor: feat/core-sdk / Codex; stacked on feat/core-foundation at 9f72d1d
Depends on: P1 72df52f
Required / existing / new responsibilities: SDK previously had manifest/disposable types only; added plugin definitions, context, ownership/cancellation interfaces and stable errors.
Changed files and public API impact: packages/sdk/src/{context,plugin,errors,index}.ts; definePlugin validates and freezes metadata without activation. No concrete kernel dependency.
Verification command and outcome: npm run check -- sdk passed; nine SDK-only design scenarios and negative provider/consumer, readonly payload, optional API and host-access fixtures compile as expected.
Evidence commit / review: f38f95b
Remaining limitations or blocking SDK specification: scopes/context are public interfaces; lifecycle behavior is implemented/tested at P3, APIs at P4, dispatch at P5, effective grants at P6.

Task: K02.2
Status: DONE
Branch / responsible contributor: feat/core-sdk / Codex
Depends on: K02.1
Required / existing / new responsibilities: no contract tokens existed; added typed API/event/hook factories, canonical keys and stateless metadata conflict checks.
Changed files and public API impact: packages/sdk/src/tokens.ts; tokens retain exact full versions and permission metadata, validators are optional and excluded from identity.
Verification command and outcome: npm run check -- sdk passed; independently evaluated token module copies share canonical identity; permission conflicts, invalid metadata and kind/version distinctions tested. Type fixtures reject method shape/payload widening and callable API roots.
Evidence commit / review: f38f95b
Remaining limitations or blocking SDK specification: future per-kernel registries must call assertCompatibleTokens; SDK has no global registry. Validator execution belongs to runtime contract operations.

Task: K02.3
Status: DONE
Branch / responsible contributor: feat/core-sdk / Codex
Depends on: P1
Required / existing / new responsibilities: field schema existed as a specification; added runtime validation, immutable snapshots, field diagnostics and explicit host compatibility checks using pinned node-semver.
Changed files and public API impact: packages/manifest/src/{validation,versions,index}.ts, locked semver 7.8.6 and development types, DOCS/reference/manifest.md; reviewed semver as the manifest package's permitted platform-neutral dependency.
Verification command and outcome: npm run check -- manifest passed, including affected SDK/kernel checks. Invalid/missing/unknown fields, unsafe entry paths, duplicate declarations, overlapping permissions, prerelease matching, compatibility, mutation, accessors, trailing whitespace and custom array prototypes covered.
Evidence commit / review: 44b903f; c5531cc
Remaining limitations or blocking SDK specification: loader must supply actual host versions and verify filesystem real-path containment at P8; validation does not execute code or grant permissions. Browser execution remains unverified.

Task: K02.4
Status: DONE
Branch / responsible contributor: feat/core-sdk / Codex
Depends on: K02.1–K02.3
Required / existing / new responsibilities: single manifest identity retained; shared declaration assertions added so runtime implementations reject undeclared registrations/access before publication.
Changed files and public API impact: definePlugin rejects repeated top-level IDs; assertDeclaration checks exact provides, required/optional ranges, operation role and permission declarations through shared validation rules.
Verification command and outcome: npm run check -- sdk passed; tests cover repeated identity, malformed definitions, undeclared contracts, wrong versions/kinds, required/optional mismatch and separate provider/consumer permission declarations.
Evidence commit / review: f38f95b
Remaining limitations or blocking SDK specification: public assertions are executable; registration wiring is P3/P4 work. Declaration checks do not substitute for effective host grants, scope or availability checks.

Task: K02.5
Status: DONE
Branch / responsible contributor: feat/core-sdk / Codex
Depends on: K02.1–K02.4
Required / existing / new responsibilities: P0 drafts now compile; SDK/manifest references and contributing guide describe actual exports and separate future runtime behavior.
Changed files and public API impact: DOCS/reference/{sdk,manifest,core-boundary,design-scenarios}.md; packages/sdk/test/scenarios.ts imports public SDK exports only. Hello needs no application services and stays below 30 source lines.
Verification command and outcome: npm run check -- sdk and npm run check -- manifest passed; positive scenarios compile and negative fixtures reject host grants/registry/logger access; git diff --check passed.
Evidence commit / review: f38f95b; 44b903f
Remaining limitations or blocking SDK specification: compiled scenarios do not execute lifecycle; P7 will create executable, separately documented plugins after P3–P6 runtime gates. No merge or publishing performed.

Task: K03.1
Status: DONE
Branch / responsible contributor: feat/core-lifecycle / Codex; stacked on feat/core-sdk at 17e0fed
Depends on: P2
Required / existing / new responsibilities: SDK/manifest boundary existed; added independent kernel instances, validated atomic registration, engine/SDK compatibility, duplicate rejection and frozen inspection.
Changed files and public API impact: packages/kernel/src/{kernel,types,index}.ts. Host createKernel requires an injected Scheduler; no platform imports or plugin SDK changes.
Verification command and outcome: npm run check -- kernel passed; public-export tests cover deferred activation, duplicate/compatibility failure, immutable snapshots and independent active kernels with the same plugin/contract identities.
Evidence commit / review: 64a5906; host scheduler decision 54c3bab
Remaining limitations or blocking SDK specification: only dependency-free activation at P3; graph resolution and host selection are P4. Current runtime compatibility versions are 0.1.0.

Task: K03.2
Status: DONE
Branch / responsible contributor: feat/core-lifecycle / Codex
Depends on: K03.1 and P2 scope/cancellation interfaces
Required / existing / new responsibilities: added frozen SDK scope/signal facades, child ownership, abort listener cleanup, reverse awaited disposal, idempotency and aggregated cleanup failure.
Changed files and public API impact: packages/kernel/src/{scope,signal}.ts; private controllers are not package exports. Repeated ownership of an object within an activation disposes it once.
Verification command and outcome: npm run check -- kernel passed; exact nested abort/teardown/disposal order, child/parent recursive disposal, duplicate ownership, independent child release, listener mutation/errors, opaque thrown values and cleanup continuation covered.
Evidence commit / review: 64a5906
Remaining limitations or blocking SDK specification: arbitrary external effects are not reversible; indirect async parent/self-waits cannot be attributed without platform async context and are bounded by host deadlines when stopping.

Task: K03.3
Status: DONE
Branch / responsible contributor: feat/core-lifecycle / Codex
Depends on: K03.1–K03.2
Required / existing / new responsibilities: start/stop/retry/restart queues, fresh activation identities and private API staging with commit-time canonical metadata checks added.
Changed files and public API impact: kernel runtime uses SDK declaration assertions and validates method-only API implementation objects/validators. Old idempotent registration disposables cannot delete replacements.
Verification command and outcome: npm run check -- kernel passed; commit visibility, rollback, cleanup failures, retry/restart, concurrent staging conflicts and stale registration disposal tested. Cooperative cleanup returns ownership slots to zero; failed activation exposes no contracts.
Evidence commit / review: 64a5906
Remaining limitations or blocking SDK specification: actual API consumption/handles are P4; event/hook dispatch is P5. Noncooperative disposal is reported as pending rather than falsely counted as released.

Task: K03.4
Status: DONE
Branch / responsible contributor: feat/core-lifecycle / Codex
Depends on: K03.3 and refined D06
Required / existing / new responsibilities: management serialization, direct callback reentry rejection, manually schedulable deadlines, deadline drain and late-result/error observation added.
Changed files and public API impact: required host Scheduler injection documented in DOCS/decisions/0002-lifecycle-execution.md; activation/stop duration defaults remain 5000 ms. No timer globals or native async-context dependency in kernel.
Verification command and outcome: npm run check -- kernel passed; repeated start/stop, queued stop during start, direct reentry, indirect asynchronous lifecycle self-wait, activation/stop timeouts, hanging child cleanup, late returned resources/errors and stale SDK rejection covered with deferred promises and no sleeps.
Evidence commit / review: 64a5906; design refinement 54c3bab
Remaining limitations or blocking SDK specification: timers cannot interrupt synchronous JavaScript. Arbitrary async host-closure cycles are deadline-bounded, not universally detected. A host must provide a functioning scheduler; real host adapter comes later.

Task: K03.5
Status: DONE
Branch / responsible contributor: feat/core-lifecycle / Codex
Depends on: K03.1–K03.4
Required / existing / new responsibilities: bounded internal diagnostic history, safe immutable snapshots, activation attribution and ownership counters added without a logger dependency.
Changed files and public API impact: packages/kernel/src/diagnostics.ts and snapshot types; DOCS/concepts/lifecycle.md, SDK/boundary/contribution docs updated to actual P3 behavior.
Verification command and outcome: npm run check -- kernel passed, including strict type fixtures and import boundaries; tests cover history capacity/order, original activation attribution, frozen snapshots, cleanup after arbitrary thrown objects and omission of private error/payload contents. git diff --check passed.
Evidence commit / review: 64a5906
Remaining limitations or blocking SDK specification: snapshot covers current activation and committed API metadata only; provider bindings/grants appear at P4/P6. Raw causes stay internal or on returned errors. No merge/publication performed.
Task: K04.1
Status: DONE
Branch / responsible contributor: feat/core-capabilities (base feat/core-lifecycle at 3f22d59) / Codex
Depends on: P3 and shared SDK/manifest contracts
Required / existing / new responsibilities: Existing SDK/lifecycle reused; API matching uses the shared SemVer implementation, advertised versions and immutable token metadata. No-match errors include requested/available versions; all advertised APIs must publish before commit.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host provider selection and immutable binding inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); capabilities.test.mjs covers matching, compatible minors, missing/incompatible providers and metadata conflicts.
Evidence commit / review: e5fa956; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K04.2
Status: DONE
Branch / responsible contributor: feat/core-capabilities (base feat/core-lifecycle at 3f22d59) / Codex
Depends on: P3 and shared SDK/manifest contracts
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added isolated metadata resolver with required/optional bindings, stable ready-node ordering, cycle paths and deterministic optional cycle-edge omission.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host provider selection and immutable binding inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); capabilities.test.mjs covers branching/diamond graphs, required/optional cycles, missing and failed optional dependencies, and concurrent shared startup.
Evidence commit / review: e5fa956; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K04.3
Status: DONE
Branch / responsible contributor: feat/core-capabilities (base feat/core-lifecycle at 3f22d59) / Codex
Depends on: P3 and shared SDK/manifest contracts
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Host selectProvider validates declared requirements/candidates and requires an inactive consumer. Consumer source remains unchanged across selected implementations.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host provider selection and immutable binding inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); capabilities.test.mjs substitutes two conforming providers and rejects ambiguity, incompatible selection and selection while active.
Evidence commit / review: e5fa956
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K04.4
Status: DONE
Branch / responsible contributor: feat/core-capabilities (base feat/core-lifecycle at 3f22d59) / Codex
Depends on: P3 and shared SDK/manifest contracts
Required / existing / new responsibilities: Existing SDK/lifecycle reused; API handles snapshot methods/token metadata, preserve receivers and sync/async shape, and recheck scope, bound activation, registration and authority on every call.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host provider selection and immutable binding inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); capabilities.test.mjs and permissions.test.mjs cover detached methods, preserved errors, cached calls, caller/provider loss and token mutation.
Evidence commit / review: e5fa956; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K04.5
Status: DONE
Branch / responsible contributor: feat/core-capabilities (base feat/core-lifecycle at 3f22d59) / Codex
Depends on: P3 and shared SDK/manifest contracts
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Explicit stop shuts down transitive required consumers first; optional bindings remain fixed and unavailable after provider loss. Individual API disposal and manual scope closure invalidate handles and schedule dependent shutdown.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host provider selection and immutable binding inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); capabilities.test.mjs and integration.test.mjs cover reverse dependency shutdown, optional provider loss, stale methods and controlled restart.
Evidence commit / review: e5fa956; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K05.1
Status: DONE
Branch / responsible contributor: feat/core-dispatch (base feat/core-capabilities at e5fa956) / Codex
Depends on: P4 scope-aware contracts/resolution
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added owned event listeners with committed-consumer visibility, registration-order snapshots, awaited sequential settlement, isolated failures and immediate disposal.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. No plugin SDK escape hatches; public event/hook operations implemented.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); dispatch.test.mjs covers mutation during dispatch, nested emission, listener errors, input validation and staged rollback.
Evidence commit / review: 858653c; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K05.2
Status: DONE
Branch / responsible contributor: feat/core-dispatch (base feat/core-capabilities at e5fa956) / Codex
Depends on: P4 scope-aware contracts/resolution
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added async waterfall hooks ordered by finite priority, plugin ID and registration order; owner/handler validators check input/output.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. No plugin SDK escape hatches; public event/hook operations implemented.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); dispatch.test.mjs covers identity without handlers, exact ordering, invalid priorities/output, thrown values and independent nested pipelines.
Evidence commit / review: 858653c; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K05.3
Status: DONE
Branch / responsible contributor: feat/core-dispatch (base feat/core-capabilities at e5fa956) / Codex
Depends on: P4 scope-aware contracts/resolution
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Dispatch checks owner/consumer scope, provider identity and authorization between handlers and after validation. Closed consumers cannot receive new callbacks/validators; existing work may settle.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. No plugin SDK escape hatches; public event/hook operations implemented.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); dispatch.test.mjs covers stop during event/hook dispatch, stopped handler validators, subscription rollback and ownership-slot release.
Evidence commit / review: 858653c; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K05.4
Status: DONE
Branch / responsible contributor: feat/core-dispatch (base feat/core-capabilities at e5fa956) / Codex
Depends on: P4 scope-aware contracts/resolution
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Documented API/event/hook selection, ownership, ordering, nested dispatch and cancellation. Existing SDK-only compiled scenarios demonstrate ordinary API-triggered dispatch.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. No plugin SDK escape hatches; public event/hook operations implemented.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); DOCS/concepts/dispatch.md reviewed against dispatch tests; SDK scenarios compiled against public exports during the SDK check.
Evidence commit / review: 858653c; f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K06.1
Status: DONE
Branch / responsible contributor: feat/core-permissions (base feat/core-dispatch at 858653c) / Codex
Depends on: P4/P5 mediated operations
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added host-owned policy with separate initial/effective grants and manifest declarations. Default/minimal hosts grant nothing; providers and consumers require declared effective authority.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host initialGrants/requestPermission/grant/revoke and effectivePermissions inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); permissions.test.mjs covers minimal/restricted profiles, no manifest self-grants, undeclared grants and denial before privileged callbacks.
Evidence commit / review: f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K06.2
Status: DONE
Branch / responsible contributor: feat/core-permissions (base feat/core-dispatch at 858653c) / Codex
Depends on: P4/P5 mediated operations
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added immutable host requests, coalescing, explicit grant/revoke, revocation generations and cancellation of requests belonging to closed activations.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host initialGrants/requestPermission/grant/revoke and effectivePermissions inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); permissions.test.mjs covers denial, approval, host callback failure, pending revocation, stale approval and activation timeout.
Evidence commit / review: f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K06.3
Status: DONE
Branch / responsible contributor: feat/core-permissions (base feat/core-dispatch at 858653c) / Codex
Depends on: P4/P5 mediated operations
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Applied authority checks to API provision/acquisition/calls, event subscription/emission/delivery and hook registration/invocation. Captured methods and token copies retain checks after revocation.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host initialGrants/requestPermission/grant/revoke and effectivePermissions inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); permissions.test.mjs covers cached calls, separate provider/consumer revocation, dispatch revocation, validator-side revocation and mutable untyped tokens.
Evidence commit / review: f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.

Task: K06.4
Status: DONE
Branch / responsible contributor: feat/core-permissions (base feat/core-dispatch at 858653c) / Codex
Depends on: P4/P5 mediated operations
Required / existing / new responsibilities: Existing SDK/lifecycle reused; Added named minimal/restricted test policies and documented logical-sandbox limits, grant lifecycle, mediated operations and in-flight limitations.
Changed files and public API impact: packages/kernel/src and test; DOCS/concepts/{contracts,dispatch,permissions}.md and SDK/host references. Host initialGrants/requestPermission/grant/revoke and effectivePermissions inspection added.
Verification command and outcome: npm run check -- kernel passed (58 kernel tests in final batch plus type/import checks); permissions.test.mjs and integration.test.mjs cover declared sensitive operations, in-flight completion and end-to-end stop/restart with zero cooperative owned resources.
Evidence commit / review: f2af654
Remaining limitations or blocking SDK specification: Trusted local JavaScript realm; no forced termination/deep value isolation. P7 reference packages and P8 local CLI remain outstanding. No merge/publication performed.


## Owner scope adjustment — 2026-11-03

The Owner requested completion of the remaining core work without test/reference plugins. K07.2 (executable example packages), K07.3 (logger/command reference plugins) and K07.5 (provider/fake-driver example packages) are DEFERRED, not completed. Retain ordinary automated tests, the reusable test kit, lifecycle leak checks and the CLI-generated plugin template. No standalone reference plugin or application capability package is required for the adjusted 0.1 gate. P7 and P9 gates are assessed against this adjusted scope. Merging/publishing still requires separate Owner authorization.

Task: K07.1
Status: DONE
Branch / responsible contributor: feat/core-test-kit (base feat/core-permissions at f8d7333) / Codex
Depends on: P3–P6 public runtime
Required / existing / new responsibilities: Public test kit composes the actual kernel, adds a deterministic scheduler, typed mock installation, lifecycle/resource assertions and bounded diagnostic capture.
Changed files and public API impact: packages/test; SDK JSON input boundary; DOCS/guides/testing.md.
Verification command and outcome: npm run check -- test; mock typing, scope release and explicitly synchronized timeout scenarios passed.
Evidence commit / review: c347d2a; SDK JSON author-input refinement b3e9377
Remaining limitations or blocking SDK specification: No implicit sensitive grants; advancing the fake clock does not flush arbitrary promises.

Task: K07.4
Status: DONE
Branch / responsible contributor: feat/core-test-kit / Codex
Depends on: P3–P6 public runtime
Required / existing / new responsibilities: Repeated 50-cycle activation/stop checks, independent kernels, external resource counters and bounded diagnostic history tested through public exports.
Changed files and public API impact: packages/test; SDK JSON input boundary; DOCS/guides/testing.md.
Verification command and outcome: npm run check -- test; ownership/deadline counters returned to zero and history stayed within configured capacity.
Evidence commit / review: c347d2a
Remaining limitations or blocking SDK specification: Assertions cannot prove an arbitrary noncooperative external resource released.

Task: K08.1
Status: DONE
Branch / responsible contributor: feat/core-local-tools (base feat/core-test-kit at c347d2a) / Codex
Depends on: Adjusted P7 test kit and existing manifest/kernel contracts
Required / existing / new responsibilities: Added Node-only development host with all-roots manifest-first validation, compatibility/real-path containment, normalized entry/manifest drift checks and cleanup.
Changed files and public API impact: hosts/development, packages/cli, tools/scripts/rehearse.mjs and quickstart/host/CLI docs.
Verification command and outcome: npm run check -- development; invalid/traversing metadata failed before evaluation; Windows directory-junction escape, drift and valid load/start/stop passed without skips.
Evidence commit / review: bf5a48f; junction acceptance hardening adf34db
Remaining limitations or blocking SDK specification: Trusted local code; normal Node module caching, initialization and filesystem race limitations are documented.

Task: K08.2
Status: DONE
Branch / responsible contributor: feat/core-local-tools / Codex
Depends on: Adjusted P7 test kit and existing manifest/kernel contracts
Required / existing / new responsibilities: Generator creates a new TypeScript package with authoritative JSON manifest, SDK-only source, lifecycle test, strict configuration, local CLI launcher and individual plugin docs.
Changed files and public API impact: hosts/development, packages/cli, tools/scripts/rehearse.mjs and quickstart/host/CLI docs.
Verification command and outcome: npm run check -- cli; temporary package with spaces in its path installed offline, built, passed its real npm test and refused existing targets.
Evidence commit / review: 35e20eb; complete generated-script rehearsal adf34db
Remaining limitations or blocking SDK specification: Local dependency/compiler links require the source checkout to remain available; public distribution is deferred.

Task: K08.3
Status: DONE
Branch / responsible contributor: feat/core-local-tools / Codex
Depends on: Adjusted P7 test kit and existing manifest/kernel contracts
Required / existing / new responsibilities: Implemented dev/test/validate with shared validation, real host scopes, nonzero failure status, explicit process restart and cleanup on stop/EOF/signals.
Changed files and public API impact: hosts/development, packages/cli, tools/scripts/rehearse.mjs and quickstart/host/CLI docs.
Verification command and outcome: npm run check -- cli; actual child test failures returned 1, malformed metadata did not evaluate entry, one-shot/live stdin-stop dev released resources. Nested Node test context is cleared.
Evidence commit / review: 35e20eb; generated npm command acceptance adf34db
Remaining limitations or blocking SDK specification: Live dev acceptance used stdin stop; terminal Ctrl+C/SIGTERM handlers are wired but were not exercised through desktop automation.

Task: K08.4
Status: DONE
Branch / responsible contributor: feat/core-local-tools / Codex
Depends on: Adjusted P7 test kit and existing manifest/kernel contracts
Required / existing / new responsibilities: Inspect loads a short-lived host, prints immutable state/binding/effective-grant/safe-diagnostic snapshots and stops in finally.
Changed files and public API impact: hosts/development, packages/cli, tools/scripts/rehearse.mjs and quickstart/host/CLI docs.
Verification command and outcome: npm run check -- cli; active inspection and default empty grants verified; underlying safe snapshot tests remain in the kernel suite.
Evidence commit / review: 35e20eb
Remaining limitations or blocking SDK specification: Inspection executes trusted module code; validate performs only metadata/path checks.

Task: K08.5
Status: DONE
Branch / responsible contributor: feat/core-local-tools / Codex
Depends on: Adjusted P7 test kit and existing manifest/kernel contracts
Required / existing / new responsibilities: Documented and automated the first-plugin journey with reusable tools/scripts/rehearse.mjs.
Changed files and public API impact: hosts/development, packages/cli, tools/scripts/rehearse.mjs and quickstart/host/CLI docs.
Verification command and outcome: npm run rehearse; final cached/offline generated npm workflow passed in 1963 ms. Clean root npm ci, build and all release checks together took 12638 ms on the documented Windows environment.
Evidence commit / review: 35e20eb; full rehearsal and evidence adf34db
Remaining limitations or blocking SDK specification: Timings use available Node/npm and cached root dependencies, not an internet-download guarantee.

Task: K09.1
Status: DONE
Branch / responsible contributor: feat/core-release-checks (base feat/core-local-tools at 35e20eb) / Codex
Depends on: Adjusted P0–P8 implementation
Required / existing / new responsibilities: Added pinned official GitHub Actions, Windows/Node support matrix, touched-package selection with consumer checks and full release validation for main/manual runs.
Changed files and public API impact: tools/scripts CI/audit/benchmark/release checks, .github/workflows/core.yml and release/support docs.
Verification command and outcome: npm run ci with CI_BASE_SHA=35e20eb full SHA passed; selection tests cover changed package/host/tooling/docs paths. Full release check passed on declared local Windows target.
Evidence commit / review: adf34db
Remaining limitations or blocking SDK specification: Remote hosted CI has not been triggered; no push/merge was performed. Other targets are explicitly unverified.

Task: K09.2
Status: DONE
Branch / responsible contributor: feat/core-release-checks / Codex
Depends on: Adjusted P0–P8 implementation
Required / existing / new responsibilities: Audited six package root exports, private import rejection, dependency boundaries, public declarations, error categories, docs links and implemented/deferred behavior.
Changed files and public API impact: tools/scripts CI/audit/benchmark/release checks, .github/workflows/core.yml and release/support docs.
Verification command and outcome: npm run audit passed for 22 documentation files and public package roots; strict positive/negative fixtures and architecture checks passed.
Evidence commit / review: adf34db
Remaining limitations or blocking SDK specification: Audit validates local link targets, not external website availability; no hostile-code isolation claim.

Task: K09.3
Status: DONE
Branch / responsible contributor: feat/core-release-checks / Codex
Depends on: Adjusted P0–P8 implementation
Required / existing / new responsibilities: Added reproducible benchmarks for import/test-host startup, 10/50/100-node chains and 100 repeated lifecycle cycles.
Changed files and public API impact: tools/scripts CI/audit/benchmark/release checks, .github/workflows/core.yml and release/support docs.
Verification command and outcome: npm run benchmark; clean-run startup 34.72 ms (<5000 ms); chain start 3.34/5.12/9.13 ms; 100 cycles 1.66 ms; cooperative resources returned to baseline.
Evidence commit / review: adf34db
Remaining limitations or blocking SDK specification: Single local baseline, not a scale or cross-platform performance guarantee.

Task: K09.4
Status: DONE
Branch / responsible contributor: feat/core-release-checks / Codex
Depends on: Adjusted P0–P8 implementation
Required / existing / new responsibilities: Added candidate checklist, compatibility/support policy, limitations, change log, root entry documentation and release reproduction/evidence.
Changed files and public API impact: tools/scripts CI/audit/benchmark/release checks, .github/workflows/core.yml and release/support docs.
Verification command and outcome: Clean npm ci + fresh tsc build + npm run release:check passed: 129 tests, 0 skipped, type/import checks, audit, benchmark and generated-plugin rehearsal.
Evidence commit / review: adf34db
Remaining limitations or blocking SDK specification: Private source-checkout candidate; reference-plugin tasks Owner-deferred, public distribution and native/UI targets outside scope.

Task: K09.5
Status: DONE
Branch / responsible contributor: feat/core-release-checks / Codex
Depends on: Adjusted P0–P8 implementation
Required / existing / new responsibilities: Prepared completed stacked branches, documented evidence and final Owner handoff for the adjusted scope.
Changed files and public API impact: tools/scripts CI/audit/benchmark/release checks, .github/workflows/core.yml and release/support docs.
Verification command and outcome: Implementation and clean-install release checks are committed; final response presents completed work, deferred scope and validation.
Evidence commit / review: adf34db; subsequent plan/evidence commit
Remaining limitations or blocking SDK specification: Owner merge/publishing approval is separate and was not inferred from implementation authorization.

Task: K07.2
Status: DEFERRED
Branch / responsible contributor: feat/core-test-kit / Owner scope instruction
Depends on: Owner request dated 2026-11-03
Required / existing / new responsibilities: standalone executable example packages excluded from this milestone; existing automated runtime tests remain.
Changed files and public API impact: plan scope only; no reference-plugin package created.
Verification command and outcome: adjusted release check passed without these packages.
Evidence commit / review: b328e59
Remaining limitations or blocking SDK specification: revisit only after a new product/Owner requirement.

Task: K07.3
Status: DEFERRED
Branch / responsible contributor: feat/core-test-kit / Owner scope instruction
Depends on: Owner request dated 2026-11-03
Required / existing / new responsibilities: logger and command reference plugins/shared application contracts excluded from this milestone; existing automated runtime tests remain.
Changed files and public API impact: plan scope only; no reference-plugin package created.
Verification command and outcome: adjusted release check passed without these packages.
Evidence commit / review: b328e59
Remaining limitations or blocking SDK specification: revisit only after a new product/Owner requirement.

Task: K07.5
Status: DEFERRED
Branch / responsible contributor: feat/core-test-kit / Owner scope instruction
Depends on: Owner request dated 2026-11-03
Required / existing / new responsibilities: standalone provider/fake-driver example packages excluded from this milestone; existing automated runtime tests remain.
Changed files and public API impact: plan scope only; no reference-plugin package created.
Verification command and outcome: adjusted release check passed without these packages.
Evidence commit / review: b328e59
Remaining limitations or blocking SDK specification: revisit only after a new product/Owner requirement.

## First application host milestone — 2026-11-03

The Owner selected Tauri as the first target and authorized an independent minimal
monochrome recovery interface. See [decision 0003](decisions/0003-tauri-recovery-shell.md)
and the [host guide](guides/tauri-host.md). The original core milestone and deferred
reference-plugin tasks retain their scope.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| K10.1 Tauri composition | DONE | Native Rust window, WebView frontend, actual public TypeScript kernel and browser scheduler; locked Windows debug build succeeds. |
| K10.2 Independent system UI | DONE | Host-owned monochrome view, versions, plugin/resource states, safe diagnostics and independent English/Russian catalogs. |
| K10.3 Recovery lifecycle | DONE | Startup/runtime/render faults return to the shell; retry rebuilds the kernel; excluded definitions cannot auto-start through dependencies; failed cleanup blocks in-process recovery. |
| K10.4 Automated verification | DONE | 23 host tests; 337 full-release tests with zero skips; frontend/native checks, debug executable and dedicated Windows CI configuration. |
| K10.5 Manual desktop acceptance | TODO | Owner runs the host-guide visual/native-window checklist. Desktop automation is prohibited; no visual or native event execution claim is made. |

Branch / responsible contributor: `feat/tauri-fallback-shell` / Codex.
Implementation evidence: `6217ca8`.
Verification commands: `npm run tauri:check`, `npm run tauri:build`,
`npm run release:check` — passed locally on the documented Windows environment.
No kernel or SDK public API change was required. No product/reference plugins,
native capability drivers, merge, push, installer or publication were added.

## First product plugins: Logger and DevTools sink — 2026-11-05

The Owner authorized implementation of the previously discussed logging service,
separate replaceable DevTools output and startup artwork. This is product work;
the original deferred reference-plugin milestone retains its historical scope.

Required / existing / new responsibilities: reuse SDK contracts, dependency
resolution and lifecycle; add the shared `@lunaris/logging` contract package,
`plugins/systems/logger` service and `plugins/systems/driver/dev-tools-logger`
console adapter. The host supplies artwork and selects the sole installed sink
through normal dependency resolution. Neither plugin imports kernel/host internals.

Implemented: structured records, level filtering, native console severity,
single-line readable headers, preserved error/data objects, failure containment,
recursion guards, activation readiness record and once-per-page-load banner.
Tauri composes both plugins and retains its independent system view. No SDK,
kernel or Rust changes are required. See the [logging reference](reference/logging.md).

Branch: `feat/logger-devtools`. Automated verification: `npm run logger:check`
(logging contracts, both plugins and affected host tests, types and boundaries),
`npm run build --workspace @lunaris/tauri`, CI scope-selection tests and export/docs
audit. Actual DevTools visuals remain manual acceptance per repository policy.
An in-app viewer, persistence, multiple sinks, runtime switching and automatic
forwarding of core diagnostics are outside this implementation. No merge or push.

## Filesystem provider and first native driver — 2026-11-05

Owner scope: implement file-service infrastructure after discussing functions;
record Vault Manager separately in the [product backlog](Backlog.md). Do not add
active-Vault management or a product file UI to this milestone.

Required: Vault-relative text/binary operations, explicit write modes, conflict
detection, directories/transfers/deletion, native selection and watching. Existing:
SDK contracts, dependency resolution, scoped events/resources, permissions and
mandatory Logger. New: `@lunaris/filesystem` contracts, filesystem provider,
Tauri driver with a component-local Rust backend and the host IPC/permission
composition. The SDK and kernel public interfaces are unchanged.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| K11.1 Contracts/provider | DONE | Explicit Vault ID and portable relative paths, typed results, mandatory logging, SDK-only driver API/event forwarding. |
| K11.2 Native driver | DONE | User-selected directory capabilities, UTF-8/binary reads, bounded transfers, flushed temporary writes, version fingerprints, native dialogs and watchers. |
| K11.3 Lifecycle/composition | DONE | Native session UUIDs, scope-owned cleanup, stale-root rejection, host composition grants and command permission for the main local window. |
| K11.4 Targeted verification | DONE | 50 TypeScript/provider/driver/host/boundary tests, 7 real native filesystem tests, types, CI selection, formatting, locked native compilation and frontend bundle. |
| K11.5 Native dialog acceptance | TODO | Owner tests dialog selection/cancellation through a future consumer action. No desktop automation or dialog visual acceptance claim. |

Branch: `feat/filesystem-provider`, based on unmerged `feat/logger-devtools` at
`5528b68`. Backlog evidence: `b91c90c`. Verification: `npm run filesystem:check`
and export/documentation audit. See [the filesystem reference](reference/filesystem.md)
for APIs and limits: optimistic external conflict checking, nontransactional
directory copies, Windows-first native no-replacement rename, 64 MiB transfers,
manual dismissal of already open native dialogs, and unsupported link transfers,
directory replacement/trash/streaming. No Vault Manager, merge or push.

## Application storage and Vault Manager — 2026-11-05

Owner scope: defer config-manager implementation and first resolve its filesystem
and Vault-lifecycle prerequisites. Existing SDK APIs, cancellation signals,
permissions, events and hooks are sufficient; the SDK/kernel runtime is unchanged.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| K12.1 Application directory | DONE | Host-resolved config root, separate SDK permission, lazy directory creation, persistent files and capability-confined portable filesystem I/O. |
| K12.2 Owned roots and closure | DONE | Owner cancellation, native cleanup without SDK handles, accepted-I/O draining, stale-ID rejection, late-selection retirement and independent cleanup diagnostics. |
| K12.3 Vault Manager | DONE | One active Vault, selection/open/switch/close, awaited preparation hook, immutable context, lifecycle events, cancellation/failure preservation and BUSY protection. |
| K12.4 Composition and verification | DONE | Tauri entrypoint/grants, plugin-local docs, 74 targeted TypeScript/host/boundary tests, type fixtures, CI selection, public-export/docs audit and frontend bundle. Native storage prerequisite passed 9 tests and locked host compilation. |

Branch: `feat/application-storage-vault-manager`. Verification: `npm run vault:check`,
`npm run filesystem:check` for native prerequisites, frontend build and docs/export
audit. See [application storage](reference/application-storage.md) and
[Vault Manager](reference/vault.md) for APIs, lifecycle guarantees and limits.
Native dialog visuals remain manual. Config parsing/storage policy, `.lunaris`
initialization, product UI, history and restoration remain deferred. No merge/push.

## Config manager — 2026-11-05

Owner scope: implement the deferred config manager using the completed storage
and Vault prerequisites. Existing SDK APIs, permissions, hooks and lifecycle
ownership suffice; no SDK/kernel/native changes are required.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| K13.1 Contracts and namespaces | DONE | SDK read/get/set/remove API, explicit write layers, arbitrary plugin namespaces, config.access and value-free mutation events. |
| K13.2 TOML and precedence | DONE | Global application config plus .lunaris/config.toml, recursive table merging with local precedence, literal keys, detached values and strict TOML-compatible input snapshots. |
| K13.3 Persistence and lifecycle | DONE | Preparation hook before Vault readiness, existing-file validation, serialized per-file mutations, optimistic version checks, captured Vault IDs, restart/stop handling and no config payloads in logs. |
| K13.4 Composition and verification | DONE | Tauri entrypoint/grants, plugin docs, 67 targeted contract/manager/host/boundary tests, type fixtures, CI selection, exports/docs audit and frontend bundle. |

Branch: `feat/config-manager`. Verification: `npm run config:check`,
`npm run build --workspace @lunaris/tauri`, CI scope tests and documentation/export
audit. See [config manager](reference/config.md). The TOML codec dependency is
pinned and confined to its codec module. Source comments/formatting are not retained
by mutations. External edits are reread on demand; no watch/cache service or UI is
added. No merge or push.

## Localization service — 2026-11-05

Owner scope: implement language support before product UI; ship English first and
let plugins own their user-facing catalogs. Keep logs and diagnostic errors in
English. Existing SDK APIs/events and cancellation signals suffice.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| K14.1 Contracts and catalogs | DONE | Replaceable SDK language API, per-plugin English catalogs, copied dictionaries, explicit locale selection and locale-change events. |
| K14.2 Lookup and lifecycle | DONE | English fallback, plain-text parameters, visible missing keys, deduplicated warnings, owner cancellation and restart without SDK calls during cleanup. |
| K14.3 Existing text audit | DONE | Existing system plugins contain only technical logs/errors. Host recovery copy extracted to an independent English catalog; no unnecessary localization dependencies or cycles. |
| K14.4 Composition and verification | DONE | Tauri startup, consumer/recovery integration, plugin docs, 53 targeted tests, types, boundaries, CI scope selection and frontend bundle. |

Branch: `feat/localization`, based on `fix/english-system-screen` at
`44a1c08280ffefba93d297df68a13212e86d8990`. Verification:
`npm run localization:check`, `npm run build --workspace @lunaris/tauri`,
`node --test --test-reporter=dot tools/scripts/ci.test.mjs`, export/docs audit and
`git diff --check`. See [localization](reference/localization.md) for the API and
limits. Only English is shipped; locale persistence, language packs, ICU and
product UI remain deferred. No SDK/kernel/native changes, merge or push.

Implementation commit: `7cbd1c1` (`feat(localization): add English-first plugin
language service (K14)`).

## Workspace — 2026-11-06

Owner scope: continue from the completed startup/Vault base with a working surface
and a placeholder when no content plugins are available. Existing SDK contracts,
events and child scopes suffice; no kernel/runtime changes are required.

| Task | Status | Delivered behavior / acceptance |
|---|---|---|
| Content contracts/provider | DONE | Public Workspace register/update/list API, change event, validated shallow immutable descriptors, owner-scoped removal and independent portable registry. |
| Workspace screen | DONE | Loaded/Vault gating, committed selector handoff, fresh views on Vault switches, single-flight close/retry and return to selector. |
| Mantine roles/placeholder | DONE | Theme/localization-aware header and empty state; successful mounts replace the placeholder; missing, removed or failed content restores it. |
| Integration/verification | DONE | Tauri composition/grants, 90 targeted contract/provider/UI/host/boundary tests, type fixtures and production frontend build. |

Branch: `feat/workspace`. Run `npm run workspace:check` and
`npm run build --workspace @lunaris/tauri`. See [Workspace](reference/workspace.md)
for the API, integration assessment, limits and manual acceptance. Native WebView
visual acceptance remains manual. Explorer, document state, editor, tabs, sidebars,
resizing and session restoration are deferred. No merge or push.
