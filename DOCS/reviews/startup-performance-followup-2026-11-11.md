# Startup and performance remediation follow-up

1. **The SDK blocker is resolved.** The Owner authorized SDK changes. Work
   continues on `fix/startup-and-autosave-performance`, without merging main.
   The original [review](startup-performance-2026-11-11.md) records the earlier
   baseline, not the current completion status.

2. **Activation now has an awaited preparation boundary.** Public Preparation
   contracts register owned work in settings, document, content and presentation
   phases. Startup payloads remain compatible. The shared host waits for these
   phases before mounting the product surface and reporting loaded. The existing
   static loader remains visible during preparation; no artificial wait was added.
   Base themes are registered before saved theme selection and product activation.

3. **Vault preparation is integrated with existing lifecycle management.**
   VaultLifecycle 1.1 adds optional settlementOrder. Runtime activation defaults
   to order 0; startup-provider prepares content at 100. Config remains responsible
   for storage preparation. Interface settings, ActiveDocument, editor preferences
   and document loading, explorer initialization, and Workspace presentation are
   connected through public SDK contracts. Workspace retains layout/surface
   ownership. A delayed real Settings/Workspace test proves the workspace is
   absent until persisted preferences settle, without repeating the read on the
   subsequent VaultChanged notification. Application-only legacy hosts remain
   supported through the explicit tracksVault capability.

4. **Cancellation and failure behavior are bounded.** Runs have an epoch and a
   15-second deadline, including notification dispatch. A later run, provider
   disposal or host shutdown cancels pending work. Owner removal removes its
   participant and unblocks preparation. Late registrations await their own work
   without reopening completed global startup; registrations during a sealed run
   are rejected. Consumers must honor cancellation before committing results.
   Required application preparation failures enter host recovery. Recoverable
   storage failures can settle with existing error/retry controls. Vault failure
   does not falsely roll back a root that was already committed.

5. **Autosave no longer causes unchanged explorer loading pulses.** The earlier
   fix remains: background rescans publish changed names/kinds or errors, rather
   than toggling loading for every cached directory. Tests preserve published props
   and an executable open context menu across three rescans. Filesystem reads still
   occur for consistency. Leaving a Vault also clears its pending explorer readiness
   promise so close does not wait for an obsolete tree request.

6. **Unnecessary configuration work is reduced.** Three concurrent namespace reads
   now share one filesystem read/TOML decode and return independent snapshots.
   Writes split read batches, and later reads still detect external file changes;
   no persistent cache was introduced. Setting an identical scalar skips the write
   and notification. Restoring a valid active-document path no longer rewrites that
   same path into configuration. Explicit selection and invalid-path cleanup still
   persist. Optimistic version checks are retained.

7. **Idle monitoring performs less work.** Host refresh reuses its kernel inspection
   when publishing state. The hidden recovery panel updates visibility without
   serializing the whole snapshot or rebuilding diagnostics tables. A regression
   verifies twenty healthy notifications perform zero recovery serializations,
   then confirms immediate fallback rendering. Fault detection remains enabled.

8. **Additional startup bugs were fixed through integration tests.** The complete
   browser composition initially exposed premature editor statistics publication
   during awaited activation and a runner update after its loading scope had been
   released. Initial statistics now establish a baseline for API readers; later
   changes publish normally. Released runner scopes ignore terminal notifications.
   The full real browser plugin graph now starts and stops without unexpected
   logged errors (first-run NOT_FOUND probing for config creation is expected).
   The stale settings test now includes the shipped Lunaris theme. Audit regressions
   also caught and verified a fix preserving preference behavior during provider
   retirement and permission denial.

9. **Final automated verification passed.**
   - `node tools/scripts/check.mjs startup vault-manager config-manager runner`:
     331 tests, zero skipped, builds, dependency boundaries and type fixtures.
   - `node tools/scripts/system-review.mjs`: 24 selected behavior regressions.
   - `node tools/scripts/deep-review.mjs`: 5 selected lifecycle/data-safety regressions.
   - `npm run web:build`: successful production web build.
   - `npm run build --workspace @lunaris/tauri`: successful desktop frontend build;
     this is not a native installer build or WebView execution test.
   These suites overlap; their counts are not a claim of unique total coverage.

10. **Remaining measured constraints and acceptance.** The web main JavaScript
    chunk is 1,744.90 kB minified / 544.02 kB gzip. Tauri's application chunk is
    1,653.76 kB / 517.27 kB gzip. Both builds retain the chunk-size warning.
    Splitting first-load dependencies remains a profiling-driven follow-up; no
    before/after startup latency or FPS claim is supported by these builds.
    Remote notifications still request full rescans, so network directory work
    remains a candidate for coordinated client/server protocol improvement.
    No sibling-server code was changed or deployment performed.
    Manual acceptance remains: cold launch with saved theme/language, switching
    between differently configured Vaults, typing through multiple autosaves with
    an open Files menu and keyboard focus, external create/rename/delete, read
    failure/retry, and stop during slow loading. Desktop automation was not used.
    This pass covers the identified startup, restoration, autosave, configuration
    and monitoring paths; it is not an exhaustive application/server audit or a
    beta release sign-off.
