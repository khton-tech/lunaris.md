# External native windows

See the [external window manager guide](../../plugins/systems/external-windows/DOCS/README.md)
for the public contract, ownership and operations. Import `ExternalWindows` from
`@lunaris/window/external`. Declare `api:lunaris.external-windows@^1.0.0`
and the `window.external` permission. Cross-platform plugins can use an optional
requirement and check `ctx.optional(ExternalWindows)?.supported()`.

Tauri opens a separate WebView in the main WebView's environment through a
single-use local launch request. The application session mounts the view against
the new document through Components. The child shell has its own document and
shared styles. Native IPC for window management is scoped to the main WebView.
An external window can be owned by a Vault plugin activation, so closing the
Vault also closes that activation's windows.

Native acceptance requires an actual Windows WebView. Once a consumer is
connected, verify framing, independent resize and positioning, focus, keyboard
interaction, theme rendering, closure and release when the consumer is disabled.
