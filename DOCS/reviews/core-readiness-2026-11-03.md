# Core readiness assessment — 2026-11-03

Reviewed revision: `155f4b02202027e1e193001bd534fc888285060d`.
Branch: `fix/core-review-findings`. The working tree was clean before review.

## Decision

**89/100: ready to continue application development on the local 0.1 foundation.**

No unresolved blocking defect was identified in this review. This is an engineering
readiness judgment, not a measured completion percentage or a guarantee of defect
absence. The assessment covers the kernel, SDK, manifest validator, test kit,
development host and CLI. It does not certify a production application or an
unimplemented platform host.

The core already supplies the necessary generic mechanisms: dependency resolution,
provider selection, transactional activation, scoped ownership, cancellation,
API/event/hook contracts, permission mediation and diagnostics. Application services
can be implemented as replaceable plugins using the public SDK. No missing public
SDK operation was demonstrated for the documented design scenarios.

## Score

| Area | Score | Basis and remaining confidence gap |
|---|---:|---|
| Architecture and modularity | 19/20 | Separate runtime responsibilities and enforced package boundaries; replacement mechanisms exist, but actual application service replacement is still unproven. |
| Lifecycle and resource handling | 19/20 | Rollback, deadlines, stale handles, dependent shutdown and restart have regression coverage; application-owned asynchronous resources still need integration evidence. |
| SDK and contract behavior | 18/20 | Public types, declaration checks, directional versions and API/event/hook operations are exercised; most product design scenarios are compile-time fixtures rather than running product plugins. |
| Permissions and diagnostics | 9/10 | Host grants, revocation and bounded safe snapshots work; authority checks depend on contracts and adapters mediating sensitive operations correctly. |
| Verification and developer workflow | 14/15 | Release checks and generated-plugin workflow pass locally; remote CI execution is not established by this review. |
| Application/platform integration evidence | 10/15 | Local Node workflow is demonstrated; real editor/UI/native-driver flows and additional target hosts are unverified. |
| **Total** | **89/100** | **Proceed with application implementation; validate each target host and real product flow as it is introduced.** |

The deductions express remaining integration and verification uncertainty. They do
not imply that deferred application features belong inside the kernel.

## Evidence collected in this review

- `npm run release:check` passed: **313 tests, zero skipped**, workspace build,
  dependency boundaries and positive/negative type fixtures.
- The release audit passed for **24 documentation files**, public exports,
  diagnostics and local links. CI selection tests also passed.
- Generated-plugin rehearsal passed in **1997 ms**: generation, offline install,
  build, validation, tests, inspection and development start/stop.
- `node tools/scripts/audit-core-2026-11-03.mjs` passed **all four original review
  probes**, with zero violated invariants. These supplement the release suite;
  they are not four additional release-suite tests.
- The existing integration test exercises dependency startup, APIs, events,
  hooks, grant/revoke, provider restart, stale access and final resource cleanup.
- Source inspection covered kernel lifecycle/resolution, API access, dispatch,
  scopes/signals, permissions, diagnostics, SDK contracts, manifest validation,
  local loading and boundary/CI orchestration.

Local benchmark observations: public test-host startup **35.69 ms**; a 100-node
chain registered/started/stopped in **4.18/3.53/3.50 ms**; 100 simple lifecycle cycles
in **1.83 ms**. These are individual local measurements, not latency guarantees or
evidence for arbitrary graph sizes.

Execution target: Windows x64, Node 26.13.0. Existing installed dependencies were
used; a fresh root `npm ci`, remote CI and additional operating systems were not
tested in this review. No desktop automation was used.

## Previous blocking findings

The [previous review](core-review-2026-11-03.md) describes historical defects.
Its R1–R4 probes now pass: root disposal permits a fresh activation; dependent
cleanup precedes provider resource release; consumed token versions reject older
providers; native and foreign Promise rejections produce API diagnostics.
Those historical findings are not current blockers.

## Conditions for continuing

1. Choose the first actual application host. The currently verified host is local
   Node; browser, Capacitor and Tauri support requires its own implementation and
   execution evidence. Keep platform work in hosts/drivers behind providers.
2. Implement the first real application flow through public contracts and SDK
   calls. Verify startup, an actual user operation, stop/restart and resource
   release. Standalone reference plugins previously deferred by the Owner are
   not required by this assessment.
3. Keep product responsibilities outside the kernel: layout, themes, localization,
   logging, editor state and file access belong to their respective plugins,
   providers and drivers. If a real flow exposes an SDK gap, stop that plugin's
   implementation and specify the required SDK change before adding a workaround.
4. Before claiming production or additional-platform readiness, obtain target-host
   integration evidence and remote CI results. These are later acceptance gates,
   not reasons to postpone application development now.

## Explicit limits

Permissions mediate SDK calls; they do not isolate hostile JavaScript. Plugins
share ambient capabilities with the host. Deadlines cannot terminate blocking
JavaScript, forcibly cancel arbitrary callbacks or reverse external side effects.
Returned values are not deeply isolated. Local module loading is not a secure
package installer, and module initialization is outside activation deadlines.
These are documented scope limits, not newly discovered defects.

Public distribution, live code reload and production UI/native hosts remain
outside the delivered milestone. No code fix, new subsystem, merge, push or
publication was performed as part of this assessment.
