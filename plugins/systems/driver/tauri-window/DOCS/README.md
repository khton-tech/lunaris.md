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
