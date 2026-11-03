# Core code review

Date: 2026-11-03. Status: review complete; findings open; no runtime fixes applied.
Reviewed baseline: `5d13d3212ae29e69c752d508859bf6b48ed3c0b1`.
Review branch: `review/core-audit`. Initial working tree was clean.

## Scope and method

Read all source modules in `packages/kernel/src`, `packages/sdk/src`, and
`packages/manifest/src`, their public contracts, lifecycle decisions, implementation
plan, release notes, and relevant tests. Review covers lifecycle, dependency
resolution, ownership, API mediation, dispatch, permissions, diagnostics, manifest
validation, and SDK boundaries. Host/CLI/test-kit implementations and remote CI
were not comprehensively audited; their previous release checks are not new
evidence from this review.

Existing responsibilities are already separated into runtime services. This task
requires an audit document and reproducible public-boundary probes, not new plugin
services or changes to the production SDK. The probes use public SDK/kernel
exports; no internal runtime imports, desktop automation, network research,
dependency updates, merge, or publication were needed.

Completed workflow:

- Inspect repository state and the accepted baseline.
- Read implementation and compare it with documented behavior.
- Build the reviewed packages and run their existing runtime/type checks.
- Reproduce lifecycle and API-boundary defects with synchronized promises.
- Measure two performance risks separately from correctness defects.
- Record locations, expected/actual behavior, impact, and acceptance criteria.

Verification on Windows x64, Node v26.13.0:

- `node node_modules/typescript/bin/tsc -b packages/kernel`: passed.
- Node tests in kernel, SDK, and manifest: **107 passed, 0 failed, 0 skipped**.
- `tsc -p packages/<kernel|sdk|manifest>/test/tsconfig.json`: all three passed.
- `node tools/scripts/review-core.mjs`: all five defect reproductions and the
  diagnostic observation passed; performance samples recorded.

Reproducer: [review-core.mjs](../../../tools/scripts/review-core.mjs).
Machine-readable evidence: [evidence.json](evidence.json).
The script asserts the observed buggy baseline, not the desired fixed behavior.
After fixes, convert these scenarios to regression tests with the acceptance
criteria below; a failed reproduction may then indicate a successful fix.
Timings are single local samples, not service-level guarantees or profiling data.

## Finding index

P1 = high-impact correctness/mediation defect; P2 = correctness or operational
issue; P3 = improvement without a demonstrated correctness failure.

| ID | Priority | Classification | Finding | Primary location |
|---|---|---|---|---|
| R01 | P1 | Reproduced bug | Stop is lost while the consumer waits for dependencies | `packages/kernel/src/kernel.ts:253-264` |
| R02 | P1 | Reproduced bug | A required consumer survives provider shutdown | `packages/kernel/src/kernel.ts:229-249` |
| R03 | P1 | Reproduced mediation bug | Consumer validator receives the raw API implementation | `packages/kernel/src/api.ts:56` |
| R04 | P2 | Reproduced bug | Provider selection is accepted but ignored during pending start | `packages/kernel/src/kernel.ts:253-274` |
| R05 | P2 | Reproduced bug | Idempotent start restarts an intentionally stopped optional provider | `packages/kernel/src/resolver.ts:33-35`; `kernel.ts:253-262` |
| R06 | P2 | Measured performance risk | Calls revalidate immutable manifests and scan the registry | `packages/kernel/src/access.ts:21-32`; `packages/sdk/src/tokens.ts:89-95` |
| R07 | P2 | Measured performance risk | Starting an isolated plugin resolves unrelated dependency graphs | `packages/kernel/src/resolver.ts:14-40` |
| R08 | P2 | Reproduced observability gap | Swallowed listener errors have no recoverable useful cause detail | `packages/kernel/src/diagnostics.ts:10-25`; `dispatch.ts:77-79` |

## R01 — Stop is lost before the consumer's activation is enqueued

**Location:** `packages/kernel/src/kernel.ts:253-264`, with the early return in
`#stop` at lines 229-230.

**Trigger:** Start consumer C, whose required provider P waits asynchronously
during activation. Once P enters activation, call and await `stop(C)`, then allow
P to complete.

**Expected:** The later stop is serialized after the already requested start (or
cancels it according to an explicit contract). C must not finish active after
the later stop is acknowledged.

**Actual:** `stop(C)` resolves while C is still `registered`. Once P finishes,
the earlier `start(C)` enqueues and activates C. The reproduction ends with C
`active`. The existing stop-during-activation test covers a plugin's own
activation, not the preceding dependency wait.

**Cause/impact:** The root's queue is reserved only after each dependency has
finished. The public operation is in progress while its target appears idle.
Host shutdown/user cancellation can report success and subsequently activate
resources. `restart` and global shutdown need the same pending-operation audit.

**Recommendation:** Track/reserve a root lifecycle operation before dependency
work starts, with explicit cancellation/ordering semantics. Do not simply hold a
root queue across recursive graph operations without checking for queue cycles.

**Acceptance:** A synchronized dependency-blocked start followed by stop ends
stopped, preserves documented ordering, and does not leak owned resources.
Also test stopAll and restart during dependency preparation.

## R02 — Provider remains available while its dependent snapshot is draining

**Location:** `packages/kernel/src/kernel.ts:229-249`.

**Trigger:** Existing consumer A requires P. New consumer B requires P and Q.
Begin starting B; its plan passes P and blocks inside Q. Stop P; A's teardown
blocks. Finish Q and B's activation, then finish A's teardown.

**Expected:** B must fail to commit against a provider being stopped, or join the
shutdown. No active required consumer may survive P's completed stop.

**Actual:** B remains `active` while P is `stopped`.

**Cause/impact:** `#stop` awaits `#stopDependents` before setting P to `stopping`.
The dependent list is a one-time snapshot, so B is absent from it and still sees
P as active. The later scope-close callback suppresses another dependent stop
because P is now `stopping`. B retains resources and a dead required binding;
mediated calls fail, but lifecycle state incorrectly claims it is usable.

**Recommendation:** Reserve provider shutdown before any await and prevent new
bindings/activation commits while it drains. Define whether existing teardown
may call the provider before scope closure; preserve that intentional ordering.

**Acceptance:** Reproduce the two-dependency interleaving above; B must never
remain active after P stops. Cover API, event, and hook required bindings.

## R03 — API shape validator leaks the provider implementation

**Location:** `packages/kernel/src/api.ts:56`, before the mediated handle is built
at lines 59-78.

**Trigger:** The consumer supplies a locally defined token whose validator saves
its argument. Acquire the API with a valid consume grant, revoke the grant, then
invoke the saved object's method. Repeat after stopping the plugins.

**Expected:** Consumer-visible methods continue to enforce permission, activation,
and publication checks. A validator must not obtain a privileged receiver.

**Actual:** The normal handle rejects with `PERMISSION_DENIED`, but the saved
implementation executes both after revocation and after stop (two successful
raw calls in the probe).

**Cause/impact:** `access.validate(token, entry.implementation)` executes
consumer-supplied code with the original mutable implementation. It can save or
modify that object and its methods. This bypass is introduced by the SDK
mediation path itself; it does not require ambient globals, private imports, or
an API method intentionally returning an unmediated object. The documented
trusted-realm limitation does not explain away this broken gateway guarantee.

**Recommendation:** Build the guarded facade before consumer validation and
validate that facade (or a deliberately safe shape view). Provider-side shape
validation may still inspect the provider's own object. Continue rechecking
authorization and lifecycle after validators run.

**Acceptance:** References retained by a consumer validator must reject calls
after consume/provide revocation, API disposal, and either side's stop/restart.
No mutation of the validator argument may change the provider implementation.
Verify synchronous/asynchronous methods and receiver preservation still work.

## R04 — Selection mutation succeeds against a stale start plan

**Location:** `packages/kernel/src/kernel.ts:253-274`.

**Trigger:** Select P1 for C; start C and block P1's activation. While C still
reports `registered`, select P2 for C. Finish P1.

**Expected:** Selection is rejected while C has a pending start, or the pending
start uses the newly accepted selection under documented semantics.

**Actual:** `selectProvider` succeeds, but C binds P1. P2 never starts. The probe
records selected P2 versus actual P1 and activation counts `[1, 0]`.

**Cause/impact:** The same missing pending-root state as R01 allows mutation after
`resolve` has captured selection. Host settings and the current activation
silently disagree. This is a separate public contract failure, likely fixed by
the same lifecycle reservation work rather than a separate abstraction.

**Acceptance:** Changing provider selection during any dependency-wait phase
must have one explicit outcome: rejection or a binding matching the accepted
selection. Add an assertion for both return behavior and inspect bindings.

## R05 — Starting an active consumer revives an unusable optional dependency

**Location:** `packages/kernel/src/resolver.ts:33-35,63-82` and
`packages/kernel/src/kernel.ts:253-262` (the active-state no-op is later, line 153).

**Trigger:** Start C with optional provider P, stop P (C remains active), then
call `start(C)` again.

**Expected:** Starting an active plugin is idempotent. The intentionally stopped
provider stays stopped; explicit restart is required to change C's binding.

**Actual:** P activates a second time. C still binds `review.provider:1`, while P
is now `review.provider:3`; the restarted dependency does not repair C's handle.

**Cause/impact:** Resolution walks an active consumer's stale optional binding by
provider ID, schedules P again, and only then hits C's active-state early return.
Repeated harmless-looking start calls can reopen drivers/resources and undo a
host's intentional stop with no benefit to the consumer.

**Acceptance:** Repeated `start(activeConsumer)` must neither start dependencies
nor change activation IDs after optional-provider loss. Explicit restart should
still bind a fresh available provider normally.

## R06 — API/dispatch hot paths repeat immutable work and global scans

**Location:** `packages/kernel/src/api.ts:62`, `access.ts:21-32`,
`packages/sdk/src/tokens.ts:89-95`, and `packages/kernel/src/dispatch.ts:50-74`.

Every mediated method call invokes `assertDeclaration`, which revalidates and
copies/freezes the entire already validated immutable manifest. Token identity
is repeatedly normalized; `Access.check` scans all registered plugins for
metadata conflicts and creates a fresh frozen token copy. Event/hook delivery
repeats these checks several times per handler, and dispatch initially scans
all subscriptions, including unrelated contracts.

**Evidence:** A trivial method, small fixed manifests, 10,000 calls: approximately
183 ms with no unrelated plugins, 179 ms with 100, and 200 ms with 1,000 in one
local sample. The full registry scan is verified in source; these timings alone
do not attribute individual costs. No production latency budget is specified,
so this is a measured scaling/allocation risk, not a claimed benchmark failure.

**Recommendation:** Keep public SDK validation defensive. Inside the kernel,
cache immutable validated declaration/token results and index active contract
metadata and subscriptions. Preserve dynamic scope, binding, registration,
permission and generation checks on every call. A blanket authorization cache
would reintroduce revocation bugs.

**Acceptance:** Add focused API/event/hook throughput and allocation benchmarks
varying unrelated plugins/subscriptions and manifest size. Check cached paths
against the existing permission and stale-handle tests. Current lifecycle-only
benchmarks do not exercise this workload.

## R07 — Unrelated graph size determines isolated startup cost

**Location:** `packages/kernel/src/resolver.ts:14-40,77-82`.

`resolve(root)` builds edges for every registered plugin before walking the
root's reachable dependencies. Each requirement scans all providers and their
declarations through `candidates`. The ready-node loop additionally repeatedly
sorts/scans remaining reachable nodes. With bounded contracts per plugin, global
candidate discovery alone can become quadratic in registry size.

**Evidence:** Starting one dependency-free plugin with unrelated provider/consumer
pairs took about 1.85 ms for 100 pairs, 29.71 ms for 500, and 115.89 ms for 1,000.
None of those pairs is needed by the target. Timings are single local samples.

**Impact/recommendation:** A large installed registry delays small independent
operations on the JavaScript thread. Index providers by contract and reuse
validated graph metadata. Resolve only the needed closure where possible while
preserving the accepted stable global optional-cycle policy. Avoid replacing
the resolver wholesale before measuring an indexed version.

**Acceptance:** Benchmark isolated roots in a large unrelated registry, as well
as chains/diamonds/optional cycles. Existing 10/50/100-node chain samples do not
cover this case. Assert deterministic order and ambiguity semantics unchanged.

## R08 — Listener failures cannot be meaningfully diagnosed through the host API

**Location:** `packages/kernel/src/diagnostics.ts:10-25`,
`packages/kernel/src/dispatch.ts:77-79`, `packages/kernel/src/types.ts:25-33`.

**Trigger:** An event listener throws an ordinary Error. Event dispatch correctly
continues and resolves; the host inspects diagnostics afterward.

**Actual:** The only exposed cause is `{ kind: "object" }`. Error name, message,
stack, safe kernel code and nested failure identity are unavailable. Raw causes
are retained in a private array but no host retrieval/sink exists. This matches
the narrow current implementation/type; it is an operational feature gap rather
than a claim that event dispatch should reject on listener failure.

**Impact:** Plugin/activation/contract IDs locate the failing listener, but do not
explain its failure. Since emission swallowed the exception, the host cannot
recover it from the returned promise either. Similar opacity affects detached
cleanup and late activation failures.

**Required design:** Define an explicit trusted-host diagnostic facility or
sanitized, opt-in summaries. Never indiscriminately read arbitrary thrown-object
properties or expose payloads/secrets in ordinary snapshots. Include a safe way
to correlate detail with the bounded diagnostic sequence, with clear retention
and redaction semantics. This likely requires a host API/type specification;
it does not require a mandatory logger plugin or access from plugin context.

**Acceptance:** The trusted host can distinguish two ordinary listener failures
and obtain useful approved detail while normal inspect remains safe against
opaque/proxy thrown values. Document what happens when bounded history expires.

## Not implemented or deliberately unsupported

These are documented scope decisions, **not additional defects** discovered by
the review. They should not be represented as completed capabilities:

| Area | Current gap | Source / consequence |
|---|---|---|
| Reference integrations | K07.2 executable example packages, K07.3 replaceable logger/commands examples, K07.5 provider/fake-driver example | Explicit Owner deferrals in `DOCS/CoreImplementationPlan.md:237-240`; tests exist, standalone integration examples do not |
| Registry mutation | No unregister/implicit replacement; no automatic rebinding of optional handles | `DOCS/reference/core-boundary.md`; use explicit stop/restart/selection within the current contract |
| Distribution and evolution | Public registry, pack/publish, migrations, certification and hot reload deferred | Baseline decision and implementation plan; candidate is a private source-checkout workflow |
| Target adapters and application features | Browser/native/Capacitor/Tauri hosts, editor/UI and native driver features absent/unverified | Baseline and release notes; only documented Windows/Node execution evidence |
| Hostile-code containment | No worker/process sandbox or deep value isolation | Trusted single-realm design; ambient globals and intentionally returned objects are outside mediation |
| Forced cancellation and async attribution | JavaScript cannot be terminated; arbitrary post-await host self-waits cannot always be recognized | Lifecycle decision 0002; deadlines and cooperative cleanup are intentional limits |
| External acceptance | Hosted CI and broader platform matrix not verified here | Release notes; local passing checks are not remote or cross-platform evidence |

No placeholder/TODO implementation stub was found in the three reviewed source
trees. Their absence does not establish completeness beyond the accepted scope.

## Recommended repair sequence

1. Fix R03 and add retention/revocation regression tests at the public boundary.
2. Address R01/R04 together through pending-root lifecycle semantics; fix R02's
   shutdown admission race and R05's active-start side effects. Add deterministic
   interleavings rather than sleeps or broad unrelated tests.
3. Establish hot-path baselines, then address R06/R07 with small indexes/caches
   that preserve dynamic checks and deterministic resolution.
4. Specify R08's safe host diagnostics contract before implementation.
5. Re-run affected package checks and update candidate release evidence once
   fixes land. This review does not certify the entire application or authorize
   merging/publishing.

All eight findings remain open. The five reproduced behavior defects warrant
fixes before treating the current core lifecycle/mediation guarantees as ready.
