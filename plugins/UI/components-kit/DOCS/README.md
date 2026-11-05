# LunarisComponentsKit

Purpose: supply shared product UI components through the replaceable Components
registry. Roles are `lunaris.startup-screen` and `lunaris.vault-selector`. The kit does not allocate
slots, select themes, read configuration, load artwork, translate consumer copy,
or decide whether startup is complete.

Requires Logger, `api:lunaris.components@^1.0.0`,
`api:lunaris.themes@^1.0.0`, `event:lunaris.theme-changed@^1.0.0`, and `ui.dom`.
It provides no direct API or SDK events. On activation it registers its component
roles through Components; on scope closure those registrations and live instances
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

## Vault selector role

Mount `lunaris.vault-selector` through Components. Its complete props are:

- `art`: ASCII text; `text`: localized string map with `logo`, `recent`, `empty`,
  `create`, `select`, `folder`, `folderPlaceholder`, `browse`, `name`, `next`, `retry`.
- `mode`: `null`, `create`, or `select`; `folder`/`name`: strings;
  `busy`/`canContinue`: booleans; `error`/`historyError`/`status`: localized strings.
- `entries`: `{ reference, name, label }[]`; references are opaque callback data.
- Callbacks: `onMode(mode)`, `onName(value)`, `onBrowse()`, `onNext()`,
  `onRecent(reference)`, `onRetry()`.

The component renders only; selection, names, validation policy and history belong
to the consuming controller. Updates preserve input DOM/caret where possible.
Controls provide labels, expanded-state/form associations, accessible icon-only
Browse, keyboard focus restoration, status/alert regions, and reduced motion.
Non-editable chrome is non-selectable; inputs retain selection. All text uses
`textContent`, including external folder names and ASCII art.

The initial icon pack is **Lucide**, pinned to `lucide@1.69.0`. Only required icon
nodes are imported in `controls.ts` and rendered in the borrowed document; no
global icon scan or document access occurs. Shared button/input/icon factories
live in the kit, not in the consumer.

The left recent panel and right action panel use a 1:2 grid, stacking actions
first below a 40rem container width. The frame uses container queries; all content
can shrink/wrap, and ASCII type scales with its available width. Selector colors
inherit `colors.background/panel/text/textSecondary/separator/controlBorder/hover/
focus/accent/onAccent/accentHover`; geometry inherits `unit`, `spacing.step`,
`radius.medium`, `borderWidth`, `focusWidth` and `focusOffset`. Typography inherits
the same generic properties as the startup screen. No theme engine is imported.

## Startup theme and layout

Reads `Themes.current()` through the public SDK contract and follows
ThemeChanged. Compatible engines supply these optional properties:

- `colors.background`, `colors.text`, `colors.textSecondary`: CSS colors.
- `geometry.unit`, `geometry.spacing.step`: measurement unit and nonnegative step.
  Padding uses four steps and gap uses three steps.
- `typography.fontFamily`, `typography.monoFontFamily`: strings or string arrays;
  `fontSize`, `fontSizeUnit`, and numeric `lineHeight`.
- `components.startupScreen`: optional `padding`, `gap` (geometry units),
  `logoFontSize` (font-size units), `logoLineHeight`, and `statusFontWeight`.
  These override the generic spacing/typography where present.

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
consumer requests the role; the [runner](../../lunaris-runner/DOCS/README.md)
supplies artwork, localized milestone text and a slot after reading its startup
configuration. The [Vault selector](../../vault-selector/DOCS/README.md) consumes
the selector role after loading and owns all actions/state. The rest of the
standard component catalog is outside this initial kit.

Run `npm run components-kit:check`. Tests use the real SDK/kernel, Components,
Themes and JSDOM to verify role mounting, safe text, theme selection/update/reset,
invalid props, accessible Lucide controls, input identity, multiple selector
instances, owner cancellation, shutdown and restart. Native WebView appearance
and narrow-window layout remain manual acceptance checks.
