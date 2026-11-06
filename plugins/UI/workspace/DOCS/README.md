# Workspace screen

Purpose: display the working surface for the committed active Vault after startup.
The plugin owns screen/content slots, component instances, an empty-state placeholder
and the close-Vault action. It does not own document state, files, tabs or content
registration. Default export: `@lunaris/workspace-plugin`, ID `lunaris.workspace`.

Provides no callable APIs or events. Requires Logger, Workspace/WorkspaceChanged,
Vault/VaultChanged, Startup/StartupChanged, Slots, SlotDom,
Components/ComponentsChanged and Localization/LocaleChanged. The host grants
`ui.dom` and `vault.access`. All access uses `ctx.use` and SDK events.

The screen renders `lunaris.workspace-header` and `lunaris.workspace-empty` through
Components. Registered content roles receive `{ ...props, workspace: { vaultId,
vaultName } }`. Owned child scopes release all old instances before a Vault switch;
registered descriptors remain available for the next Vault. Zero successful mounts
shows the placeholder, including missing or failed roles. Renderer replacement,
consumer removal, locale changes and external Vault transitions update the screen.

Tauri starts this plugin and hides the selector while a Vault is open. Closing
delegates to Vault and restores the selector only after a committed close. Failures
keep a retryable localized error; duplicate close requests are suppressed. Logger
records readiness, state transitions, missing roles and original failures without
paths, names or component props. Scope cleanup releases local resources and never
uses closed SDK/Logger handles.

Integration is complete with the content provider, selector, Mantine component set
and the existing public services. Explorer/editor/document plugins remain future
work. See the [Workspace reference](../../../../DOCS/reference/workspace.md) for
the content API, lifecycle, limits and manual acceptance. Run
`npm run workspace:check` and the Tauri frontend build.
