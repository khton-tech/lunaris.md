# LunarisComponentsKit (retired default)

This implementation is retained for reference and optional legacy checks. Tauri
no longer registers or starts it. New UI belongs in the
[Mantine component plugin](../../mantine-components/DOCS/README.md). Do not activate
both plugins for the same component roles.

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
- Optional `activeReference`: current location reference or null; the matching
  recent entry exposes `aria-current` independently of transient hover.
- Callbacks: `onMode(mode)`, `onName(value)`, `onBrowse()`, `onNext()`,
  `onRecent(reference)`, `onRetry()`.

The component renders only; selection, names, validation policy and history belong
to the consuming controller. Updates preserve input DOM/caret where possible.
Controls provide labels, expanded-state/form associations, accessible icon-only
Browse, keyboard focus restoration, status/alert regions, and reduced motion.
Non-editable chrome is non-selectable; inputs retain selection. All text uses
`textContent`, including external folder names and ASCII art.

Display-only folder labels are text, not read-only inputs; Browse is their only
interactive control and has one boundary focus treatment. Pointer expansion does
not move focus into the form; keyboard expansion does. Disclosure uses intrinsic
grid-track transitions in both directions, with immediately inert/ARIA-hidden
closed forms, retained input nodes/drafts and no animation timers. Its anchored
layout centers the resting logo/action composition vertically in the wide panel.
A document-local ResizeObserver measures available space and content minus live
disclosure heights, reserving the largest intrinsic form height before expansion.
The center offset is limited by the space remaining after that reservation, so
centering cannot cause otherwise fitting content to overflow. Main/content/form
size changes recalculate it; disclosure motion does not move the logo. There are
no fixed form heights or timers. Content that cannot fit remains scrollable.
Narrow layouts use normal document flow; environments without ResizeObserver
retain the padded flow layout. The observer disconnects on disposal.

The selector frame is a size query container. Below 44rem of available height,
panel padding, logo spacing, action padding and form gaps become compact; empty
status space collapses. Below 40rem of width, actions precede recents in a single
flow with one outer overflow region. Wide layouts constrain grid tracks and give
each panel its own overflow region, so long recent history cannot enlarge the
whole application. Text and input sizes remain readable rather than scaling the UI.

Shared `ln-surface` styles in `surface-style.ts` suppress native scrollbar chrome
on startup and selector-owned DOM, including descendants. Overflow remains usable
with wheel, touch and keyboard. The host applies the same rule globally, including
slot targets and recovery surfaces; no consumer modifies a borrowed slot's styles.

Shared `ln-control-button`/`ln-control-input` styles live in `controls-style.ts`.
Surfaces map their semantic theme variables to `--control-*` tokens. Hover is a
a light translucent inset outline without a fill; current selection is persistent, pressed feedback is separate, button
focus is keyboard-only, and fields use a single focused boundary. Optional
`--control-field-border` specializes field boundaries without changing button
feedback. The selector mixes content at 65% with panel for field fills and
controlBorder at 65% with panel for resting boundaries; name and folder controls
share these tokens and the theme radius. Focus retains the full semantic focus
color, and text contrast is unchanged. Text selection
uses the theme's selection/text roles. Host recovery styles are isolated under
`#system-root`, so they cannot override product interactions.

The initial icon pack is **Lucide**, pinned to `lucide@1.69.0`. Only required icon
nodes are imported in `controls.ts` and rendered in the borrowed document; no
global icon scan or document access occurs. Shared button/input/icon factories
live in the kit, not in the consumer.

Recent rows fill the panel's padded content area, with compact padding and a name
above the complete, wrapping location label. Current rows retain an accent outline
and `aria-current`; pressed feedback and keyboard focus remain distinct.

The left recent panel and right action panel are separate cards in a 1:2 grid,
stacking actions first below a 40rem container width. Shared `ln-panel` surfaces
live in `panel-style.ts`; owners map `--panel-background` and `--panel-radius`
to active theme tokens. The selector uses `colors.panel` and `geometry.radius.medium`,
with three spacing steps for outer padding, the card gap and recent-panel padding.
Cards have no decorative border or shadow. Recent rows and action disclosures
remain flat inside their parent card.
The frame uses container queries; all content
can shrink/wrap, and ASCII type scales with its available width. Selector colors
inherit `colors.background/panel/content/selection/text/textSecondary/separator/controlBorder/hover/
focus/accent/onAccent/accentHover`; geometry inherits `unit`, `spacing.step`,
`radius.medium`, `borderWidth`, `focusWidth` and `focusOffset`. Typography inherits
the same generic properties as the startup screen. No theme engine is imported.
Optional `motion.fast/normal` are nonnegative milliseconds (defaults 120/200),
with `motion.easing` (default `cubic-bezier(0.2, 0, 0, 1)`). Theme changes reset
missing tokens to defaults. Reduced-motion preferences disable transitions.

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

Palette integration: selector artwork consumes colors.text, input carets
consume colors.caret, and alert text consumes colors.error. Missing roles fall
back to currentColor. Reference sub is decorative; labels use textSecondary.
Extra error/colorful roles are currently data only, with no mode selection UI.
