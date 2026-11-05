# Lunaris developer documentation

- [Architecture proposal](TechDoc.md): original design input, preserved unchanged.
- [Core implementation plan](CoreImplementationPlan.md): delivery scope, architecture decisions, ordered backlog, verification, and release gates.
- [Tauri host and recovery shell](guides/tauri-host.md): first desktop target, diagnostic UI, recovery behavior, commands and manual acceptance.
- [Logging contracts and composition](reference/logging.md): replaceable Logger/DevTools sink, record format, failure behavior and verification.
- [Product backlog](Backlog.md): product component status and deferred scope.
- [UI slots](reference/slots.md): portable regions, scoped ownership, DOM targets and host composition.
- [Theme provider](reference/themes.md): engine-owned descriptions, registration, selection, updates and lifecycle notifications.
- [Base theme engine](reference/base-theme.md): Lunaris Light/Dark palettes, semantic roles, geometry, typography and lifecycle.
- [Vault-scoped filesystem](reference/filesystem.md): provider/driver APIs, relative paths, dialogs, writes, permissions and native verification.
- [Application configuration directory](reference/application-storage.md): global file storage, owned roots and coordinated closure.
- [Vault Manager](reference/vault.md): active context, opening/switching/closing, preparation hooks and events.
- [Config manager](reference/config.md): global/per-Vault TOML files, plugin namespaces, precedence and safe persistence.
- [Localization service](reference/localization.md): English-first per-plugin catalogs, text lookup, parameter substitution and locale events.

The implementation plan is the human-maintained delivery baseline. Update its task statuses and evidence as work lands. Agent-only scratch plans and machine-readable tracking belong in `.AI_DOCS/`, not here.

The architecture proposal contains imported citation markers and illustrative package names, versions, and URLs. Those markers are not independently verifiable references in this repository, and examples are not implemented API contracts. Resolve normative behavior through the decision gate in the implementation plan before coding.
