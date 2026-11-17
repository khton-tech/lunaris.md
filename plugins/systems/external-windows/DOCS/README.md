# External window manager

The manager provides `api:lunaris.external-windows@1.0.0` through
`@lunaris/window/external`. Consumers declare `window.external` and use
`ctx.use(ExternalWindows)`. A plugin can register a view through `Views` or
reuse a compatible registered component. Registering a view uses the existing
`ui.dom` grant.

`supported()` reports whether the active platform driver supports external
windows. `open(options, ctx.signal)` mounts the registered `componentId` with
its props into an undecorated native window. Options include a localized title,
a logical-pixel size and optional position, initial visibility, focusability,
always-on-top behavior and taskbar visibility. `open` shows the window after
mounting unless visibility was set to false.

The handle offers `update`, `show`, `hide`, `move`, `resize` and `close`.
`closed` resolves once on closure, whether initiated by the OS, caller or
activation cleanup. Closing releases the component and native surface. A live
activation can use a child scope for a shorter window lifetime.

The platform owns the window geometry and native lifecycle. The external shell
owns the mount area and includes the shared Mantine stylesheet. The component
owns its content and can request the standard standalone presentation through
its role's documented props. The manager uses Components, ExternalWindowDriver
and Logger. Tauri registers both provider and driver in the shared runtime, so
the public API is available to built-in and installed plugins with the same grants.
