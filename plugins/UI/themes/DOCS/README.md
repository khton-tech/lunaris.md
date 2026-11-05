# Theme provider

Purpose: expose engine-owned theme descriptions through a replaceable, portable
SDK registry. Provides `api:lunaris.themes@1.0.0` with `register`, `update`, `get`,
`list`, `current`, and `select`, plus `event:lunaris.theme-changed@1.0.0` for
registration, update, selection and removal. Requires Logger; no permissions or
platform services are required. The plugin subscribes to no SDK events.

Engines import `Themes` from `@lunaris/themes`, register their description and a
live owner signal, and supply all geometry, color, typography and custom data.
Updates replace the immutable description without changing ownership. Cancelling
the owner removes it and clears selection when active. Consumers obtain snapshots
and subscribe through `ctx.events.on(ThemeChanged, handler)`.

No themes, palettes, token defaults, rendering rules or automatic selection are
included. Startup is empty; the actual engine is a separate plugin.
See [the full contract and lifecycle rules](../../../../DOCS/reference/themes.md).
Run `npm run themes:check` from the repository root.
