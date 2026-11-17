# External window manager

The manager provides `api:lunaris.external-windows@1.0.0` through
`@lunaris/window/external`. Consumers declare `window.external` and use
`ctx.use(ExternalWindows)`. A plugin can register a view through `Views` or
reuse a compatible registered component. Registering a view uses the existing
`ui.dom` grant.

`supported()` reports whether the active platform driver supports external
windows. `open(options, ctx.signal)` mounts the registered `componentId` with
its props into an undecorated native window. Options include a localized title,
a logical-pixel size, optional position and layer, initial visibility,
focusability and taskbar visibility. `open` shows the window after mounting
unless visibility was set to false.

For `position`, choose one of the eight anchors in the primary monitor's work
area. Each anchor aligns the corresponding corner or edge midpoint of the
whole window. The work area accounts for system UI such as the taskbar.

| Top edge | Middle of the sides | Bottom edge |
| --- | --- | --- |
| `top-left`, `top-center`, `top-right` | `center-left`, `center-right` | `bottom-left`, `bottom-center`, `bottom-right` |

`layer` accepts `bottom` (the native bottom level), `normal` (default), or `top`
(native always-on-top). For example, `position: "bottom-right", layer: "top"`
places a window at the lower-right corner of the work area and requests the top
level. An explicit `layer` supersedes the older `alwaysOnTop` option.

The handle offers `update`, `show`, `hide`, `move`, `resize` and `close`.
`move` accepts another anchor or explicit `{ x, y }` coordinates in logical
pixels. Explicit coordinates release the anchor. Tauri repositions anchored
windows when shown and on native size and scale changes.
An `{ anchor, offset: { x, y } }` position moves the window relative to its
anchor in signed logical pixels. Positive offsets move right and down. Offset
positions stay within the work area when the window fits.
`closed` resolves once on closure, whether initiated by the OS, caller or
activation cleanup. Closing releases the component and native surface. A live
activation can use a child scope for a shorter window lifetime.

The manager tracks both in-flight openings and attached surfaces. Shutdown
cancels the openings, waits for them to settle and closes surviving surfaces
before releasing the manager. A failed mount or show also closes the surface.

The platform owns the window geometry and native lifecycle. The external shell
owns the mount area and includes the shared Mantine stylesheet. The component
owns its content and can request the standard standalone presentation through
its role's documented props. The manager uses Components, ExternalWindowDriver
and Logger. Tauri registers both provider and driver in the shared runtime, so
the public API is available to built-in and installed plugins with the same grants.
