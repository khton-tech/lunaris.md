# Window contracts

Required: a replaceable window API and custom titlebar above every product screen.
Existing: SDK tokens/scopes, Slots/SlotDom, Components, Themes, Localization and
the host close/save gate. Missing: native-window contracts and platform driver.
`@lunaris/window` adds those contracts without changing the kernel or PluginContext.

## Public API

Declare Window (`api:lunaris.window@1.0.0`) and `window.control`, then use
`ctx.use(Window)`. `snapshot()` returns immutable title, focused/maximized state,
capabilities and monotonically increasing sequence. Subscribe to WindowChanged
before reading the snapshot. All other methods return Promise<WindowResult>:

- `setTitle(title)`: nonempty single-line string, at most 1024 characters.
- `minimize()`, `toggleMaximize()`, `startDragging()`: platform operations.
- `close()`: normal close request; success means requested, not that saves passed
  or the window was destroyed. The host's existing save gate remains authoritative.
- `acquireTitlebar(owner)`: exclusive, live-signal ownership. Mount usable controls
  before acquiring. Aborting the owner restores the original native decorations.
  Release ownership on renderer loss and before replacing a failed view.

Failures: INVALID_ARGUMENT, UNSUPPORTED, BUSY, CANCELLED, NATIVE_FAILED. SDK
permission, declaration and closed-scope violations retain normal SDK errors.
There is no destroy operation. Titles can contain document names and are not logged.

WindowDriver has the same methods, consumes `window.control`, requires
`window.native` to provide it, and emits DriverWindowChanged. The system provider
relays that event to WindowChanged and validates title/owner inputs. Consumers
must never import a driver, Tauri or host internals. Browser/mobile drivers may
advertise unsupported capabilities instead of rendering nonfunctional controls.

## Integration and acceptance

The Tauri driver uses normal close requests, preserving `bindWindowClose` and the
Vault/ActiveDocument save gate. Native decoration defaults remain enabled for
startup and recovery. The titlebar UI must acquire chrome only after mounting;
scope cancellation restores chrome through native cleanup without SDK calls.
Native resize and focus events refresh snapshots, as do title/maximize commands.
External title changes require a subsequent state refresh; no polling is used.

Targeted tests cover actions, state events, validation, exclusive ownership,
cancellation during acquisition, native errors, unsupported platforms and cleanup.
Native dragging, resizing, Windows snap behavior, theme appearance and save-blocked
closure require manual acceptance; desktop automation is prohibited.

Platform reference: [Tauri window customization](https://v2.tauri.app/learn/window-customization/)
and [Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/).
