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
Registers `lunaris.startup-screen`, `lunaris.vault-selector`,
`lunaris.workspace-header`, `lunaris.workspace-empty`, `lunaris.workspace-layout`
and `lunaris.sidebar-rail` with ctx.signal.
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

The Workspace header uses inline-size containment and intrinsic flex sizing so its
non-growing slot retains the full height of wrapped names, actions and errors.
Full-height screen/content roots continue to use size containment.

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

The optional workspace-header role remains available to SDK consumers but is not
mounted by the default Workspace screen. Its props: strings `name`, `closeLabel`, `error`; boolean `busy`;
callback `onClose()`. It renders a wrapping Mantine Text/Button header with a
semantic h1 and an alert only on failure. Empty-state props: strings `title` and
`detail`. It renders a centered, scrollable Mantine Stack/Title/Text composition
with a Lucide PackageOpen illustration above the copy. The decorative icon is
hidden from assistive technology, inherits the theme's secondary text color and
scales down in short regions; no new props, translations or consumer integration
are required.
Both roles use the current theme and localized consumer text. The header adapts
the restrained [Mantine UI header compositions](https://ui.mantine.dev/category/headers/);
no fixed-position AppShell or unused navigation is added. These roles own no Vault
operations and follow the same registration/instance lifecycle as the existing roles.

## Workspace regions and Sidebar roles

`lunaris.workspace-layout` takes booleans railVisible/panelVisible, localized
mainLabel/panelLabel and onDismiss(). Its onTargets callback receives stable
`{ main, "left-rail", "left-panel" }` HTMLElements after mount and null on release.
Callbacks only capture data; consumers mount nested Components after the layout
mount/update call returns, outside React effects. Updates/theme changes preserve
the targets. Consumers release their nested instances when the layout is replaced.
The role owns the responsive grid and region-local overflow, with a nonmodal left
overlay in narrow containers. Escape focuses the active rail control then calls
onDismiss; no portals leave the target. Regions contain independently owned React
roots, not React children that the layout reconciles.

`lunaris.sidebar-rail` takes label, activeId, tabs `{ id, title, icon }[]` and
onSelect(id). It uses Mantine ActionIcon with Lucide roles, native title tooltips,
accessible names, aria-pressed/expanded, theme selection/hover/focus colors and
Up/Down/Home/End focus navigation. It adapts the
[Mantine UI navbar compositions](https://ui.mantine.dev/category/navbars/).
Supported icon names add files/search/outline/settings; unknown names use PackageOpen.
No registry, active-tab policy, Workspace calls or Vault access lives in the renderer.

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
Recent vaults and create/select action headers use the same internal CardRow
composition of Mantine Button. They are compact single-line rows (40px minimum with the
default spacing token). Their theme-derived 22% border remains visible at rest
and strengthens to 45% on hover. Long labels truncate visually while retaining
their full accessible name and native title; icons do not shrink. Disclosure
content expands below the row without increasing the header's padding. Recent
names and paths share one line; each truncates independently and the full values
remain in the accessible name and native title. Current vaults retain aria-current
and a persistent theme selection treatment. Both existing SDK roles and their
consumer callbacks remain unchanged; no additional public role is needed.
Both action disclosures use a Mantine Paper form with the same 22% boundary and
radius as CardRow, an 8px gap below the header and 12px inner padding at default
spacing. Fields and the primary button share the row's 40px control height;
labels use a compact 4px gap. Shared CSS tokens keep these dimensions and borders
aligned when the active SDK theme changes. Intrinsic disclosure animation, inert
closure, draft preservation and keyboard focus behavior remain unchanged.

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
and localization remains consumer-owned. Workspace mounts its header and empty-state
roles through the same public registry. Workspace borrows the layout targets;
Sidebar supplies rail props while its selected content mounts independently.
Required integrations are complete.

Run `npm run mantine-components:check` for real SDK/React/Mantine behavior,
registration rollback/restart, owner cleanup, isolated roots, prop validation,
theme changes, focus/drafts and host/controller regressions. Run
`npm run build --workspace @lunaris/tauri` for the CSS/production bundle.
Desktop automation is forbidden. Manually run `npm run tauri:dev` and check both
screens, short/narrow windows, keyboard focus, create/select/cancel/error flows,
recent rows, bright artwork and reduced-motion settings.

## File explorer role

`lunaris.file-explorer` renders the public controller props documented in the
[file explorer reference](../../../../DOCS/reference/file-explorer.md#renderer-contract).
It uses React Arborist 4.0.1 with react-dnd/HTML5 backend 16.0.1, Mantine menus,
ActionIcon, TextInput, Paper and Button. The renderer owns only view mechanics;
file operations, localization, drafts and logical tree state belong to the SDK
controller. Popover/Menu styles are included in styles.css. Menus and themed
drag previews remain inside the owned root. Custom public row/cursor renderers
keep names truncatable and drop feedback on the SDK palette.
