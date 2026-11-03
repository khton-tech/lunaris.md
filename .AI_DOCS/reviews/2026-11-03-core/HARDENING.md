# Core hardening acceptance

Date: 2026-11-03. Branch: `fix/core-lifecycle-scaling`.
Implementation commits: `53093eb` lifecycle, `57d7ca4` metadata, `7113a25` resolution.
No merge or publication performed. Assessment applies to the agreed local 0.1
Windows/Node trusted-plugin scope, not the whole application.

## Results

F01 is fixed: shutdown reserves the required-dependent graph synchronously,
including pending starts. A running stop only awaits already reserved operations;
it cannot insert a consumer stop behind a start that waits on its provider queue.
Shared descendants are deduplicated within each request. Provider admission closes
while consumers drain; consumer cleanup precedes provider cleanup. StopAll reserves
its stops before yielding and waits for the pre-existing queue tails.

F02 is fixed for the demonstrated common-contract workload: one canonical metadata
record per committed contract replaces per-call scans of every participant. Commit
checks are transactional. Canonical metadata does not retain departed validators.
Per-call permission, scope, activation, binding and publication checks remain.
Conflicting concurrently staged API/event/hook metadata is rejected, and the last
owner's departure permits a later contract with different metadata.

R07 is addressed for disconnected/incoming-only registry growth: an incremental
dependency index tracks a conservative directed closure of possible providers.
Resolution visits that closure rather than unrelated registrations. All possible
optional, ambiguous and version-incompatible candidates are included before normal
filtering, preserving the global sorted optional-cycle policy inside the closure.
No outside edge can create a path from inside the closure back outside it.

Original R02/R03/R04/R05/R08 acceptance remains green. No new plugin SDK function,
plugin workaround, permission cache, platform dependency or mandatory service was
introduced. Required existing services were reused; the new dependency index owns
only registration-time lookup metadata.

## Evidence

- `npm run check -- kernel`: **218 passed**, no skips; kernel and affected test-kit,
  development-host and CLI packages; build, boundaries and type fixtures passed.
- `node tools/scripts/review-core.mjs`: **138 passed**; includes original repairs
  and all added hardening cases. This is a subset of the release tests below.
- `npm run release:check`: **268 passed**, zero skips; all six workspace checks,
  type fixtures, architecture boundaries, CI orchestration tests, public exports,
  diagnostic/documentation audit, lifecycle benchmark and generated-plugin rehearsal.
- Generated-plugin journey: 2033 ms locally, including offline installation, build,
  validation, actual tests, inspect and dev/stop. Cache/network timing is not an SLO.
- `node tools/scripts/review-core-followup.mjs <output.json>`: all three exact F01
  reproductions now complete and clean up, plus shared API/event/hook and two-node
  dependency-closure measurements.
- [Saved uninstrumented measurements](hardening-evidence.json).

An initial direct invocation of `node tools/scripts/check.mjs kernel` failed the
CLI fixture's npm-environment precondition. The documented `npm run check -- kernel`
and later complete release invocation passed; this was not hidden as a code failure.

The new lifecycle suite includes 108 permutations (three dependency kinds, pair
and diamond graphs, three action sets, six orderings), a pending-consumer stop case,
and a noncooperative disposer deadline case. It verifies settlement, active binding
consistency, resource cleanup and empty deadline queues. Additional tests cover
atomic metadata commit/release, revocation, late registration, selection ambiguity,
range filtering and stable optional-cycle choices under reordered registrations.

## Comparable API samples

Same simple method and 10,000 synchronous calls per sample; medians of three local
uninstrumented runs. Historical pre-fix samples remain in followup-evidence.json.

| Consumers of the same API | Before ms | After ms |
|---|---:|---:|
| 1 | 10.375 | 7.243 |
| 100 | 299.287 | 6.640 |
| 500 | 1488.784 | 6.950 |

The measured 500-consumer sample is approximately 214 times faster. This is a
specific local workload comparison, not a universal speedup claim. More importantly,
source inspection shows no participant loop on that call path anymore.

Event delivery (50 emissions) with 100/500 consumers: median 14.498/67.163 ms.
Hooks (50 pipelines) with 100/500 handlers: median 24.711/129.935 ms. These workloads
necessarily invoke every handler; scaling is approximately linear in the samples.

A two-node required graph with 100/500/1000 unrelated provider-consumer pairs starts
in median 0.060/0.051/0.033 ms over five samples. The 1000-pair samples range from
0.030 to 0.091 ms; unrelated plugins remain registered and never execute. This is
a stronger nontrivial-root workload than the former dependency-free fast-path case.

## Readiness reassessment

**88/100, previously 65/100**, using the same rubric. This is implementation-owner
self-verification, not an independent second review or a statistical guarantee.

| Criterion | Before | Now | Evidence and residual limit |
|---|---:|---:|---|
| SDK/manifests/boundaries (20) | 18 | 18 | Public contracts and full type/import checks pass; no broad version-history evidence |
| Lifecycle/graph reliability (30) | 12 | 26 | Exact deadlock and 108 interleavings pass, including diamonds; not exhaustive model checking |
| Mediation/permissions (20) | 18 | 18 | Revocation/stale-handle and validator isolation remain green; no security certification claim |
| Performance/observability (15) | 8 | 13 | Shared-contract and unrelated-graph bottlenecks removed; useful host diagnostics retained |
| Verification confidence (15) | 9 | 13 | Full local release checks and resource assertions pass; no long-duration deployment evidence |
| **Total** | **65** | **88** | **Good local candidate for integration testing** |

Remaining engineering limits: shutdown graph discovery still scans registrations;
dense relevant dependency graphs and very deep recursion deserve separate scale
budgets. JavaScript cancellation remains cooperative, arbitrary async host self-waits
are deadline-limited, and only the documented local platform was executed. Previously
Owner-deferred application/native/reference-plugin features are not penalized here.
An independent review and sustained realistic plugin workloads would provide more
confidence than assigning this implementation 100/100 from unit tests alone.

The historical FOLLOWUP.md scores and evidence describe commit 3698b21. They are
preserved rather than rewritten; this document is the current acceptance record.
