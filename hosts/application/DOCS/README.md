# Shared application host

`@lunaris/application-host` owns HostSession, recovery view, slot surface and shared
product composition for browser and Tauri. Platform plugins are supplied only by
trusted host composition. Product plugins communicate through public SDK contracts.
The Tauri session/slots modules re-export this runtime for compatibility.

The browser uses an IndexedDB device-config backend and the remote backend. Tauri
supplies the native backend in backendOnly mode and IndexedDB for drafts only.
Filesystem Router is the sole standard driver provider in both compositions.
Local app config remains independent from account authorization and remote roots.

Both hosts compose account access, Vault/Config/History, Workspace, Sidebar,
Explorer, ActiveDocument/ActiveScreen, Editor, Settings, Themes and Localization.
The optional editor/files/settings feature profile controls those UI entrypoints;
SDK dependency validation remains the kernel's responsibility. Host grants are
filtered to registered plugins. Platform extensions declare their own grants.

The host owns viewport and recovery geometry. Mantine roles own product surfaces;
embedded views preserve their containers. Recovery is host-owned and remains
available when product services fail.

Callouts are enabled alongside the editor through the independent
`@lunaris/callouts` plugin with `ui.dom`. It consumes EditorExtensions provided by
Text Editor, so dependency startup orders the editor before the contribution.
The existing Mantine component set supplies `lunaris.callout-header`. Web and
desktop share this composition; a feature set without editor omits both plugins.
See [usage and integration](../../../plugins/UI/callouts/DOCS/README.md).
