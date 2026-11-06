# Workspace screen

Purpose: display the working surface for the committed active Vault after startup.
The plugin owns screen/content slots, component instances and empty-state placeholders.
There is no top Vault-name header or close action. It does not own document state, files, tabs or content
registration. Default export: `@lunaris/workspace-plugin`, ID `lunaris.workspace`.

Provides no callable APIs or events. Requires Logger, Workspace/WorkspaceChanged,
Vault/VaultChanged, Startup/StartupChanged, Slots, SlotDom,
Components/ComponentsChanged, Config and Localization/LocaleChanged. The host grants
`ui.dom`, `config.access` and `vault.access`. All access uses `ctx.use` and SDK events.

Shared side-panel geometry belongs to this screen. The Mantine layout uses
Splitter for pointer/keyboard resizing and preserves borrowed content targets.
The controller restores global `sidePanelWidth` at activation and serializes
committed pixel widths through Config. Width survives panel closure, Vault
replacement and restart. Failed reads/writes log recoverable degradation while
the panel stays adjustable. Narrow windows retain the bounded overlay behavior.

The screen renders `lunaris.workspace-empty` and `lunaris.workspace-layout` through
Components. Registered content roles receive `{ ...props, workspace: { vaultId,
vaultName } }`. Owned child scopes release all old instances before a Vault switch;
registered descriptors remain available for the next Vault. The placeholder appears
when main has no successful mounts, including missing or failed roles. Sidebar content
does not suppress it; failed side content receives a separate placeholder.
Workspace 1.1 regions provide main, left-rail and left-panel. The replaceable layout
role lends stable targets through its public callback contract; SDK-owned scopes
release content before using new targets after replacement. Narrow panels overlay
main within that layout. Workspace contains no Sidebar imports or tab state. Renderer replacement,
consumer removal, locale changes and external Vault transitions update the screen.

Tauri starts this plugin and hides the selector while a Vault is open. A committed
close through the public Vault service restores the selector. Workspace itself
exposes no Vault controls. Logger
records readiness, state transitions, missing roles and original failures without
paths, names or component props. Scope cleanup releases local resources and never
uses closed SDK/Logger handles.

Integration is complete with the content provider, selector, Mantine component set
and the existing public services. Explorer/editor/document plugins remain future
work. See the [Workspace reference](../../../../DOCS/reference/workspace.md) for
the content API, lifecycle, limits and manual acceptance. Run
`npm run workspace:check` and the Tauri frontend build.
