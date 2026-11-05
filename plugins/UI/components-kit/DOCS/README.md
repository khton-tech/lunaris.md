# LunarisComponentsKit

Purpose: supply shared product UI components through the replaceable Components
registry. The initial role is `lunaris.startup-screen`. The kit does not allocate
slots, select themes, read configuration, load artwork, translate consumer copy,
or decide whether startup is complete.

Requires Logger, `api:lunaris.components@^1.0.0`,
`api:lunaris.themes@^1.0.0`, `event:lunaris.theme-changed@^1.0.0`, and `ui.dom`.
It provides no direct API or SDK events. On activation it registers its component
role through Components; on scope closure that registration and live instances
are released. It subscribes to ThemeChanged and reapplies the current theme.

## Consumer usage

Require Components and obtain `ui.dom`. Mount by role, without importing this kit:

```ts
const result = components.mount("lunaris.startup-screen", target, {
  art: startupArtwork,
  logoLabel: "Lunaris",
  status: localizedStatus,
  detail: localizedStage,
}, ctx.signal);
```

`art`, `logoLabel`, and `status` are required strings. `detail` is an optional
string, hidden when empty. Consumers localize all accessible/user-facing text
and own updates through the returned component handle. The ASCII art is text,
not HTML; its accessible image name comes from `logoLabel`. Status uses a polite,
atomic live region. Invalid props fail without overwriting the current content.

The consumer supplies a target from SlotDom. Only kit-owned descendants are
modified/removed; sibling content and slot structural styles are preserved.
Consumers must handle missing/replaced roles through ComponentsChanged as
specified by [the component contract](../../../../DOCS/reference/components.md).

## Theme and layout

Reads `Themes.current()` through the public SDK contract and follows
ThemeChanged. Compatible engines supply these optional properties:

- `colors.background`, `colors.text`, `colors.textSecondary`: CSS colors.
- `geometry.unit`, `geometry.spacing.step`: measurement unit and nonnegative step.
  Padding uses four steps and gap uses three steps.
- `typography.fontFamily`, `typography.monoFontFamily`: strings or string arrays;
  `fontSize`, `fontSizeUnit`, and numeric `lineHeight`.

No specific engine or palette is imported. Missing properties inherit the surface
or browser typography, with transparent background, zero theme spacing and
semantic monospace for art. Clearing selection resets the previous theme.
An unselected theme is logged as degraded rendering; the kit never selects a
theme on the consumer's behalf. Theme selection/persistence belong to startup
configuration and future settings UI.

The screen uses shrinkable flex content, safe centering and overflow containment;
long copy wraps, and wide art preserves its whitespace with local scrolling.
There are no fixed panel dimensions, animations, spinners or invented progress
percentages. Readiness, rejected rendering, original failures and missing themes
use Logger; cleanup makes no SDK calls.

## Integration and verification

Tauri starts the kit after the component provider and grants `ui.dom`. Theme
changes are integrated through the public contract. Nothing is mounted until a
consumer requests the role; the runner will supply artwork, localized milestone
text and a slot after reading its startup configuration. The rest of the standard
component catalog is outside this initial kit.

Run `npm run components-kit:check`. Tests use the real SDK/kernel, Components,
Themes and JSDOM to verify role mounting, safe text, theme selection/update/reset,
invalid props, owner cancellation, shutdown and restart. A native WebView visual
check at narrow window sizes remains manual after the runner is connected.
