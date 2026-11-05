# Base theme engine

Both descriptions include optional `motion.fast/normal/easing` tokens (120ms,
200ms, and `cubic-bezier(0.2, 0, 0, 1)`) and an 8-unit medium radius. Component
sets consume them through Themes and respect reduced-motion preferences; this
plugin performs no animation itself. Existing semantic palette roles are preserved.

Purpose: register Lunaris Light and Lunaris Dark, including the agreed colors,
geometry and typography, in the replaceable theme provider. Requires Logger and
`api:lunaris.themes@^1.0.0`; no permissions are needed. Activation uses
`ctx.use(Themes).register(description, ctx.signal)` for both themes and logs
readiness/failure through `ctx.use(Logger)` with `ctx.pluginId` as source.

There are no callable API methods or SDK event subscriptions in this plugin.
Consumers declare the shared Themes API and use `list`, `get`, `current`, `select`
and the provider's ThemeChanged event. Stable theme IDs are
`lunaris.base-theme-engine.light` and `lunaris.base-theme-engine.dark`.

Stopping/failed activation releases owned registrations. Registration preserves
the existing selection; the engine never selects a default. It supplies portable
data rather than rendering components or modifying host styles.

See [schema, palettes, roles and lifecycle](../../../../DOCS/reference/base-theme.md).
Run `npm run base-theme:check` from the repository root.
