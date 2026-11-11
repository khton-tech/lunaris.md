# Base theme engine

Maiami Night (`lunaris.base-theme-engine.maiami-night`) transcribes the Owner's
reference palette. It uses the existing Themes/ThemeChanged contracts for
Interface Settings, Mantine and the editor; no additional integration is needed.
The engine owns palette data only; containers retain geometry and surface ownership.
See the reference for color mappings and pending manual visual acceptance.

Purpose: register the built-in theme catalog. Theme IDs:
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

The desktop and browser hosts default to Monochrome
(`lunaris.base-theme-engine.monochrome`) at startup and in Vaults without a saved
theme. The Lunaris preset uses the palette and typography from the FigCraft
redesign. Optional Windows XP Luna uses gray panels, blue window captions,
Tahoma and control finishes interpreted by Mantine. Saved startup and Vault
preferences take priority.
Themes/ThemeChanged connect Mantine and the editor; interface-settings exposes
both presets. Existing public SDK contracts are sufficient. WorkspaceLayout
retains layout/surface ownership; embedded views inherit their assigned surface.

The Owner's Everforest Workspace screenshot showed accent-colored dividers
around the Files panel, its tree and the status bar. Community palettes now
provide subdued separator colors for these decorative joins. Everforest keeps
its green accent for selection and uses a neutral control border with sufficient
contrast for controls such as task checkboxes. Existing theme IDs preserve saved
selections and Themes/ThemeChanged deliver the palette to the same consumers.

The Owner's second reference (XP Paint) defines the revised chrome. No OS desktop
or window-management behavior is supplied. Native visual acceptance remains pending; see the reference for manual checks.

See [palette mappings and lifecycle](../../../../DOCS/reference/base-theme.md).
Run `npm run base-theme:check` from the repository root.

Windows XP Luna Dark (`lunaris.base-theme-engine.windows-xp-dark`) adds a third
independent preset with dark slate surfaces, readable light labels and blue XP
captions. It shares Luna typography, geometry and existing public theme contracts.
Interface Settings exposes it automatically; Mantine and CodeMirror consume its
tokens through Themes/ThemeChanged. Integration through these contracts is
complete; native visual acceptance is pending. See the reference for the palette.

The engine also registers Catppuccin Mocha, Dracula, Nord, Tokyo Night, Rosé Pine,
Gruvbox Dark and Everforest Dark palette adaptations, plus the original Lunaris
Sakura Night palette. They use the same `lunaris.base-theme` v1 contract and are
available immediately in Interface Settings; no UI or SDK changes are needed.
Community palette references: [Catppuccin](https://catppuccin.com/),
[Dracula](https://draculatheme.com/), [Nord](https://www.nordtheme.com/),
[Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme),
[Rosé Pine](https://rosepinetheme.com/), [Gruvbox](https://github.com/morhetz/gruvbox),
and [Everforest](https://github.com/sainnhe/everforest). Sakura Night is an
original palette with plum-charcoal surfaces and sakura pink accents.
