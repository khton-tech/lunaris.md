# Base theme engine

Shared interaction geometry uses an 8-unit medium radius. The optional `motion`
domain supplies `fast: 120`, `normal: 200` (milliseconds) and
`easing: "cubic-bezier(0.2, 0, 0, 1)"`. Component sets apply these through Themes
and disable nonessential movement for reduced-motion preferences. Palette roles,
meaningful control boundaries and text contrast remain unchanged.

The Light and Dark descriptions also provide `components.startupScreen` tokens:
padding 32, gap 24, logo font size 10, logo line height 1.2 and status weight 500.
Dimensions use the existing geometry/font units. The shared component kit applies
these without importing the engine. Tauri's separate
[theme-settings plugin](../../plugins/UI/theme-settings/DOCS/README.md) reads the
startup preference and selects Dark by default; the engine itself never selects.

## Responsibilities

Required: supply Lunaris Light and Lunaris Dark with the Owner-approved palettes,
geometry and typography. Existing: the replaceable `Themes` SDK registry, owner
signals, Logger and host composition. New: `@lunaris/base-theme-engine` in
`plugins/UI/base-theme`. It imports only SDK, logging and theme contracts; no
SDK/kernel extension, platform access or new dependency is required.

The engine owns the two descriptions and their semantic schema. The generic
registry continues to know nothing about palettes or required tokens. Theme data
lives in `src/themes.ts`; `src/index.ts` handles registration and diagnostics.
The engine publishes no API/event and subscribes to no event. Consumers access
its descriptions through `ctx.use(Themes)`, not through implementation imports.

## Registered themes

| ID | Author-supplied name | Appearance |
|---|---|---|
| `lunaris.base-theme-engine.light` | Lunaris Light | `light` |
| `lunaris.base-theme-engine.dark` | Lunaris Dark | `dark` |

These names are product theme names specified by the Owner. UI controls and
messages remain the responsibility of future localized consumers.

Both descriptions have `properties.schema = "lunaris.base-theme"` and
`schemaVersion = 1`. This schema belongs to this engine; it is not a requirement
on other engines. Geometry and typography are shared in meaning across variants,
so consumers can switch palettes without changing their layout rules.

### Color roles

| `properties.colors` key | Lunaris Light | Lunaris Dark |
|---|---|---|
| `background` | `#F5F7FA` | `#11151C` |
| `panel` | `#EDF1F6` | `#181E28` |
| `content` | `#FFFFFF` | `#202938` |
| `text` | `#182536` | `#E6EBF2` |
| `textSecondary` | `#53657D` | `#A7B4C6` |
| `accent` | `#244A73` | `#C4E5FF` |
| `onAccent` | `#FFFFFF` | `#152536` |
| `selection` | `#DCE8F3` | `#223B52` |
| `separator` | `#D5DEE8` | `#303C4D` |
| `controlBorder` | `#73859B` | `#8295AF` |
| `hover` | `#E5ECF4` | `#29374A` |
| `accentHover` | `#1C3B5C` | `#D7EDFF` |
| `focus` | `#244A73` | `#C4E5FF` |

Use text/textSecondary on background, panel, content, hover and selection; use
onAccent on accent/accentHover. ControlBorder is the meaningful outline role;
separator is a subtle decorative divider and must not be the sole indication of
an interactive control or selected state. Focus is a high-contrast focus indicator
against the neutral/selection surfaces, not against a matching solid accent fill.
Consumers must choose their focus treatment according to adjacent colors.

Palette composition follows the researched principle of cool, lightly tinted
neutral surfaces with separate roles for states, borders and readable text:
[Radix palette composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette)
and [scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).
The actual colors are the project's own palette, not an imported Radix dependency.
Contrast tests use the WCAG relative-luminance calculation and require at least
4.5:1 for both text roles and onAccent on their documented surfaces, and 3:1 for
controlBorder/focus on neutral and selection surfaces. These are token-pair
checks, not a claim that future rendered components conform to every WCAG rule.
See [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

### Geometry and typography

`properties.geometry.unit` is `px`. Spacing supplies a step of 4 and a scale of
`[4, 8, 12, 16, 24]`. Small/medium radii are 4/8. Border width is 1, focus width is
2 and focus offset is 2. These are reusable component measurements, not fixed
panel dimensions. Consumers retain fluid layouts and respect
[the UI guidelines](../UI_GUIDELINES.md).

`properties.typography` supplies `fontFamily` as
`["Segoe UI", "system-ui", "sans-serif"]`, `monoFontFamily` as
`["ui-monospace", "Consolas", "monospace"]`, `fontSize: 14`,
`fontSizeUnit: "px"`, `lineHeight: 1.5`, and regular/medium/semibold weights
400/500/600. Font families are fallback stacks; no external font is downloaded.

## Lifecycle and composition

Activation registers both descriptions with `ctx.signal` and logs readiness.
Failed registration fails activation, preserving the original error/cause in
Logger. SDK activation rollback releases any earlier successful registration;
an existing registration owned by another plugin is never overwritten or removed.
Stopping the engine removes its two themes. If one was selected, the provider
clears selection and notifies remaining consumers. Restart registers fresh copies.
Cleanup contains no SDK calls or Logger calls in the engine.

Tauri registers and starts the engine as an entrypoint. Logger and the selected
theme provider start as required dependencies. Startup exposes both descriptions
but does not select a default or replace an existing selection. To select one,
call `themes.select("lunaris.base-theme-engine.dark")` or the corresponding light ID.
Selection persistence and selection UI remain separate responsibilities.

This milestone supplies portable design data. Future UI components consume it;
the engine neither mounts components nor writes CSS/DOM, changes slot geometry,
styles the host recovery shell or creates an application layout. Physical visual
acceptance belongs to the future consumers that apply these roles.

## Verification

Run `npm run base-theme:check` for actual SDK/provider integration, both palettes,
contrast thresholds, ownership, collision rollback/retry, provider restart, host
recovery, import boundaries and type fixtures. Run
`npm run build --workspace @lunaris/tauri` for the frontend bundle.

Local evidence, 2026-11-05: `npm run base-theme:check` passed 58 targeted tests
with zero skipped, including palette contrast checks, real SDK/provider lifecycle,
host recovery, types and import boundaries. CI scope-selection tests, the frontend
production build and the documentation/public-export audit passed. No native
window was launched; no physical WebView rendering is claimed.
