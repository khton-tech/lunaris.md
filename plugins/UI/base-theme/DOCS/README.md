# Base theme engine

Purpose: register Monochrome and experimental Windows XP Luna. Theme IDs:
`lunaris.base-theme-engine.monochrome` and `lunaris.base-theme-engine.windows-xp`.
Requires Logger and `api:lunaris.themes@^1.0.0`; no permissions are needed.
Activation registers through ctx.use(Themes) with ctx.signal and logs through
ctx.use(Logger), using ctx.pluginId as source. The engine never selects a theme.
Stopping releases the registration. No callable APIs or event subscriptions.

Consumers use Themes and ThemeChanged through public SDK contracts.
Mantine maps semantic colors to shared controls; theme-settings supplies startup
selection and falls back from unavailable saved IDs without rewriting config.
Extra error and colorful error colors are exposed for future consumers, with no
colorful-mode UI added. Monochrome geometry, typography and motion remain unchanged.

On this branch Tauri defaults to Luna, using gray panels, blue window captions, Tahoma
and optional control finishes interpreted by Mantine. Saved startup and Vault
preferences still take priority; select Windows XP Luna under Customization
for an existing Vault. Monochrome remains available for comparison.
Themes/ThemeChanged connect Mantine and the editor; interface-settings exposes
both presets. Existing public SDK contracts are sufficient. WorkspaceLayout
retains layout/surface ownership; embedded views inherit their assigned surface.
The Owner's second reference (XP Paint) defines the revised chrome. No OS desktop
or window-management behavior is supplied. Native visual acceptance remains pending; see the reference for manual checks.

See [palette mappings and lifecycle](../../../../DOCS/reference/base-theme.md).
Run `npm run base-theme:check` from the repository root.
