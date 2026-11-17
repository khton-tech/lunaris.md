# External native windows

See the [external window manager guide](../../plugins/systems/external-windows/DOCS/README.md)
for the public contract, ownership and operations. Import `ExternalWindows` from
`@lunaris/window/external`. Declare `api:lunaris.external-windows@^1.0.0`
and the `window.external` permission. Cross-platform plugins can use an optional
requirement and check `ctx.optional(ExternalWindows)?.supported()`.

Plugins can choose an edge or corner through `position` and a native stacking
level through `layer`. The primary monitor's work area supplies the bounds for
named positions. Windows maps the bottom level to its native window stacking
policy, with ordering subject to the OS. See the [Tao window API](https://docs.rs/tao/0.37.2/tao/window/struct.Window.html#method.set_always_on_bottom).

Tauri opens a separate WebView in the main WebView's environment through a
single-use local launch request. The application session mounts the view against
the new document through Components. The child shell has its own document and
shared styles. Native IPC for window management is scoped to the main WebView.
An external window can be owned by a Vault plugin activation, so closing the
Vault also closes that activation's windows.

Native acceptance requires an actual Windows WebView. Use the
[Pong package](../../examples/pong-notification/DOCS/README.md) for the
bottom-right case via the notification provider. Independently verify framing,
all eight work-area anchors, resize while anchored,
and all three stacking levels against another application. Verify focus,
keyboard interaction, theme rendering, closure and release on consumer disable.
