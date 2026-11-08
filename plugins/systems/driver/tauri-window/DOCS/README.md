# Tauri window driver

Purpose: adapt the public WindowDriver contract to Tauri's current window.
Requires Logger and `window.native`; provides WindowDriver and DriverWindowChanged.
The host registers this driver and a separate Window provider. Consumers do not
import this plugin. Tests inject NativeWindowPort through createTauriWindowDriver.

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
