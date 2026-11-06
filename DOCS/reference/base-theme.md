# Base theme engine

## Responsibilities and SDK integration

The engine registers the Owner-selected Monochrome palette in the replaceable
Themes registry. It replaces the retired Lunaris Light and Lunaris Dark palettes.
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

## Composition and saved preferences

Tauri starts the engine before theme-settings and supplies the Monochrome ID as
the default. Saved retired Light/Dark IDs follow the settings plugin's existing
unavailable-theme fallback with a warning; saved configuration is not rewritten.
Themes/ThemeChanged carry selected data to Mantine components. Runner and Vault
selector continue mounting roles through Components without importing the engine.
Native window and HTML first-paint backgrounds match #0F0F0F; the boot text matches
#E7E7E7. Host recovery UI remains independent.

## Verification

Run `npm run base-theme:check` and `npm run mantine-components:check` for palette,
contrast, lifecycle and component checks. Settings, runner and selector tests
cover startup fallback and live replacement with an independent theme fixture.
Native WebView visual acceptance is manual; desktop automation is prohibited.
