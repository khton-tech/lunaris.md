# Lunaris developer documentation

- [Architecture proposal](TechDoc.md): original design input, preserved unchanged.
- [Core implementation plan](CoreImplementationPlan.md): delivery scope, architecture decisions, ordered backlog, verification, and release gates.
- [Tauri host and recovery shell](guides/tauri-host.md): first desktop target, diagnostic UI, recovery behavior, commands and manual acceptance.
- [Logging contracts and composition](reference/logging.md): replaceable Logger/DevTools sink, record format, failure behavior and verification.
- [Product backlog](Backlog.md): product component status and deferred scope.
- [Web server foundation](design/web-server.md): accepted account/Vault requirements, SDK blockers, required public contracts, bundle releases and pending delivery sequence.
- [Remote service contracts](reference/remote.md): account sessions, Vault catalog, durable drafts and filesystem backend tokens.
- [Local server development](guides/server-development.md): one-command source watching, shared builds, API restarts and paired local validation without a server remote.
- [Browser host](../hosts/web/DOCS/README.md) and [shared application host](../hosts/application/DOCS/README.md): common product composition, build commands and integration checks.
- [Interface foundation proposal](design/interface-foundation.md): code-based design review, researched direction, interactive study and approval/implementation criteria (proposed, not yet adopted).
- [UI slots](reference/slots.md): portable regions, scoped ownership, DOM targets and host composition.
- [Window API and custom titlebar](reference/window.md): replaceable native-window provider/driver, title and controls, owned chrome and save-gated closure.
- [Startup progress](reference/startup.md): read-only SDK milestones, host bridge and early loading surfaces.
- [Lunaris Runner](../plugins/UI/lunaris-runner/DOCS/README.md): configured ASCII startup screen, milestones and retained loaded status.
- [Theme settings](../plugins/UI/theme-settings/DOCS/README.md): startup theme preference, default selection and failure behavior.
- [Theme provider](reference/themes.md): engine-owned descriptions, registration, selection, updates and lifecycle notifications.
- [Base theme engine](reference/base-theme.md): Monochrome palette, semantic roles, geometry, typography and lifecycle.
- [Component provider](reference/components.md): shared component registration by role ID, mounting, instance ownership and change events.
- [Mantine components](../plugins/UI/mantine-components/DOCS/README.md): Mantine startup/selector roles, theme adapter, lifecycle and future UI development.
- [Vault-scoped filesystem](reference/filesystem.md): provider/driver APIs, relative paths, dialogs, writes, permissions and native verification.
- [Application configuration directory](reference/application-storage.md): global file storage, owned roots and coordinated closure.
- [Vault Manager](reference/vault.md): active context, opening/switching/closing, preparation hooks and events.
- [Settings foundation](reference/settings.md): declarative category/group/item registration, typed controls, ordering/layout, owned views and Vault-scoped callbacks; legacy custom sections remain supported.
- [Settings integration audit](design/settings-integrations.md): proposed preferences, owning plugins, SDK readiness, exclusions and bounded delivery order.
- [Interface settings](../plugins/UI/interface-settings/DOCS/README.md): immediate Vault-local language/theme preferences, live application, persistence and selection limits.
- [Active screen](reference/active-screen.md): one selected screen in Workspace main, lazy mounting, retained hidden instances and Vault lifecycle.
- [Active document](reference/active-document.md): shared active file identity, restoration and persistent marking independent of focus.
- [Text editor](../plugins/UI/text-editor/DOCS/README.md): CodeMirror 6, two-second autosave, SDK lifecycle integration, ownership and manual acceptance.
- [Editor integration design](design/text-editor.md): original boundary and the implemented resolution of SDK lifecycle gaps.
- [File explorer](reference/file-explorer.md): Arborist Sidebar tool, owned observation, file operations and document-layer integration status.
- [Context menu](reference/context-menu.md): owned action contributions, nested groups, invocation context, Mantine rendering and File Explorer integration.
- [Sidebar](reference/sidebar.md): independent icon rail, tab registration/selection, left panel and Workspace integration.
- [Workspace](reference/workspace.md): content registration, Vault handoff, placeholders, ownership and integration.
- [Vault selector](reference/vault-selector.md): implemented interface, resolved contract gaps, integration and manual visual acceptance.
- [Recent Vault history](../plugins/systems/vault-history/DOCS/README.md): persistent recent locations, reopening, notifications and degraded storage behavior.
- [Config manager](reference/config.md): global/per-Vault TOML files, plugin namespaces, precedence and safe persistence.
- [Localization service](reference/localization.md): English-first per-plugin catalogs, text lookup, parameter substitution and locale events.

The implementation plan is the human-maintained delivery baseline. Update its task statuses and evidence as work lands. Agent-only scratch plans and machine-readable tracking belong in `.AI_DOCS/`, not here.

The architecture proposal contains imported citation markers and illustrative package names, versions, and URLs. Those markers are not independently verifiable references in this repository, and examples are not implemented API contracts. Resolve normative behavior through the decision gate in the implementation plan before coding.

- [Editor extensions](reference/editor-extensions.md): scoped CodeMirror/Markdown contributions for independent editor plugins.

- [Callouts](../plugins/UI/callouts/DOCS/README.md): independent Obsidian-style editor plugin, disclosure, SDK integration and native acceptance checklist.
