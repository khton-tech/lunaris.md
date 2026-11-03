# Follow-up repair plan

Baseline: d1e357f. Branch: fix/core-lifecycle-scaling.

Required: reliable concurrent lifecycle operations, bounded common-contract call
cost, and evidence for local 0.1 release readiness. Existing SDK/kernel services,
public tests and scripts cover the required interfaces; no plugin SDK extension
or workaround is needed. Keep responsibilities in the existing lifecycle,
access, resolver and test modules.

1. Reserve complete stop graphs before yielding, including pending required starts.
   Stop operations may await already reserved child stops, never append a stop to
   a consumer queue while holding a provider queue. Test interleaving permutations,
   shared graphs, provider loss and deadline/error paths. Commit after validation.
2. Move immutable contract compatibility checks to participant admission/commit;
   retain dynamic authorization, scope and publication checks on every call.
   Test concurrent conflicting metadata and revocation; benchmark common contracts.
3. Restrict resolution to relevant connected metadata while preserving deterministic
   optional-cycle choices; validate against original global policy and large registries.
4. Replace obsolete defective-state probes with regression checks, run affected
   checks/release validation, and record measured outcomes and remaining limits.

Scores will be reassessed from evidence, not used as implementation targets.
