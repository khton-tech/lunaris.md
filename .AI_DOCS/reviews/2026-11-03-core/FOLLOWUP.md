# Independent repair assessment

Date: 2026-11-03. Reviewed repair head: `3698b21f349156d67e6b86b29c93d640afebf632`.
Compared against original review commit `f6ba2a2`.
Verdict: substantial repairs, but lifecycle release acceptance is blocked by F01.

**Repair work: 75/100. Core readiness: 65/100.** These are engineering judgments
using the rubric below, not percentages of implemented features or probabilities
of correctness. Readiness is for the accepted local 0.1 trusted-plugin Windows/Node
scope. Owner-deferred plugins, native/UI features and hostile-code isolation are
not counted as failures to complete that scope.

## Verification

- Initial working tree clean; reviewed five repair commits and their source/test/docs changes.
- Built `packages/kernel` and its project references successfully.
- Kernel, SDK and manifest runtime suites: **126 passed, 0 failed, 0 skipped**.
- Kernel, SDK and manifest type fixtures: passed.
- Architecture/import checks for the three reviewed packages: passed.
- Agent's `review-core.mjs`: **18 regression tests passed** (a subset of the 126).
- Independent probes reproduce F01 for API, event and hook dependency bindings.
- Nine uninstrumented shared-contract call samples verify F02's scaling concern.

Host/CLI implementations, remote CI and the entire release pipeline were not
re-audited. The agent's allocation-profiler evidence was inspected, not rerun or
treated as directly comparable to the uninstrumented measurements here.

Run `node tools/scripts/review-core-followup.mjs` after building. Pass an output
path to save evidence. [Saved evidence](followup-evidence.json) and
[probe source](../../../tools/scripts/review-core-followup.mjs) accompany this review.
The probes assert the observed defective state; after fixes, replace those
assertions with desired behavior in permanent regression tests.

## Original findings: independent disposition

| Finding | Assessment |
|---|---|
| R01 | Original stop-during-dependency-wait scenario fixed, but queue reservation introduces F01; lifecycle repair is not fully accepted |
| R02 | Original late-consumer shutdown race fixed; API/event/hook cases pass |
| R03 | Fixed: consumer validators receive frozen mediated handles; retained references enforce revocation and lifecycle checks |
| R04 | Fixed: pending operations prevent provider-selection mutation |
| R05 | Fixed for tested sequential/concurrent idempotent starts; explicit restart still refreshes optional binding |
| R06 | Material improvement: immutable declaration caching and contract/subscription indexes; shared-contract fan-out remains costly (F02) |
| R07 | Material but partial improvement: provider index and fast path for dependency-free roots; nontrivial roots still traverse unrelated graph metadata |
| R08 | Fixed within the chosen trusted-host design: bounded diagnosticCause(sequence), opaque ordinary snapshots and documented redaction responsibility |

The R07 remainder is explicitly documented by the repair author. It is a known
limit, not concealed behavior: `resolver.ts:34` still loops over all registrations
when the fast path at lines 27-29 does not apply. Its need for stable global
optional-cycle handling is a reasonable constraint; the original scaling goal is
not completely solved for every graph shape.

## F01 — P1: permanent lifecycle queue deadlock

**Locations:** `packages/kernel/src/kernel.ts:274-283` (new reservation and
`await ready`), `kernel.ts:247` (provider awaits dependent stops),
`kernel.ts:260` (dependent stop appended to its queue), `kernel.ts:98` (queue tail).

Start a provider P and its required consumer C, then issue these host calls without
awaiting between them:

```js
const first = kernel.stop('followup.consumer');
const second = kernel.stop('followup.provider');
const third = kernel.start('followup.consumer');
await Promise.all([first, second, third]); // Never settles on the reviewed head.
```

No plugin callback hangs or captures host APIs. The plugins activate and dispose
synchronously. This is ordinary concurrent management by the trusted host.

**Observed:** Only `first` settles. C is `stopped`, P is `stopping`, and the host
scheduler has **zero** pending deadlines. API, event and hook variants all reproduce.
Complete event-loop turns are drained before assertions; the wait cycle below
establishes why this is a deadlock rather than merely slow scheduling.

The new eager reservation creates this wait cycle:

1. P's stop snapshots C while C's first stop has not yet closed its scope.
2. P appends another stop to C's queue, behind the already reserved C start.
3. That C start waits for the reserved P start (`ready`).
4. P's start is behind P's stop, which awaits the second C stop.

Thus `P.stop -> C.secondStop -> C.start -> P.start -> P.stop`.
Activation/cleanup deadlines cannot help because the waits occur outside the
deadline-wrapped activation and cleanup work. `stopAll` also cannot recover:
its new initial tail-drain waits for those unresolved operations.

**Why this matters:** The repair avoids losing the original stop but replaces a
timing hole with a cycle between opposite start/stop graph traversal directions.
The original review explicitly called for checking queue cycles when reserving
root work. The tests cover isolated start/stop interleavings, not this composition.

**Required acceptance:** Add a deterministic regression for this exact ordering
and permutations with shared/diamond dependencies. Every management operation
must settle or return a documented bounded failure; no active resource may survive
the chosen final state. Revise operation reservation/dependent-stop coordination
to avoid waiting on work queued behind a waiting start. Adding a timeout to hide
the cycle alone is not a complete scheduling fix. No production fix is applied
by this assessment.

## F02 — P2: common-contract calls still scale with all participants

**Location:** `packages/kernel/src/access.ts:48-52`.

The registry-wide scan was narrowed to a contract-owner bucket, but every method
invocation still calls `assertCompatibleTokens` for each active participant in
that bucket. With N consumers of the same API, one consumer's call is O(N), even
though all immutable metadata was already accepted at registration/acquisition.
This is an important topology for future shared logger, settings or storage APIs.

Public-boundary samples: one trivial method, 10,000 calls per sample, same SDK token,
three samples per population, no allocation profiler:

| Active consumers of the same contract | Sample 1 ms | Sample 2 ms | Sample 3 ms |
|---|---:|---:|---:|
| 1 | 11.639 | 10.375 | 9.765 |
| 100 | 298.226 | 299.287 | 308.945 |
| 500 | 1488.784 | 1482.911 | 1493.341 |

These are local observations, not universal latency predictions. The agent's
benchmark varies **unrelated** contracts and therefore misses this case. Dispatch
also repeats Access.check for each listener, so same-contract fan-out deserves a
separate benchmark; no event/hook timing claim is made from these API measurements.

**Required acceptance:** Check immutable metadata consistency when participants
join/commit, or use an invalidatable contract metadata generation. Preserve
per-call grant, scope, binding and publication checks. Add shared-contract fan-out
benchmarks alongside unrelated-plugin benchmarks; establish an explicit budget
before claiming large-registry readiness.

## Scores and rationale

### Repair work — 75/100

| Criterion | Awarded / maximum | Reason |
|---|---:|---|
| Addressing original findings | 24 / 30 | Original scenarios handled; R06/R07 remain partial and lifecycle acceptance is undermined |
| Regression analysis and tests | 12 / 25 | Useful 18-test suite, but misses a permanent ordinary-host queue cycle and shared-contract scaling |
| Design and boundary preservation | 18 / 20 | Guarded API validation, SDK provenance caches and host-only diagnostic retrieval are sound choices |
| Performance work | 12 / 15 | Real caching/indexing and broader profiling, but incomplete workload coverage |
| Documentation and reproducibility | 9 / 10 | Clear commits, scope limits, saved evidence and reproducible checks; completion language is too strong given F01 |
| **Total** | **75 / 100** | Meaningful work needing another correction pass |

### Core readiness for the accepted local 0.1 scope — 65/100

| Criterion | Awarded / maximum | Reason |
|---|---:|---|
| SDK, manifests and architectural boundaries | 18 / 20 | Existing implementation and targeted runtime/type/import checks are solid |
| Lifecycle and graph reliability | 12 / 30 | Core paths work, but a permanent deadlock blocks dependable shutdown/restart coordination |
| Mediation and permissions | 18 / 20 | Known raw-reference escape fixed; revocation and stale-handle regressions pass |
| Performance and observability | 8 / 15 | Useful diagnostic detail exists; common-contract scaling and nontrivial global graph work remain |
| Verification confidence | 9 / 15 | 126 green tests are valuable but missed the independently reproduced management failure; broader concurrency evidence is missing |
| **Total** | **65 / 100** | Suitable for controlled development experiments, not accepted as a reliable release candidate |

The score is not improved simply by increasing test counts. Before reconsidering
release readiness, fix F01, demonstrate the lifecycle interleaving matrix, and
address or explicitly budget F02. Then rerun affected checks and update the
release evidence. No deduction is made merely for Owner-deferred product features.
