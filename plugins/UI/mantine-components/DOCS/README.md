# Mantine components

## Purpose and stack

`@lunaris/mantine-components` / `lunaris.mantine-components` supplies the product
UI through public Components roles. It replaces the default Tauri use of the
retired LunarisComponentsKit without changing controllers or the SDK contracts.
The old plugin stays on disk but is not registered, started or granted permissions
by the default host. Never activate both plugins for the same roles.

Runtime: Mantine Core/Hooks 9.7.5 and React/React DOM 19.3.1. Controls and layouts
use Mantine Button, TextInput, Input/Wrapper, Box, Paper, Stack, Text and Title. Lucide
remains the icon pack. [Mantine UI](https://ui.mantine.dev/) is the reference catalog
for future compositions; it is not an npm runtime package. No gallery example was
copied verbatim, and no broad gallery catalog is registered without a consumer.

## SDK integration and lifetime

Requires Logger, Components, Themes, ThemeChanged and the `ui.dom` permission.
Registers `lunaris.startup-screen` and `lunaris.vault-selector` with ctx.signal.
Provides no additional API or events. Subscribes to ThemeChanged and re-renders
live instances. Readiness, degraded missing themes, rejected props/registration,
and original rendering failures are logged using ctx.pluginId as source.

Each mount creates an owned React root inside the borrowed target. Siblings and
slot geometry are preserved. Updates validate all props before rendering and keep
controlled input nodes and focus. Ownership cancellation removes listeners,
disconnects ResizeObserver, unmounts React and removes the owned root; cleanup
never calls an SDK service. Synchronous SDK updates use React DOM flushSync.

Each root has one MantineProvider, with variables and color-scheme attributes
scoped to that root. The selected SDK theme determines appearance. A no-storage
color-scheme manager prevents browser persistence. Theme selection and config
remain the responsibility of theme-settings/Config. Mantine's global body/root
baseline is omitted; hosts import the plugin's `styles.css` export once for the
required component styles. Host recovery remains independent.

## Roles and props

Mount through ctx.use(Components), never import a renderer from a consumer:

`components.mount("lunaris.startup-screen", target, props, ctx.signal)`

Startup props: required strings `art`, `logoLabel`, `status`; optional `detail`.
Art is plain text with an accessible name. Status is a polite atomic live region.

Vault selector props:

- `art`; localized `text` map: logo, recent, empty, create, select, folder,
  folderPlaceholder, browse, name, next, retry.
- `mode`: null/create/select; `folder`, `name`: strings; `busy`, `canContinue`:
  booleans; `error`, `historyError`, `status`: strings.
- `entries`: array of { reference, name, label }; optional `activeReference`.
- Callbacks: onMode(mode), onName(value), onBrowse(), onNext(), onRecent(reference),
  onRetry(). Callbacks remain controller-owned; no file access lives in this plugin.

Update through the returned component handle. All labels come from the consumer;
React escapes artwork, external names and paths. Selection uses aria-current,
disclosure uses aria-expanded/controls plus immediate inert/aria-hidden closure.
Pointer opening preserves focus; keyboard opening focuses Browse; collapse restores
the toggle when necessary. Controlled names survive locale/theme updates.
Intrinsic grid disclosure, reserved form space and reduced-motion styles retain
layout stability. Narrow/short containers compact or stack, with local overflow
and hidden scrollbar chrome. The logo uses the theme text color.

## Themes and development rules

The vault form follows the [Mantine UI form compositions](https://ui.mantine.dev/category/authentication/)
with shared medium-sized controls and a full-width primary action. Folder selection
uses the documented Input-as-button pattern inside Input.Wrapper: the whole field
opens the SDK-owned picker, with one tab stop and no editable path impersonation.
Name and folder fields share Input defaults, geometry and boundary focus treatment.
Buttons retain Mantine variants; the variant resolver maps their colors to the
selected SDK theme instead of a library gray/blue palette. Disabled colors also
come from the SDK theme. Input boundaries blend controlBorder into content at rest
and expose the full controlBorder on hover and focus on the focused boundary.
The scoped root supplies typography and color scheme without global baseline CSS.
Branding and form width are restrained to keep controls primary.

The adapter in src/theme.ts translates the shared engine's colors, geometry,
spacing, typography, startup tokens and motion into Mantine theme/owned CSS
variables. Missing color roles inherit text or transparent surfaces rather than
importing a particular engine. Changing/clearing Themes resets previous values.
Extra error and colorful-error palette roles remain available to future consumers;
no colorful-mode setting is added.

For future UI, check existing roles, then Mantine Core and ui.mantine.dev. Compose
inside this plugin and register a role when a real consumer needs it. Keep business
services, localization and platform access behind public SDK contracts. Do not
reimplement Mantine primitives or add product controls to the legacy Kit.

The plugin's TS config skips dependency declaration checking because Mantine 9's
upstream declarations conflict with React optional properties under the repository's
exactOptionalPropertyTypes setting. Product source still uses strict type checking;
no SDK checks or compiler strictness flags are disabled.

## Integration and verification

Tauri starts this plugin; runner and vault-selector mount its unchanged roles.
Themes/ThemeChanged update Mantine, theme-settings selects startup appearance,
and localization remains consumer-owned. Required integrations are complete.

Run `npm run mantine-components:check` for real SDK/React/Mantine behavior,
registration rollback/restart, owner cleanup, isolated roots, prop validation,
theme changes, focus/drafts and host/controller regressions. Run
`npm run build --workspace @lunaris/tauri` for the CSS/production bundle.
Desktop automation is forbidden. Manually run `npm run tauri:dev` and check both
screens, short/narrow windows, keyboard focus, create/select/cancel/error flows,
recent rows, bright artwork and reduced-motion settings.
