# Base theme engine

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
Luna controls, cream dialog surfaces and Tahoma typography. This adapts the
reference to existing Lunaris roles: Lucide icons, supporting-region cards and
the open editor workspace retain their existing composition and interaction.

Luna uses #FFFFFF background/content, #ECE9D8 panels, #1A1A1A text, #444444
secondary text, #245EDB accent, #FFFFFF on-accent, #D4E3FC selection,
#E5EFFF hover, #003C74 focus and #716F64 control borders. Selection stays pale
to retain semantic text contrast. Typography is 13px Tahoma/Segoe UI/sans-serif,
radii are 3/4px and motion is 80/140ms. Other measurements reuse Monochrome.

Optional components.controls properties supply CSS background images for
buttonBackground/buttonHoverBackground/buttonPressedBackground and
primaryBackground/primaryHoverBackground/primaryPressedBackground, a CSS color
for buttonBorder and CSS box shadows for buttonShadow/inputShadow. Mantine
maps these only to controls, excluding card rows. Missing tokens preserve the
flat appearance; theme replacement removes old finishes. Disabled buttons
have no gradients or shadows. No new SDK contract or provider is required.

WorkspaceLayout owns region geometry and rail/panel surfaces; embedded Sidebar,
Explorer and Settings content inherit them. The engine only registers data.
Mantine, the editor and interface-settings integrate through Themes/ThemeChanged
and the existing selection contract. No controller or ownership changes are needed.

## Composition and saved preferences

Tauri starts the engine before theme-settings and supplies the Luna ID as
the experimental default. Saved startup and Vault preferences take priority;
choose Windows XP Luna under Settings > Customization for an existing Vault.
Saved retired Light/Dark IDs follow the settings plugin's existing
unavailable-theme fallback with a warning; saved configuration is not rewritten.
Themes/ThemeChanged carry selected data to Mantine components. Runner and Vault
selector continue mounting roles through Components without importing the engine.
Native window and HTML first-paint backgrounds match #FFFFFF; boot text uses
#1A1A1A. Host recovery UI remains independent.

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
