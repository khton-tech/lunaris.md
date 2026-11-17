# Tauri window driver

Purpose: adapt the public WindowDriver contract to Tauri's current window.
Requires Logger and `window.native`; provides WindowDriver and DriverWindowChanged.
The host registers this driver and a separate Window provider. Consumers do not
import this plugin. Tests inject NativeWindowPort through createTauriWindowDriver.

The driver also provides `ExternalWindowDriver` to the external window manager.
It opens an empty owned native window, supplies its local mount target, and
serializes show, hide, move, resize and close operations. A native close or
caller cancellation releases the window and its surface lifetime. See
[External native windows](../../../../../DOCS/reference/external-windows.md).

The native host resolves anchors from the primary monitor's physical work area
and the window's measured outer dimensions. An anchored position can also carry
a signed offset in logical pixels. The host applies it at the primary monitor's
scale and keeps the position within its work area. It applies the requested
layer through Tauri's native window stacking options at creation.

On Windows, `focusable: false` creates a passive window. Show, hide and move
use Win32 positioning with `SWP_NOACTIVATE` and preserve the existing z-order.
The passive window rejects mouse and pointer activation while still receiving
those inputs. The driver uses SDK resize for passive windows. Close cancels a
pending open and hides an existing window before acknowledging destruction.

Methods, event payloads and lifecycle: [window reference](../../../../../DOCS/reference/window.md).
Native listeners are scope-owned. Decoration changes are serialized; exclusive
titlebar cancellation restores the original decoration state. Cleanup uses only
native resources and reports failures through independent kernel diagnostics.
Outside Tauri all capabilities are false and operations return UNSUPPORTED.
Native close uses close(), never destroy(), preserving the host document-save gate.

State reads are serialized and unchanged snapshots do not emit events. Event
delivery does not block the native queue: consumers may await another window
operation from a change handler. Shutdown-related dispatch rejection is ignored;
real publication failures are logged. Restoration still runs if a pending chrome
hide rejects while its owner is being cancelled. Targeted regressions cover these
cases, including commands issued from event handlers followed by immediate stop.
