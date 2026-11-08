# Window provider

Purpose: platform-neutral window access through `@lunaris/window`. Requires Logger
and WindowDriver; consumes `window.control`. Provides Window and WindowChanged.
Use only `ctx.use(Window)` from consumers; replace the driver in host composition.

Methods and event payloads: [window reference](../../../../DOCS/reference/window.md).
This provider owns no UI, native APIs or persistence. It validates titles and
live chrome-owner signals, forwards operations and relays DriverWindowChanged.
The Tauri driver and titlebar are separate integration responsibilities.
