# Base theme engine

Purpose: register the Monochrome preset selected by the Owner, replacing the
retired Lunaris Light/Dark palettes. Theme ID: `lunaris.base-theme-engine.monochrome`.
Requires Logger and `api:lunaris.themes@^1.0.0`; no permissions are needed.
Activation registers through ctx.use(Themes) with ctx.signal and logs through
ctx.use(Logger), using ctx.pluginId as source. The engine never selects a theme.
Stopping releases the registration. No callable APIs or event subscriptions.

Consumers use Themes and ThemeChanged through public SDK contracts. Components
Kit maps semantic colors to shared controls; theme-settings supplies startup
selection and falls back from unavailable saved IDs without rewriting config.
Extra error and colorful error colors are exposed for future consumers, with no
colorful-mode UI added. Geometry, typography and motion remain unchanged.

See [palette mappings and lifecycle](../../../../DOCS/reference/base-theme.md).
Run `npm run base-theme:check` from the repository root.
