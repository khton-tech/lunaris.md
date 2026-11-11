# Base theme engine

## Maiami Night

`lunaris.base-theme-engine.maiami-night` uses the Owner's supplied screenshot,
with the requested display name Maiami Night and the shared dark v1 schema.

| Reference role | Hex | Semantic mapping |
|---|---|---|
| background | #18181A | background, content, onAccent |
| main | #E4609B | main, accent, accentHover, focus |
| sub | #47BAC0 | sub, textSecondary, controlBorder |
| text | #FFFFFF | text |
| caret | #E4609B | caret |
| sub alt | #0F0F10 | subAlt, panel |
| error / colorful error | #FFF591 | error, colorfulError |
| extra error / colorful extra error | #B6AF68 | extraError, colorfulExtraError |

Hover (#292327), selection (#40303B) and the separator (#343038) are restrained
derived colors.
Dark primary labels preserve contrast against the pink accent. Existing geometry,
typography and motion are reused. This adapts the palette rather than the reference
page layout. The engine registers data through Themes; Interface Settings lists
it automatically, and Mantine and the editor receive ThemeChanged. No SDK changes
or additional plugin connections are required. Container surface ownership remains
unchanged. Native visual acceptance is pending: select Maiami Night in Workspace
and check panels, editor, opened menus, hover/selection/focus and narrow/short sizes.

## Responsibilities and SDK integration

The engine registers Monochrome and experimental Windows XP Luna in the replaceable
Themes registry. The retired Lunaris Light and Lunaris Dark palettes stay absent.
The engine requires Logger and Themes through the SDK, owns its registration with
ctx.signal, and never selects a theme or renders UI. It provides no API or events
and subscribes to none. Registration failure is logged with the original error;
stopping releases the owned description. Other engines and providers remain replaceable.

## Preset and source colors

ID: `lunaris.base-theme-engine.monochrome`; display name: Monochrome;
appearance: dark. The existing `lunaris.base-theme` schema version 1 remains
compatible with Mantine components. Colors are transcribed from the Owner's reference.

| Reference role | Hex | Shared component mapping |
|---|---|---|
| background | #0F0F0F | background, onAccent |
| main | #E7E7E7 | accent, controlBorder |
| text | #E7E7E7 | text, textSecondary |
| sub | #4C4C4C | sub, separator, hover, selection |
| caret | #F5F5F5 | caret, focus, accentHover |
| sub alt | #1A1A1A | subAlt, panel, content |
| error | #AC8C8C | error |
| extra error | #C49EA0 | extraError |
| colorful error | #ACA98A | colorfulError |
| colorful extra error | #C4C19E | colorfulExtraError |

The reference sub color is decorative, not a readable small-text role. Secondary
labels use the text color; typography and spacing provide hierarchy. Selector
artwork uses text for a readable logo, editable fields use caret, and alerts use error. Extra error and
colorful variants are available as data for future consumers; no colorful-mode
setting or theme editor is introduced. Selection uses sub with readable text.

## Measurements

Geometry uses px, spacing step 4 and scale [4, 8, 12, 16, 24], radii 4/8,
border width 1, focus width 2 and offset 2. Typography retains Segoe UI/system-ui,
monospace fallbacks, 14px text, line-height 1.5 and weights 400/500/600.
Motion is 120/200ms with cubic-bezier(0.2, 0, 0, 1). Startup tokens retain padding
32, gap 24, logo size 10, logo line-height 1.2 and status weight 500.
The palette change does not change layout or typography.

## Experimental Windows XP Luna

ID: `lunaris.base-theme-engine.windows-xp`; name: Windows XP Luna; appearance:
light; schema: lunaris.base-theme version 1. The reference is Windows XP's blue
Luna controls, gray Paint tool surfaces and Tahoma typography. The Owner's
second screenshot (XP desktop with Paint) supersedes the earlier palette-only
interpretation. This adapts the
reference to existing Lunaris roles: Lucide icons, supporting-region cards and
the open editor workspace retain their existing composition and interaction.

Luna uses #FFFFFF background/content, #C0C0C0 panels, #1A1A1A text, #333333
secondary text, #245EDB accent, #FFFFFF on-accent, #D4E3FC selection,
#E5EFFF hover, #003C74 focus and #555555 control borders. Selection stays pale
to retain semantic text contrast. Typography is 13px Tahoma/Segoe UI/sans-serif,
radii are 0/2px and motion is 80/140ms. Other measurements reuse Monochrome.

Optional components.controls properties supply CSS background images for
buttonBackground/buttonHoverBackground/buttonPressedBackground and
primaryBackground/primaryHoverBackground/primaryPressedBackground, a CSS color
for buttonBorder and CSS box shadows for buttonShadow/inputShadow. Mantine
maps these only to controls, excluding card rows. Missing tokens preserve the
flat appearance; theme replacement removes old finishes. Disabled buttons
have no gradients or shadows. No new SDK contract or provider is required.

Optional components.windowChrome contains enabled (boolean), captionBackground
(CSS background), captionText/frameColor/menuBorder (CSS colors) and
surfaceShadow/insetShadow (CSS box shadows). Only enabled: true opts in.
WorkspaceLayout owns the blue outer frame, compact grid and caption using the
existing localized mainLabel. It adds no inactive window-operation buttons.
Supporting regions retain stable borrowed targets; main remains an open white
workspace. Each embedded role styles only its own headings, controls and local
content. Settings supplies a blue section title, compact white fields and a
right-hand picker button; menus retain Mantine interaction with beveled edges.
No OS desktop, wallpaper, taskbar or window-management API is introduced.
These remain intentional differences from the reference. Root-scoped explicit
Mantine font variables keep headings and controls on Tahoma/system fallbacks.
Switching to Monochrome removes the caption/frame and all chrome tokens.

WorkspaceLayout owns region geometry and rail/panel surfaces; embedded Sidebar,
Explorer and Settings content inherit them. The engine only registers data.
Mantine, the editor and interface-settings integrate through Themes/ThemeChanged
and the existing selection contract. No controller or ownership changes are needed.

## Composition and saved preferences

### Community palette adaptations

The base engine additionally registers seven community palette adaptations and
one original Lunaris palette. All use schema `lunaris.base-theme` version 1,
the existing shared geometry, typography and motion, and dark appearance. Each
theme is available through the existing Interface Settings selector.

| Theme | ID suffix | Palette reference |
|---|---|---|
| Catppuccin Mocha | `catppuccin-mocha` | [Catppuccin](https://catppuccin.com/) |
| Dracula | `dracula` | [Dracula](https://draculatheme.com/) |
| Nord | `nord` | [Nord](https://www.nordtheme.com/) |
| Tokyo Night | `tokyo-night` | [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme) |
| Rosé Pine | `rose-pine` | [Rosé Pine](https://rosepinetheme.com/) |
| Gruvbox Dark | `gruvbox-dark` | [Gruvbox](https://github.com/morhetz/gruvbox) |
| Everforest Dark | `everforest-dark` | [Everforest](https://github.com/sainnhe/everforest) |
| Sakura Night | `sakura-night` | Original Lunaris palette |

The seven community themes use adapted semantic roles from their named palettes;
the repository does not bundle upstream theme packages or code. Sakura Night is
an original plum-charcoal palette with pink accents. All palettes are checked
against the existing text, control-boundary, focus and primary-label contrast
requirements. Layout, container surfaces and component ownership do not change.

The existing selector obtains author-supplied names from Themes, so no separate
selector/UI integration is needed. Vault-local theme values continue to use the
existing IDs; each newly chosen theme is saved by the same controller.

### Windows XP Luna Dark

`lunaris.base-theme-engine.windows-xp-dark` (Windows XP Luna Dark) is an independent
dark preset using the same schema, Tahoma, compact geometry and motion as Luna.
It retains blue gradient captions and beveled controls. Dark slate page/content
surfaces (#181C24/#1C212B), #282E3A panels, #F0F2F7 text, #D0D7E2 secondary
text, #94A4BE input borders and #B5D3FF focus replace the light palette. Hover and
selection use #323D50/#304566; blue primary controls retain white labels.
Dark shadows and highlights replace every light control and chrome finish.
Optional `colors.link` supplies readable links independently of primary-button
accent; Mantine anchors and CodeMirror use it with an accent fallback. Luna Dark
sets #91BCFF, while both primary blue fills retain white text.
Select it through the existing Interface Settings theme picker; Config persists
its independent ID. No new provider, API or plugin dependency is introduced.
Themes/ThemeChanged already connect the engine, Mantine and CodeMirror.
Contrast tests cover text, secondary text, borders, focus and primary labels.
Native visual acceptance inside Workspace remains pending for both Luna variants.

The shared browser and desktop composition starts the engine before theme-settings
and supplies Monochrome as the startup and Vault default. Windows XP Luna
remains available as an optional preset. Saved startup and Vault preferences take priority;
choose Windows XP Luna under Settings > Customization for an existing Vault.
Saved retired Light/Dark IDs follow the settings plugin's existing
unavailable-theme fallback with a warning; saved configuration is not rewritten.
Themes/ThemeChanged carry selected data to Mantine components. Runner and Vault
selector continue mounting roles through Components without importing the engine.
Native window and HTML first-paint backgrounds match #0F0F0F; boot text uses
#E7E7E7. Host recovery UI remains independent.

## Verification

Run `npm run base-theme:check` and `npm run mantine-components:check` for palette,
contrast, lifecycle and component checks. Settings, runner and selector tests
cover startup fallback and live replacement with an independent theme fixture.
Native WebView visual acceptance is manual; desktop automation is prohibited.
Run `npm run tauri:dev` and compare both themes inside Workspace: startup/Vault
selection, Explorer/Settings, opened theme and context menus, button hover/press/
disabled states, keyboard focus, editor/task checkboxes, long labels and narrow/
short windows. Check inherited panel backgrounds and removal of finishes when
switching back. These visual checks remain pending; passing automated tests
does not establish visual acceptance.
