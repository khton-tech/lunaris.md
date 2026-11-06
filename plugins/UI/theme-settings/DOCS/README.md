# Theme settings

Purpose: read startup theme preferences and select a registered theme through
public SDK contracts. Separate from the theme registry, theme engine and loading
screen. Provides no API/events and subscribes to no events.

`createThemeSettings({ defaultThemeId })` accepts host policy, never imports a
specific engine. Requires Logger, Config, Themes and the `config.access` grant.
Start the selected theme engine before this plugin. Tauri starts the base engine
first and supplies `lunaris.base-theme-engine.monochrome` as its default.

The plugin reads its effective namespace once during activation:

```toml
[plugins."lunaris.theme-settings"]
theme = "lunaris.base-theme-engine.monochrome"
```

An absent key uses the host default. An unavailable theme logs a warning and
tries that default. A non-string/empty preference, config read failure or unavailable
default fails activation and leaves recovery to the host. Stored preferences are
never rewritten. No config contents are logged. Restart to apply external edits.
Live theme changes still work through Themes and update mounted Components Kit
instances. Stopping this settings consumer does not undo the user's selection;
the theme registry/engine owns selected descriptions and their lifetime.

Integration: Config -> theme-settings -> Themes -> Components Kit via ThemeChanged.
Tauri starts settings before the runner. Neither runner nor kit selects themes.
Run `npm run theme-settings:check` for selection, fallback, failures, grants,
component theme tokens, base engine and host regressions.
