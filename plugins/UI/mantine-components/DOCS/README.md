# Mantine components

## UI integrity audit (2026-11-11)

Reference: existing Files/Settings menus, floating mobile actions and Workspace
drawer; [Mantine UI navigation](https://ui.mantine.dev/category/navbars/) and
[Mantine Menu](https://mantine.dev/core/menu/). Workspace still owns drawer
geometry and surfaces; embedded roles own controls only. Closing the drawer
delays visual visibility until its transform finishes, while existing inert and
aria-hidden attributes disable interaction immediately. Reduced motion removes
the delay. Menu defaults use the active theme's fast duration/easing; explicit
instant menus remain instant and Mantine retains reduced-motion handling.
Mobile/coarse-pointer menu rows, including tab choices and their trailing
actions, now have a 44px minimum. The earlier 34px tab-choice description applies
only to fine-pointer desktop density. The five-row popup cap follows row height.
Textarea focus uses the shared 16px phone/coarse-pointer minimum.

Integration uses existing Components/Themes/Workspace contracts; no SDK or
consumer change is required. Targeted checks passed (143 tests, no skips,
including application/web/Tauri consumers). Native drawer transitions, popup
geometry, keyboard focus and phone keyboard acceptance are still pending.

## Declarative view role

`lunaris.declarative-view` receives `{ tree, presentation? }` from public Views.
The [ViewNode/shape contract](../../../../DOCS/reference/views.md) defines typed
structures, controls, drawing data and limits. Product controls reuse shared
Mantine Button, inputs, Checkbox and themed SettingsSelect/Combobox; drawing owns
only its SVG viewport. No HTML/foreignObject/native event object is transported.
The allocated container owns surfaces/overflow; this role is transparent and
preserves explicit presentation. Grids collapse below 640px allocation; controls
keep their native keyboard navigation. Reference: existing Settings controls and
Mantine UI inputs/buttons. Composed isolated-view tests exercise the actual
Workspace container, menus, themes and cleanup. Native graphics geometry,
pointer mapping/focus and narrow/short visuals remain manual acceptance.

## Lime Settings role

`lunaris.lime-settings` renders embedded/content management rows using shared
Mantine Switch/Button/Text/Group/Stack controls and existing Settings row styles.
Required props: localized labels, rows of inert metadata plus enabled/recovery/
removing/state, nullable preview metadata with warning/action, busy/available/
safeMode booleans, error text and onAdd/onConfirm/onCancel/onToggle/onRetry/
onUpdate/onRemove/onSafeMode callbacks. Fields contain only label/value strings;
there is no HTML injection or native/engine access. Metadata and descriptions wrap.
The containing Settings page owns its surface/geometry; the role paints no card.
Package preview opens a themed Mantine modal with Overview and Dependencies tabs.
The role mounts its overlay at the document level, above the Settings scroll
region and its sticky header. The overlay shares the component theme scope.
The scrollable panel is separate from the action footer. The first tab receives
initial focus and dismissing the modal returns focus to the opening control.
Remove exposes retain/delete-data actions; pending removal retries its committed
choice. Theme/locale updates preserve role controls through the existing adapter.

The role also accepts dependencyPlan (pluginId/revision/affected/direct dependencies
and candidate ID/version/state), onPlan and onSelectProvider callbacks. Details
shows the affected IDs before application. ProviderSelection reuses the existing
themed SettingsSelect/Combobox and a quiet explicit Apply action; no NativeSelect
or system option menu is used. Missing/disabled providers have localized guidance.
The controller owns runtime calls/revisions and persistence; the role owns only
draft selection and rendering. Workspace/Settings retain surface/geometry ownership.
Reference: existing Settings rows/quiet actions and Mantine UI buttons/tables.
See [controller integration and pending native acceptance](../../lime-settings/DOCS/README.md).

Explorer empty state follows the Owner's Files panel screenshot: omit the redundant
"No files" caption above the Vault root and reserve no row for it. Loading status,
errors and recovery actions remain available. This is internal to the existing
file-explorer role; no consumer integration or SDK contract changes are needed.

## Mobile layout audit corrections

Floating-control gesture correction: reference is the Owner's report that panels
only disappear when the virtual keyboard makes the document scrollable. Workspace
owns visibility of both floating surfaces and observes passive capture-phase touch
events in its borrowed main region. A single-finger vertical movement of at least
24px (dominant over horizontal movement by 1.5) hides controls on upward movement
and shows them on downward movement, even without scroll overflow or keyboard.
Horizontal gestures, multitouch, cancellation and the open Sidebar are ignored.
No default editor scrolling, text selection or editing event is cancelled. A hiding
gesture transfers stale floating-button focus to main; existing editor focus stays.
Native scroll visibility remains supported; unchanged vertical offsets do nothing,
and an active touch decision wins over competing scroll notifications. Listener
cleanup and DOM regressions cover these cases. Integration stays inside the existing
Workspace layout role; no SDK or contributing-plugin change is needed. Native
short/long-document swipes, text selection, keyboard and themes remain manual checks.

Reference: the existing mobile Workspace, Files rail and Settings header, plus
[Mantine UI navigation](https://ui.mantine.dev/category/navbars/). Workspace retains
ownership of floating surfaces and their scroll overflow. The launcher now scrolls
when contributed actions exceed its available width, matching the bottom toolbar.
SidebarRail adapts its own padding to an allocated width of 60px or less so Luna
padding cannot squeeze compact navigation controls. Settings owns heading wrapping;
long unbroken category titles stay within the existing sticky header.

File Explorer uses a minimum 44px virtual row height for coarse pointers, including
draft rows, and recalculates on pointer-capability changes. Virtual geometry is
updated directly rather than stretching CSS rows over adjacent hit targets. The
media-query listener is released on unmount. Password inner inputs receive the same
16px minimum coarse-pointer text as other shared editable inputs.

Existing Workspace/Sidebar/Components contracts connect these changes; no new SDK
contract or consumer integration is required. DOM regressions cover virtual row
geometry, capability changes and listener cleanup. Visual acceptance remains pending
in the real composed Workspace and account screens: 320/360/390/640px widths, short
landscape, long titles, overflowing launcher actions, Luna light/dark and Monochrome,
touch scrolling, opened menus and password focus with the virtual keyboard.

## Phone control density

Reference: the existing Files toolbar, Settings rows and floating Workspace actions,
with [Mantine UI inputs](https://ui.mantine.dev/category/inputs/) as the composition
catalog. At viewport widths up to 640px, shared form fields, navigation actions,
opened menu options, reset actions and the compact launcher have a 44px minimum
target. Editable fields retain a 16px minimum font to avoid focus zoom on phones.
Desktop rules above that breakpoint remain unchanged.

Phone typography uses a 16px minimum in Files, Settings, account/vault screens,
navigation and context menus, while respecting larger theme font sizes. The theme
adapter exposes the original size as --vault-ui-font-size and lets each owned
role opt into --lm-ui-font-size; document, callout and task text do not opt in.
Primary navigation/action icons use 22px, file/menu icons use 20px, extension
badges use 12px and Settings page headings use 1.25em in both Luna and Monochrome.
Lucide strokes, semantic colors and focus states remain unchanged. Acceptance
also requires checking icon alignment, long filenames, opened submenus and the
unchanged document typography at phone and desktop widths.

Settings owns its internal layout. Reference: the Owner's Gruvbox narrow Settings
and Luna desktop screenshots. At an allocated form width up to 640px (independent
of viewport width), fields move below their labels and span the available width
with a shared leading edge. Values align to the start in both ordinary and Luna
themes, and inputs have a 44px minimum height. Wider inline rows do not wrap:
the label and trailing field remain on one line. Explicit stacked rows retain
their public layout contract; inline switches keep a compact label/control row.
This replaces accidental flex wrapping with an explicit responsive composition.
The renderer
publishes its own item type as data-type, without inspecting another role's DOM.
Settings, navigation and Files contain scroll chaining inside their content.
Workspace still owns drawer/floating surfaces and geometry; no additional surface
or SDK contract is introduced. Existing Components consumers receive the change
without new integration work; theme tokens, selection, callbacks and focus remain
under the existing public roles.

Manual visual acceptance is pending in the composed application: 320/390/640px
portrait and short landscape, Files toolbar and opened menus, Settings switches,
full-width text/number/select fields with long Russian labels, reset actions,
virtual keyboard and launcher visibility in Luna light/dark and Monochrome.
Compare widths above 640px with the existing desktop reference.

## Initial mobile adaptation

Reference: the existing Workspace rail, Files and Settings compositions, and
[Mantine UI navigation](https://ui.mantine.dev/category/navbars/). The compact
mode uses the Owner's floating bottom action and left sliding sidebar reference.

WorkspaceLayout owns region geometry, surfaces, overflow and the compact return
control. Sidebar continues to own tool selection; Explorer, Settings and editor
roles own only their embedded content. Existing public `onDismiss`, `mainLabel`
and stable `onTargets` contracts provide the integration; no consumer imports
React/Mantine or changes another plugin's DOM. No new provider is required.

At an allocated Workspace width of 640 CSS pixels or less, the status strip is
hidden and a separately contributed mobile menu opens the sidebar. The menu plugin supplies localized item labels. The rail and selected tool panel slide over
the editor as one modal layer, leaving a trailing backdrop to dismiss it. The
editor stays mounted and visible underneath, but is inert while the layer is
open. Mantine FocusTrap contains keyboard traversal. The backdrop or Escape closes the layer and restores focus to the first mobile action.
Opening/closing uses the public WorkspaceSidebar presentation contract, not Sidebar selection or
plugin registrations; even a rail without an active tool remains reachable.

A single-finger right swipe starting in the 20px left-edge strip also opens it:
at least 56px horizontally, with horizontal movement dominant. Vertical travel
over 24px, multitouch or cancellation rejects the gesture. The strip uses pan-y;
editor gestures outside it remain untouched. Native browser edge navigation may
still take priority and requires device verification. Motion uses theme timing
and is disabled for reduced-motion users. Closed overlay regions are inert and
hidden from assistive technology immediately. On desktop, the ordinary sidebar
and status strip return. The host shell already owns safe-area insets; the toolbar
is inset within that safe region. Floating surfaces overlay the editor without reserving content space.

Successful file or Settings-category opening closes the overlay through WorkspaceSidebar, including reopening the current target.
Targets and mounted drafts survive width and visibility changes. Resizing is desktop-only and does
not overwrite the saved desktop panel width in compact mode. Navigation buttons
have 44px compact targets. Coarse pointers enlarge shared actions/menu options;
editable UIKit inputs use at least 16px text to avoid focus zoom. The shared host
shell respects safe-area insets and dynamic viewport height.

Native Android/iOS remain `unadapted` in this plugin's manifest: responsive work
does not certify native platform support. Other target entries remain undeclared.
There are no mobile-only plugins or mobile driver changes in this stage.

DOM regression covers stable contributed targets/drafts, the visible/inert editor,
button/backdrop/Escape, valid and rejected edge swipes, focus transfer and observer
cleanup. Visual acceptance is pending
in the actual Workspace: 320/360/390/640px widths and return to desktop; short
landscape; Files and Settings selection then return; long Russian labels;
opened menus; both themes; keyboard and touch focus; safe areas and the virtual
keyboard on a real mobile browser. Existing virtualized file rows and editor
gesture interactions still need a separate touch audit. Integration through the
public Workspace/Sidebar roles is implemented; mobile visual acceptance is not.

## Account and browser update roles

`lunaris.account-access` accepts mode connect/login/register/vaults/trash,
localized text, controlled address/login/password/invitation/name, account label,
busy/error, allowLocal/invitationRequired, and entries `{ id, name, detail }`.
Callbacks are onField, onSubmit, onToggleAuth, onLocal, onLogout, onOpen, onTrash,
onRestore, onToggleTrash, onRefresh and onChangeServer. The standalone role owns
its content card; embedded presentation inherits the parent's surface. Controls
reuse Mantine TextInput/PasswordInput/Button and the existing CardRow navigation.
The existing Vault Selector optionally accepts onServer and localized text.server.

`lunaris.client-update` accepts localized message/action/error, busy and onReload.
Its standalone/content instance owns one transient notice surface in a dedicated
slot; it does not add a permanent Workspace header or restyle another region.
The controller gates reload through Vault.close before requesting native reload.

References: the existing product selector/navigation and
[Mantine authentication compositions](https://ui.mantine.dev/category/authentication/).
Account input, escaped catalog labels, controlled updates and presentation have
DOM tests. Opened password visibility, focus, theme contrast, narrow/short layouts
and the composed update/reload interaction remain manual visual acceptance items.

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

Visual composition must follow [architectural UI ownership](../../../../DOCS/UI_GUIDELINES.md#7-architectural-ownership-and-composition).
For each role, document whether it owns a region/surface or supplies embedded
content. Region owners apply outer geometry and surfaces once; embedded roots
inherit them. Theme adaptation exposes tokens, typography and control styling
without automatically painting a standalone page background. Check general theme
style objects before spreading them onto embedded roots.

Sidebar rail and selected tool panel surfaces belong to WorkspaceLayout. Sidebar
tools, including Settings navigation, supply content inside those regions. Settings
sections receive borrowed targets inside the separate main screen. Preserve those
boundaries through theme updates, content replacement and empty/failure states.
Any necessary standalone/embedded distinction must be part of the public role
contract, never inferred from target classes, DOM ancestors or consumer identity.
Validate the role inside its real container; record native visual checks as pending
until performed. These are normative requirements; existing implementations must
be reviewed against them when touched.

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

## Presentation and surface owners

All roles accept the public `presentation` prop, typed by `ComponentPresentation`
from `@lunaris/components`: optional `mode: "embedded" | "standalone"` and
`sizing: "fill" | "content"`. Invalid modes, sizing, extra presentation fields or
accessors reject the update before changing the current view. Valid updates retain
the root and apply the new presentation; theme updates preserve the chosen mode.

The theme adapter's `contentStyle` contains tokens, colors and typography without
a background. A separate `pageBackground` is applied only to the owned mount root
in standalone mode. Embedded roots remain transparent. Views never paint their
outer page surface independently of that contract. Borrowed targets are untouched.

| Role | Default presentation | Owned surface/layout responsibility |
|---|---|---|
| Startup / Vault selector | standalone, fill | Standalone page background and internal content |
| Workspace layout | standalone, fill | Application background, region geometry, rail/panel cards |
| Workspace header | embedded, content | Header content and internal spacing |
| Sidebar rail / File Explorer / Settings navigation | embedded, fill | Content inside the owning panel surface |
| Active screen / Settings page / empty state | embedded, fill | Main/section content inside borrowed targets |
| Context menu | embedded, fill | Transparent overlay and its intentional local menu surfaces |

Composition owners pass presentation explicitly. Settings passes embedded/content
to section roles and their fallbacks; it never determines sizing from target classes.
Internal event handling may locate controls within an owned view, but those lookups
must not infer a parent's presentation or layout contract. Tests verify ownership
inside composed views, target-class independence, theme switching, prop validation
and retained root/input identity. Native geometry remains subject to manual checks.

## Roles and props

Settings consistency reference: the Owner's Files panel/header and Vault-footer
screenshots, implemented by `explorer.tsx`, `vault-switcher.tsx` and the shared
component stylesheet. Settings navigation uses a compact static tool heading and
icon-bearing category rows instead of a separate large-button scheme. Header
geometry follows the existing Files header; Settings has no header menu or chevron.
The Files
renderer/controller retains its ownership. Category-specific icons are now supplied
by Settings 1.2 metadata, with the generic
Settings icon retained as the fallback when no icon is registered.

Both declarative and legacy settings dropdowns use `SettingsSelect`, built on
Mantine Combobox and InputBase with `component="button"`. Its non-editable button
trigger, listbox, selected/hovered options and check
indicator remain within the owned themed root (`withinPortal: false`). Opening
the list never invokes a native select popup. The list supports keyboard arrows,
Enter, Escape, no deselection, disabled controls and bounded local scrolling.
Standard Combobox CSS is explicitly included. These behavior/DOM properties are
tested; native menu placement, visual matching and focus appearance remain manual.
Intentional differences from Files: settings rows are category actions rather
than a filesystem tree, so they do not expose folder disclosure or file operations.

Settings visual hierarchy uses a page header, separately named group headers and
indented rows with quiet separators. Header spacing and bounded content width keep
groups legible without painting another card over Workspace. Group headings label
their semantic sections with aria-labelledby; borrowed targets retain identity.
Control rows wrap on narrow widths and inherit the existing embedded surface.
Select/text/number fields use compact theme-sized controls, the same 22% semantic
border treatment and corner radius as the Vault switcher reference. Selects use
the shared Lucide up/down icon on the left and align the selected value at the end.
Only interactive controls receive a field surface; sole select values remain text.
The shared stylesheet imports Mantine InlineInput/Switch/NumberInput styles for
the registered control types. Native visual acceptance remains manual.

`lunaris.settings-items` is the primary embedded/content renderer for declarative
Settings 1.2 items. Props: `items: SettingsItem[]`, `onChange(id, value)`,
`onRetry(id)` and optional `onReset(id)` (required when items expose reset actions).
It interprets public `type`, `title`, `description`, `layout`, controlled
`value`, options/constraints, `disabled`, `error` and retry presentation. It calls
the supplied host callbacks, never the contributed item callbacks directly.
Select/switch/text/number map to the shared themed Combobox/Switch/TextInput/NumberInput.
Slider items use Mantine Slider with its scoped component stylesheet, theme-derived
track/thumb/focus colors, a numeric readout, accessible thumb label/value and
optional reset action. Pointer motion updates local presentation; release and
keyboard adjustments invoke the host callback. Controlled changes, disabled states
and failed saves restore the authoritative value without replacing the thumb.
A sole matching select option is plain text. Item IDs retain row/input identity;
labels, descriptions and errors are linked accessibly. Inline rows wrap naturally;
`stacked` puts the control below its label. The container owns surrounding surfaces
and group headings. The role owns internal controls/spacing only.

Reference for the Settings 1.2 refinement: the Owner's Files screenshots showing
closed/open menus, repeated category icons and dense rows. The new category glyphs
come from explicit SDK metadata. Category, item and menu spacing uses existing
theme spacing tokens. The existing left chevrons, selection checks and navigation
hierarchy remain; button triggers remove text selection and text carets.
Reviewed [Mantine input compositions](https://ui.mantine.dev/category/inputs/),
[Slider](https://mantine.dev/core/slider/) and installed Combobox APIs.
Workspace owns region surfaces/geometry, Settings owns groups and target lifetimes,
and this plugin owns embedded controls and internal spacing. Native visual
acceptance remains pending: inspect both themes, opened options, pointer/keyboard
focus, dragging/reset, long labels, and narrow/short Workspace layouts.

`lunaris.settings-choices` remains as a legacy embedded/content role. New settings
must use the declarative registration contract. Its props:
`fields: { id, label, value, options: { value, label }[] }[]`, `disabled`, localized
`error`, `retryLabel`, `canRetry`, `onChange(id, value)` and `onRetry()`. Field/option
IDs are unique; values/labels are strings. Multiple choices use the shared themed Mantine Combobox;
a single choice is plain labeled text. Errors use an alert and optional Retry.
The role owns internal spacing/controls only, preserves input identity on updates
and inherits Settings' surface. Persistence stays in the contributing controller.
The [Settings container](../../settings/DOCS/README.md) owns current declarative
callback lifetimes; interface-settings no longer registers a custom host role.

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

WorkspaceLayout uses Mantine Splitter between stable left-panel/main targets.

By temporary Owner instruction, WorkspaceLayout prevents Tab/Shift+Tab traversal
through an owned document-capture listener. It covers body and overlay events,
retains pointer/arrow interactions, and is removed on layout disposal. Editable
content owns Tab input: the listener allows events whose nearest explicit
contenteditable boundary in the composed event path is true, empty or plaintext-only.
An explicit false boundary remains subject to the traversal policy. This uses
standard HTML semantics rather than editor plugin IDs or private selectors, so
replacement editors can receive Tab/Shift-Tab through the same public target.
The real WorkspaceLayout/Text Editor integration regression covers indentation,
reverse indentation and persistence within this container.
Selector/recovery outside Workspace retain their existing keyboard behavior.
Optional `panelWidth`, `resizeLabel` and `onPanelWidth(width)` props keep preference
ownership in the SDK consumer. Resizing changes view geometry only; pointer drag,
keyboard arrows/Home/End, double-click reset and focus indicators reuse Mantine.
The separator is a quiet 8px hit area without a grip. Collapsing the panel hides it;
narrow layouts retain the bounded overlay. Viewport fitting reserves main content
without overwriting the preferred size. The workspace controller persists committed
changes through Config; the renderer never accesses browser storage.

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

The four tree actions are centered as a group above the tree in the Files panel.

The Owner's TestVault reference places the active file surface inside its
tree indentation. Branch guides stay in the gutter, and the accent marker
sits at the leading edge of the rounded row. Explorer owns these internal
styles and derives the active fill from the theme accent and panel colors.
Workspace owns the enclosing panel surface. The existing Components contract
connects Explorer to the active document; native acceptance covers nested
folders, temporary selection, focus, drag targets and narrow panels.

Tree focus chrome follows explicit navigation modality: arrows, Home/End and
PageUp/PageDown enable a row focus indicator; pointer input clears it. Shift or
other modifiers alone do not enable it. The tree container never draws a panel-
sized focus outline. Shift/Ctrl range selection, editor focus borders and drop
target feedback retain their existing behavior.

Creation uses a protected, view-local draft row inside the destination folder.
The row mounts a Mantine TextInput, opens ancestors and scrolls into view. Enter
submits once, Escape cancels, and errors retain name/focus for retry. Its synthetic
identity never reaches selection, drag, mutation or context contracts. The
controller retains the existing draft shape across view remounts. Only permanent
deletion keeps an explicit confirmation form outside the tree.

Drafts now start with localized Unnamed.md/Unnamed folder labels and a numeric
suffix for known sibling collisions. They sort folder-first by their initial
name, staying in place during input. The tree focuses the draft through public
Arborist APIs; focusing its row forwards focus to the input. Context-menu teardown
precedes editor commands, so restoring source focus cannot steal the editor's
initial focus. Blur submits nonempty creation drafts or cancels empty ones;
Escape marks the draft closed before moving focus, preventing accidental creation.

The shared `lunaris.context-menu` role renders frozen `items` with viewport
`x`/`y`, an accessible localized `label`, `onAction(id)` and `onClose()`.
The context-menu provider mounts it in an owned document overlay; Mantine Menu
and recursive Menu.Sub provide focus/navigation and hover disclosure. It uses
the active theme, collision handling, scrollable menus and instant closure.
The role's root disables size containment so fixed-position submenus escape
parent menu scrolling. No portal leaves the borrowed target. Explorer context
menus now use the provider, while the Files tab selector remains local.
Items accept the public optional `icon` role, with Lucide action/folder fallbacks.
File commands have dedicated creation/rename/copy/cut/paste/delete/refresh icons.
Unavailable entries and groups without available descendants are omitted by the
provider. Compact regular-weight rows, a subdued border, no shadow and quiet
theme-derived hover/pressed fills keep the menu flat like the Files dropdown.
See the [context menu reference](../../../../DOCS/reference/context-menu.md).

`lunaris.file-explorer` renders the public controller props documented in the
[file explorer reference](../../../../DOCS/reference/file-explorer.md#renderer-contract).
It uses React Arborist 4.0.1 with react-dnd/HTML5 backend 16.0.1, Mantine menus,
ActionIcon, TextInput, Paper and Button. The renderer owns only view mechanics;
file operations, localization, drafts and logical tree state belong to the SDK
controller. A localized Tabs dropdown currently offers only Files. Its single-line
trigger spans the available panel width and reads as a medium-weight panel
heading: transparent at rest, without a persistent border, with a 32px minimum
height at default spacing. A quiet hover/open surface and distinct pressed
feedback use the active theme; keyboard focus retains the shared focus indicator.
The dropdown stays available with the single Files entry for interaction testing.
It shares the trigger width but is detached by a 6px gap, with a restrained
theme-derived border and shadow. Menu corners remain rounded in either placement;
item corners use half the menu radius. The current entry is marked by a trailing
Lucide check rather than a permanent selection fill. Opening uses a fade without
scaling/movement. Long localized names truncate with full native titles, and the
chevron stays at the trailing edge. The Workspace
Vault name is rendered as an initially expanded, protected root row above the
controller entries; header titles and operation buttons are absent. Root disclosure
is view-local and resets on remount. Root identities are excluded from controller
selection and mutation sources; root drop targets map to the public empty path.
Existing file commands remain available through context menus and shortcuts. Popover/Menu styles are included in styles.css. The tab selector and themed
drag previews remain inside the owned root; shared context menus use the provider-owned overlay. Custom public row/cursor renderers
keep names truncatable and drop feedback on the SDK palette.

The tree shares the toolbar's horizontal inset, with compact 28px rows at the
default font size. Row spacing stays inside the virtualized row allocation so
selection, scrolling and drag/drop geometry retain their controller behavior.
Rows have small theme-derived corners and no resting boundaries; the protected
Vault root uses medium-weight text. Disclosure controls and file placeholders
share a width to align labels at each depth. Thin vertical guides in the indent
area align with ancestor disclosure centers and use a subdued theme secondary
color. Their spacing follows Arborist's public indent and node level, so they
track nested folders and font-size changes without affecting row geometry.
Guides are decorative, hidden from assistive technology and ignore pointer input. Hover uses the same quiet surface
as the header, selection retains a stronger theme-derived fill, and press/drop/
keyboard focus remain distinct. Busy trees suppress row hover/press feedback.
Context menus reuse the detached dropdown geometry and interaction palette;
inline forms use the same insets and subdued boundaries. Motion follows theme
timing and is removed for reduced-motion preferences. No controller contracts,
file commands or cross-plugin integrations change.

## Global region surfaces

The experimental Windows XP Luna preset is received through Themes/ThemeChanged.
Optional components.controls tokens add button images, borders, inset shadows
and input shadows in the adapter; see the [theme reference](../../../../DOCS/reference/base-theme.md#experimental-windows-xp-luna)
for the public data fields. They are removed on theme replacement and do not
paint embedded roots or alter region geometry. Card rows retain their navigation
appearance; disabled buttons suppress gradients/shadows. The reference is the
existing shared controls, Windows XP Luna and [Mantine UI buttons](https://ui.mantine.dev/category/buttons/).
The Owner's second screenshot (XP Paint) now defines the chrome: WorkspaceLayout
owns the blue outer frame and compact region grid, without a duplicate Workspace
caption. Embedded role roots
receive an explicit data-window-chrome flag from theme data, never DOM ancestry
or plugin IDs. Settings owns its blue title and compact form content; the
Explorer owns its toolbar and inset file list. Gray region surfaces stay with
WorkspaceLayout. Targets remain mounted when toggling chrome, and main receives
no enclosing card. Components.windowChrome fields are documented in the theme
reference. No fake window controls, taskbar or desktop are added. Explicit
root-scoped Mantine font variables preserve Tahoma in headings and controls.
No gallery composition was copied. Consumers still use public component roles;
theme-settings/interface-settings own selection and persistence. Native visual
acceptance, including opened menus, focus and narrow layouts, remains pending.

WorkspaceLayout owns one Mantine Paper card per supporting region (navigation
rail and selected tool panel), using the active theme panel surface, radius and
spacing. Main remains an open workspace with no card or outer inset. Rail,
explorer and empty-state views use transparent backgrounds so they inherit the
region surface without adding nested cards. Narrow overlays retain external
spacing and rounded corners; region scrolling, stable SDK targets and Escape
behavior are preserved. Individual tab buttons remain controls inside the rail
card. No SDK contracts or controller integrations change.

## File extension presentation

The controller supplies supportedExtensions (currently ["md"]) through public
lunaris.file-explorer component props. The optional list contains extensions
without dots; matching ignores case. Additional formats require no rendering
changes. This controls presentation, not document-opening support.
File suffixes are hidden from names and inline create/rename fields and preserved
in filesystem callbacks, including their original case. Supported formats have
no badge. Only external (unsupported) files show their extension in a small,
subdued right-aligned Mantine Badge. Omission of supportedExtensions treats all
extensions as external. Full paths remain available in row tooltips. Directories,
extensionless files, trailing dots and stemless dotfiles have no badge.
Pasted full names do not duplicate suffixes. Empty names cannot submit.
Existing Sidebar/Components callbacks carry full filenames; no driver or SDK
API changes or additional plugin integrations are required.

Explorer disclosure arrows keep a transparent background and their resting icon
color on hover, with the default arrow cursor. Explicit background/color rules
override Mantine hover properties because variant variables are inline styles.
The containing row owns hover feedback; expansion and keyboard
focus behavior remain provided by the existing component role.

## File panel Vault footer

The existing `lunaris.file-explorer` role accepts optional `vaultSwitcher` props;
see the [component contract](../../../../DOCS/reference/file-explorer.md#user-operations).
The footer composes Mantine Button/Menu with Lucide icons, opens upward, limits
recents to four and delegates navigation to the SDK consumer. It shares panel
styling without a second card and uses intrinsic flex space below the scrollable
tree. The toggle uses the same thin theme-derived border as the dropdown.
Long names truncate with full display labels in tooltips. Busy controls are
disabled; failures use a localized alert. The reference catalog consulted was
[Mantine UI navbars](https://ui.mantine.dev/category/navbars/); no runtime gallery
dependency or copied composition was added.

## Active document integration

The controller consumes ActiveDocument/ActiveDocumentChanged through the public
SDK. The renderer receives optional activePath and onOpen props. A plain file
click or Enter opens it; Ctrl/Shift selection remains independent. activePath
controls persistent row marking and aria-current even when focus or selection
changes. Restored files reveal their ancestors without taking keyboard focus.
Confirmed file creation activates the new file; rename/move update its identity
and deletion/observation/manual refresh reconcile missing files. See
[the active document reference](../../../../DOCS/reference/active-document.md).
The CodeMirror editor is integrated through the public ActiveDocument transition
contract and ActiveScreen; see the [editor guide](../../text-editor/DOCS/README.md).

The active file uses a visible vertical marker before its icon instead of a
persistent row background. The marker uses 80% theme text color with a 1.75-space
offset from the icon. It remains anchored to the icon wrapper without shifting
indentation. Folders and temporary operation selection retain normal row feedback.
No SDK/controller integration changes are required.

## Active screen role

The `lunaris.active-screen` role supplies a borderless full-size Mantine Box
composition. Props include `ids` (unique strings), `activeId` (one of those IDs
or null), and `onTargets(map | null)`. The optional `tabs` prop enables the tab
strip and navigation row. Each entry in `tabs` supplies `id`, `title`,
`description`, `location`, `closable` and optional `extension`.
The remaining fields supply `selectedId`, `busy`, `error`, `canGoBack`,
`canGoForward` and localized `labels` for `tabs`, `add`, `close`, `back`
and `forward`. Callbacks `onAdd()`, `onSelect(id)`, `onClose(id)` and
`onNavigate(-1 | 1)` return promises indicating whether the action succeeded.
The strip forwards middle clicks on unused space to `onAdd()` and middle clicks
on closable tabs to `onClose(id)`. The optional
`onReorder(id, targetId, "before" | "after")` enables tab drag sorting. The role
captures the pointer, translates the dragged tab horizontally and shows the
insertion edge. It sends the proposed move when the pointer is released.
Mantine Tabs and ActionIcon supply keyboard and pointer controls. The role styles
the internal strip and navigation. The screen surface inherits Workspace.
The Owner's follow-up tab reference uses one continuous selected surface behind
the label and close icon, with rounded joins into the content. The Mantine role
owns that surface and resets the tab button's native background and border. Its
keyboard focus ring stays on the control. Theme tokens supply colors and spacing.
Targets retain DOM identity on selection, props and theme updates. Inactive targets
are hidden, inert, excluded from accessibility navigation and removed from layout.
The active-screen controller owns lazy child mounting and releases hidden focus.

The callback only lends owned targets; mount other SDK components after the
parent mount/update returns, as with WorkspaceLayout. Do not reparent or restyle
targets. The controller reserves an internal target for the shared empty/failure
role. See [Active screen](../../../../DOCS/reference/active-screen.md).

Sidebar API 1.1 supports `placement: "start" | "end"` (default start). End tabs
form a bottom group; numeric order stays local to each group. Snapshot and keyboard
order follow visual order. Updates preserve placement; existing consumers remain compatible.

## Settings foundation roles

`lunaris.settings-navigation` renders owned category buttons with wrapping labels,
localized title/emptyLabel, categories, selectedId and onSelect.
`lunaris.settings-page` renders the title with the selected category's optional
icon, emptyLabel and section headings, lending
stable targets through onTargets(map or null). Both use the active theme and local
scrolling. The page has no enclosing card; the Sidebar view inherits its surface.
Section control roots use intrinsic block sizing inside targets owned by this set.
No concrete settings, storage or theme controls are supplied. See
[the settings reference](../../../../DOCS/reference/settings.md). Compositions were
reviewed against [Mantine UI navbars](https://ui.mantine.dev/category/navbars/).

The Owner's Customization and Third-party plugins screenshots define the Settings
composition reference. The settings page centers its heading, groups and empty
state within Workspace main, following the editor's centered column. Groups fill
the column with local theme surfaces and compact rows. Section content inherits
that surface. The Lime role emphasizes Add plugin and separates package entries
within its borrowed section. The existing Mantine Combobox owns its trigger and
options, including keyboard interaction and selection. Workspace retains the
main and Sidebar geometry and surfaces. Verify wide and compact layouts,
opened menus, focus and theme contrast in the application.

## Text editor role

The file-name heading accepts optional `contentWidth: number | "full"` (positive
finite pixels, default 698). Text Editor supplies the effective document column
width, including preference changes and unwrapped/full-width mode. UIKit centers
the heading with the same responsive horizontal inset as CodeMirror lines; it
owns heading geometry only and does not inspect or style the borrowed editor DOM.
Workspace retains outer layout and surfaces. Reference: the Owner's screenshot
of the title offset to the left of the text column, the editable heading before
the FigCraft restyle, and the Markdown H1 in the Owner's Everforest screenshot.
The role supplies shared H1 typography variables to its file-name heading and
the CodeMirror target. Optional `contentFontSize` (positive finite pixels) sets
the title's base size when Text Editor has a custom font size. The theme provides
the base size by default. The caret indicates editing focus. Verify the title
alongside a Markdown H1 in narrow and wide Workspace allocations during native
acceptance.

At allocations up to 640px, the existing additional 6cqh document inset now sits
before the heading. CodeMirror no longer repeats it above the document text.
This lowers the title toward the content while retaining the text's position,
as requested in the Owner's narrow Workspace screenshot. The role owns heading
spacing; Text Editor owns document padding. Outer Workspace geometry is unchanged.
Native title/content spacing in the real container remains manual acceptance.

Optional width controls extend the same public `lunaris.text-editor` role:
`resizeWidthLabel` (nonempty localized text), `canResizeWidth` (boolean), and
`onContentWidthChange(width, phase)` where phase is `preview`, `commit` or
`cancel`. Supply all three to enable two Mantine UnstyledButton separator
controls at the column sides. The renderer measures only its owned root and
never reads or styles CodeMirror DOM. It clamps pointer/keyboard widths to
320–1920px and the available allocation, preserving centered geometry.
Keyboard Left/Right changes column width by 20px (80px with Shift); Home/End
choose the bounds. Escape, lost capture, pointer cancellation and unmount cancel
the temporary width. The controller owns persistence and error text.

Reference: the Owner's direct-resize request, existing quiet separator/focus
styles and [Mantine UI inputs](https://ui.mantine.dev/category/inputs/).
These are embedded controls without new panels, surfaces or layout providers.
The Owner's follow-up Workspace screenshot defines the correction: handles sit
at 50% of the editor height, with thin/short, 8%-opacity resting marks rather than
prominent lines beside the first content block. Hover/drag increases visibility;
keyboard focus retains its semantic indicator. Their owned root is observed for
the existing 640px compact breakpoint; viewport compactness and coarse primary
input also disable them. Controls are unmounted in these modes and active
previews are cancelled. Touch cannot start a drag. No Workspace DOM or private
presentation state is inferred; external geometry/surface ownership is unchanged.
Text Editor integration through Components is complete. Automated composed tests
cover preview, save, rollback, cancellation, keyboard and Vault changes; native
desktop mouse hit geometry, light/dark appearance, focus, mobile absence and short Workspace
acceptance remain manual.

`lunaris.task-checkbox` provides a controlled Mantine Core Checkbox for inline
Markdown tasks. Required public props: `checked: boolean`, `disabled: boolean`,
nonempty localized `label: string` (accessible name), and
`onChange(checked: boolean)`. Its default presentation is embedded/content. The
owned root uses inline-flex and normal containment so it adds no page surface or
extra region geometry. The consumer owns task text and document changes; the
role owns only the checkbox, active theme colors, hover/focus and disabled state.
State updates preserve input identity and keyboard focus. Checkbox CSS is included
in the shared styles entry point. No document, file or persistence access exists
in this renderer. Reference: shared settings-control theme conventions and
[Mantine UI inputs](https://ui.mantine.dev/category/inputs/), using the
[controlled Checkbox](https://mantine.dev/core/checkbox/). Text Editor mounts this
role through Components and handles renderer replacement through ComponentsChanged.
Targeted role and composed editor tests pass; native Space activation, visual
alignment, light/dark/disabled contrast, focus and wrapped task layouts remain
manual acceptance inside Workspace. See the
[task integration guide](../../text-editor/DOCS/README.md#interactive-task-checkboxes).

lunaris.text-editor supplies unavailable-state messages and editor recovery controls
and a stable owned CodeMirror target. Strings and callbacks come from the editor
controller through Components; this role contains no filesystem or editor state.
It confirms dirty reload before invoking onReload and preserves its target across
theme/status updates. It adds no card or background over Workspace main. See the
[role props, integration and manual acceptance](../../text-editor/DOCS/README.md).
Reference: existing Settings/open Workspace composition and Mantine UI catalog.

The editor is headerless at the Owner's request. Filename, saved status, mode
switch and Save controls are removed; only unavailable/loading messages and
conditional error recovery remain above the stable CodeMirror target. Autosave
and Mod-S belong to the controller/adapter and remain connected. The Owner's
highlighted Workspace screenshot defines the region to remove. No layout or SDK
contract additions are required. Verify the headerless composition and error
recovery manually in Workspace; native visual acceptance remains pending.

## Window titlebar role

`lunaris.window-titlebar` renders the owner's highlighted native-caption region
as a separate Mantine Paper with ActionIcon controls and Lucide minimize,
maximize/restore and close icons. Reference: the Owner's Lunaris screenshot,
existing shared quiet controls, and [Mantine UI buttons](https://ui.mantine.dev/category/buttons/).
The titlebar fills its allocated row with a flat, square surface in every theme;
the Owner explicitly requested this exception to the floating treatment of other
shell surfaces. No copied gallery composition or new runtime is added.

Required props: title, focused, maximized, canMinimize, canMaximize, canClose,
canDrag; localized minimizeLabel, maximizeLabel, restoreLabel, closeLabel;
onMinimize(), onToggleMaximize(), onClose(), onDrag(). All callbacks are supplied
by the SDK consumer; this renderer imports no window/native APIs. The title is
plain text with ellipsis and a full title tooltip. Buttons remain stable across
props/theme updates and unavailable actions are disabled. Drag starts only on the
left mouse button over the title area; double-click requests maximize/restore.
Buttons are outside that area, with keyboard-only focus and distinct press states.

Ownership: the root Slots container supplies vertical ordering and available
width. This role owns only titlebar surface, height and internal controls;
it neither covers nor recreates Workspace or startup screens. Its public default
presentation is standalone/content: the owned root paints the theme page background
behind the full-row caption so no host boot color leaks through on theme changes.
The caption has no external margins or rounded cutouts in any theme. In windowChrome
mode its blue themed surface and controls fill the same allocated row.
Caption text uses captionText, overriding the normal content text color. An
explicit embedded context remains transparent. Theme windowChrome caption colors are applied
only within this owned caption. The controller releases native chrome ownership
when the role disappears. Automated role tests cover interaction, stable controls,
localization props and theme updates. Native visual acceptance, dragging,
double-click, edge resize/snap, long titles, narrow/short windows and keyboard
focus in both themes remain manual checks in the real host.

Caption width correction: the Owner's follow-up screenshot exposed a caption
shrunk to its contents. The caption now grows across the row inside the UIKit-owned
flex root while retaining intrinsic height, the flat full-row surface and fixed-size actions.
The remaining width belongs to the title/drag area; controls align at the trailing
edge. No slot geometry, provider contracts or other plugin surfaces are changed.
A composed regression loads the actual stylesheet and checks width-growth and
content-height policy. Native geometry after this correction remains a manual check.

## Server account screens

lunaris.account-access uses the existing Vault Selector CardRow and Files footer
menu conventions. The role owns the page layout, authentication panel and catalog
list surface; its explicit embedded presentation stays transparent. AccountAccess
owns data, localized copy and operations through the public role props. The role
owns only create disclosure and Mantine menu state, including focus restoration.
References: [Mantine UI authentication](https://ui.mantine.dev/category/authentication/)
and [navbars](https://ui.mantine.dev/category/navbars/). There is no gallery runtime.
See [the controller guide](../../account-access/DOCS/README.md) for the integration.

## File Explorer action row

Between Tabs and the tree, four Mantine ActionIcon controls provide creation,
sorting and full expansion. Reference: the Owner's marked Files screenshot,
existing Files menu styles and [Mantine UI buttons](https://ui.mantine.dev/category/buttons/).
Lucide icons and localized controller labels follow the existing product pattern.
The row centers its four icons without separators.
It has no additional card or surface: Workspace owns panel geometry and
background; this embedded role owns controls and internal spacing only.

Optional public props: sortDirection ("asc" | "desc", default "asc"), expanding,
onSort(direction) and onExpandAll(): Promise<void>. Missing callbacks disable
their controls. Busy state or an open draft disables all actions; loading disables
creation/expansion, and expanding prevents repeated expansion. Sort uses a themed
Mantine Menu with a current-option check. Draft ordering follows sort direction
and keeps its initial name as its position key. Expand all opens the synthetic
root and delegates real directory traversal to the controller through Components.
Integration through Sidebar is complete. Behavior tests cover creation targets,
sort callbacks and disabled controls. Native visual acceptance remains pending:
both themes, open menu, selection/focus and narrow/short Workspace layouts.

The FigCraft Lunaris design code sets the desktop rail to 56px, the default tool
panel to 256px, and the status surface to a minimum of 32px. WorkspaceLayout owns these surfaces
and uses a single subdued divider at each shared desktop join. The Owner's
close-up of the desktop shell is the reference for the rounded panel top and
the workspace corners beside the panel and status bar. The panel owns its
top and side edges. Workspace draws the top and status joins on the main
surface. The title bar owns its window chrome. Explorer and Settings inherit the assigned panel and style
their internal selection, menus and controls using the active theme. The Vault
switcher uses a selection surface when its menu is open. Reference: the Owner's
Everforest Workspace screenshot and the original FigCraft surface hierarchy.
Existing Components and Themes contracts connect the layout, title bar, Explorer,
Settings and status bar. Native acceptance covers Everforest and Lunaris, including
open menus, focus and narrow Workspace allocations.

## Workspace bottom target

The Owner's desktop status-bar screenshot is the reference for the lower join.
Workspace rounds both bottom corners of the editor surface above a subtly
tinted footer. The status role uses muted labels and spacing between metrics.
When the panel is open, the editor owns the shared vertical edge and its curve
into the footer. The splitter hit area straddles the seam.
The existing bottom target and status role props connect the two surfaces.
Check the join with the Files panel open and closed in native acceptance.

WorkspaceLayout accepts optional bottomVisible and lends a stable bottom target beneath main within its pane. The layout owns Paper surface, spacing, corners and overflow. Embedded/content views inherit this surface. Files and the rail retain full height. Targets survive theme, visibility and prop updates.

## Status bar role

lunaris.status-bar renders a transparent embedded/content footer using Mantine Box, Group and Text. Its localized string props are label, filename, fileTitle, serverLabel, serverTitle, wordsLabel and lettersLabel. Numeric words/letters are nonnegative integers or null; serverState is connected/offline/expired/unknown or null. Null values omit their sections. The counts show their localized labels with a separator between them. The server indicator uses a Lucide icon. WorkspaceLayout owns the enclosing supporting surface beneath main; this role owns internal spacing and text only. Reference: the Owner's bottom-strip screenshot, existing Files footer and [Mantine UI footers](https://ui.mantine.dev/category/footers/). The view has no controls; names are escaped and truncated with full titles, and counts remain in one row at all widths. Its owned root grows horizontally with flex 1 1 auto and normal containment, keeping intrinsic height without collapsing the file area. No gallery runtime was added. See [integration and pending manual acceptance](../../status-bar/DOCS/README.md).

## Context-menu islands

The existing context-menu role renders public top-level island descriptors above
ordinary action rows. It owns one overlay composition, independent island/action
surfaces and themed Menu.Item/Menu.Sub interactions. Island children use Lucide
icons with localized title/aria-label, group arrows and focus/hover/pressed states;
submenu options retain readable labels. Providers/consumers never style the owned
DOM. Ordinary Explorer menus retain their layout. Text Editor supplies formatting
commands via ContextMenu 1.1; native visual acceptance of the composed island is
pending. Reference: existing Files menus, Owner's island request, Mantine Menu and
[Mantine UI buttons](https://ui.mantine.dev/category/buttons/). No gallery runtime.
The text-editor role additionally accepts optional localized commandError and
renders an accessible alert without file-reload actions.

The public task-list Lucide role maps to ListTodo for the editor Lists submenu.
It uses the same Menu.Sub action rows, localized labels, focus and theme as the
existing bullet/numbered list entries; no island geometry or ownership changes.

## Luna control completion

Reference: existing Windows XP Luna caption, Settings picker and Explorer toolbar,
plus [Mantine UI inputs](https://ui.mantine.dev/category/inputs/) and the
[Switch Styles API](https://mantine.dev/core/switch/). Luna Dark uses the same
owned roles with dark theme data. No React/Mantine imports or styling are added
to consuming plugins. Existing Themes/ThemeChanged integration is complete.

The control adapter now uses semantic colors for Switch tracks/thumbs and focus,
with square inset XP tracks, beveled slider thumbs, themed slider tooltips and
number steppers. Task checkboxes receive XP inset finishes and visible checked
boundaries. Caption actions use compact beveled controls with a semantic error
close action; disabled and inactive states retain readable colors. Explorer
toolbar hover/press, context islands and status metrics use the shared finishes.
Action gradients follow state backgrounds in the cascade; navigation, tab menus
and CardRow keep their own selection surfaces. Optional colors.link maps anchors
independently of primary button colors. Theme replacement removes XP finishes.

Ownership is unchanged: WorkspaceLayout owns rail/panel/bottom geometry and
surfaces; each embedded role styles its own controls and internal spacing only.
The real-preset regression verifies stable Settings inputs, opened Russian menus,
dark/light scheme propagation and transparent embedded roots. Automated tests
do not verify native appearance. Manual acceptance remains pending in Workspace:
both Luna presets and return to Monochrome; open theme/language/context menus;
slider, switch, checkbox and caption hover/press/focus/disabled states; editor
links; long Russian labels; narrow and short windows.

## Callout header role

`lunaris.callout-header` provides embedded/content Mantine controls for document
callouts. Required props: nonempty title, kind (`note`, `abstract`, `info`, `todo`,
`tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`),
foldable/collapsed booleans, nonempty localized toggleLabel/editLabel, onToggle()
and onEdit(). The chevron is an ActionIcon with aria-expanded; the title is an
UnstyledButton with the type's Lucide icon. Text is escaped and wraps; document
font metrics are inherited. State/theme/localization updates preserve controls
and focus. The role adds no document or outer surface and performs no editor or
filesystem operations. Callouts own line surfaces and source/disclosure changes.
Reference: existing task-checkbox/quiet action controls, Obsidian callouts and
[Mantine UI buttons](https://ui.mantine.dev/category/buttons/). Integration is
connected through Components and EditorExtensions; native visual acceptance is
pending as described in the [callout guide](../../callouts/DOCS/README.md).

Callout presentation correction follows the Owner's code-block card screenshot.
The header's note icon is Lucide Pencil; the editing title keeps a transparent
surface and unchanged text color on hover, and has no native edit tooltip.
It retains its accessible label and keyboard focus. The inherited document token
`--callout-color` supplies icon color with the shared accent fallback. The callout
contribution owns card boundaries, gutters and surfaces, while this role owns
only its controls. Native comparison in Workspace remains pending.

## Workspace keyboard ownership

WorkspaceLayout owns region geometry and surfaces; embedded roles own their controls. Workspace no longer captures document-wide Tab events. Native Tab/Shift+Tab traversal belongs to forms and controls; CodeMirror owns its own editor bindings. The reference is the existing Settings/Explorer/account controls. Public role tests cover embedded and sibling event propagation; real focus traversal in those composed forms remains manual acceptance.

## Recovery choices

The existing text-editor role accepts optional recoveryLabel, recoveryCandidates ({ id, label }[]) and onRecovery(id). It renders escaped, wrapping candidates as themed Mantine buttons and makes no implicit selection. Reference: the existing editor error/retry actions. The embedded role inherits Workspace surfaces and owns only internal controls; consumers own records, translations and persistence. Public-role and real editor/container behavior tests cover selection and read-only state. Native focus, long previews, theme contrast and narrow/short geometry remain manual acceptance items.

The public lunaris.mobile-menu role renders registered action descriptors; WorkspaceLayout lends its mobile-menu target and owns the floating surface. The former built-in sidebar action has been removed. See DOCS/reference/mobile-menu.md for registration and integration.

Workspace owns a top-left mobile-launcher surface separate from the bottom action row. The shared menu role uses normal inline containment to preserve its intrinsic width. Nested main-region scroll capture hides/shows the launcher by direction. Sidebar scrolling is ignored.

The Owner's highlighted bottom panel defines the position of the tab action.
The mobile-menu role accepts an optional count on an action descriptor. The
44px Mantine ActionIcon contains a rounded page outline with the current count.
The localized accessible name includes that number. WorkspaceLayout owns the
surrounding pill and mobile visibility. Actions with choices open a Mantine Menu
anchored to the trigger. It reuses the Files Vault switcher's menu surface and
Menu.Item rows. The selected row shares the Files active-file accent line and
selection surface. The Owner's annotated list defines the
dense rows and aligns the popup to the dock. WorkspaceLayout gives the dock 70%
of its allocated width, subject to the side gutters. The mobile role observes
its lent dock target and uses that width and center for the anchored popup.
The action group fills the dock and distributes its controls evenly across it.
Each row starts at 34px and grows with
theme typography. The mobile role sets the menu padding to two theme spacing
steps on all sides. The floating surface fits up to five rows and scrolls
internally above that limit, with a smaller cap in short viewports.
The renderer portals the menu to its own themed root to clear the
toolbar's scroll boundary. Active Screen supplies the choices and their callbacks
through the MobileMenu registry. Mantine owns keyboard navigation, dismissal
and focus return.
Each choice can supply a trailing action. The mobile role renders it as an
independent Mantine Menu.Item next to the tab label, with a localized name and
a 44px-wide touch target. Unavailable actions keep their position and are
disabled. A single row surface paints selected, hover and press feedback behind
the label and trailing action. Enabled controls participate in menu keyboard
navigation. A sortable choice uses the shared tab drag implementation on the
vertical axis. Mouse users can drag the label and touch users start at its
leading edge to preserve scrolling on the rest of the row. The mobile list has
no drag glyph or insertion line. Longer lists retain edge scrolling.
Alt+Up or Alt+Down on the label
moves a row by one position. The Active Screen role accepts compactTabs, supplied from the
owning Workspace context when its dock actions are available. It omits the tab
strip and the location/history row in that presentation. The Owner's phone
reference places history, creation and the horizontal tab counter in one
floating bottom pill. WorkspaceLayout owns the pill, theme panel color,
subdued separator and safe area offset. The mobile role owns the controls,
the popup's subdued separator and the 24 by 20px minimum
rounded outline with a 2px stroke.
Reference: [Mantine UI buttons](https://ui.mantine.dev/category/buttons/) and
[Mantine Menu](https://mantine.dev/core/menu/). Native visual acceptance of
the action, list, long names, themes and keyboard focus remains pending.

At editor allocations up to 640px, the editable file-name heading follows the
Owner's phone reference with a smaller 1.25–1.625rem title, weight 700 and a
compact line height. Its inset keeps the heading clear of the floating launcher.
The Owner's scroll screenshot is the reference for scrolling the title with the
document. The UIKit viewport contains both and supplies the larger mobile
gutters. The desktop presentation keeps the title above the CodeMirror scroller.
The shared text-editor role owns this styling. Document text and Markdown
heading metrics still come from CodeMirror.

Floating geometry correction follows the Owner screenshot: no top/bottom padding is added to main for mobile controls. Workspace owns absolute overlay surfaces; the mobile menu role receives explicit density compact for the 32px launcher and comfortable for the 44px bottom actions. Launcher surface padding is 2px. Manual acceptance of overlap, scroll/focus and both themes remains pending.

Both floating regions share scroll-direction visibility. The Sidebar layer and backdrop stack above both floating regions, which become inert and aria-hidden while the overlay is open. There is no main-area return button. Files and Settings explicitly close WorkspaceSidebar after successful content selection; failures preserve the panel for recovery. Tool switching itself keeps navigation available. Desktop selection remains intact. Native stacking and scroll/focus acceptance remain pending.

## Persistent Settings navigation

Reference: Owner screenshot of the compact Luna Settings page and existing sidebar icon controls. The Settings controller supplies localized navigationLabel/onNavigation through its page host to the public settings-page role. The UIKit header owns a compact 32px sidebar action at allocated widths <=640px and stays sticky inside Settings scrolling. The action selects the Settings tool and opens WorkspaceSidebar; it does not depend on the floating controls or their scroll visibility. No other plugin DOM is inspected or styled. Native acceptance remains pending in Luna and Monochrome: narrow/short Settings, scrolling, focus and reopening Sidebar then returning to Files.

## XP mobile control adaptation

Reference: existing Luna Explorer toolbar and Settings caption controls. WorkspaceLayout owns the floating menu/launcher surfaces, using XP radius, menu border and surface shadow. The mobile-menu and settings-page roles own their action controls: Luna button gradients, borders, bevels, hover/pressed/disabled states and existing semantic keyboard focus. MobileMenuView now receives theme tokens explicitly, preserving transparent embedded rendering instead of relying on an ancestor for token inheritance. Compact 32px launcher and 44px bottom actions, overlay positioning, scroll hiding and Sidebar stacking are unchanged. Luna Dark uses its own palette; switching to Monochrome removes XP finishes. Manual acceptance remains pending for both XP presets, focus/hover/press/disabled states, Settings navigation, scroll and many-item overflow in the actual Workspace.
