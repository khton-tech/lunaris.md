# Mantine components

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
renderer/controller is unchanged. Category rows use a generic settings icon;
category-specific icon registration is not introduced by this change.

Both declarative and legacy settings dropdowns use `SettingsSelect`, built on
Mantine Select/Combobox. Its trigger, listbox, selected/hovered options and check
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
Settings 1.1 items. Props: `items: SettingsItem[]`, `onChange(id, value)` and
`onRetry(id)`. It interprets public `type`, `title`, `description`, `layout`, controlled
`value`, options/constraints, `disabled`, `error` and retry presentation. It calls
the supplied host callbacks, never the contributed item callbacks directly.
Select/switch/text/number map to the shared themed Mantine Select/Switch/TextInput/NumberInput.
A sole matching select option is plain text. Item IDs retain row/input identity;
labels, descriptions and errors are linked accessibly. Inline rows wrap naturally;
`stacked` puts the control below its label. The container owns surrounding surfaces
and group headings. The role owns internal controls/spacing only.

`lunaris.settings-choices` remains as a legacy embedded/content role. New settings
must use the declarative registration contract. Its props:
`fields: { id, label, value, options: { value, label }[] }[]`, `disabled`, localized
`error`, `retryLabel`, `canRetry`, `onChange(id, value)` and `onRetry()`. Field/option
IDs are unique; values/labels are strings. Multiple choices use the shared themed Mantine Select;
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
owns the blue outer frame/caption and compact region grid. Embedded role roots
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

Added on 2026-11-07: `lunaris.active-screen` supplies a borderless full-size Mantine
Box composition, with no tab strip, header or card shell. Props: `ids` (unique
strings), `activeId` (one of those IDs or null), and `onTargets(map | null)`.
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
`lunaris.settings-page` renders title, emptyLabel and section headings, lending
stable targets through onTargets(map or null). Both use the active theme and local
scrolling. The page has no enclosing card; the Sidebar view inherits its surface.
Section control roots use intrinsic block sizing inside targets owned by this set.
No concrete settings, storage or theme controls are supplied. See
[the settings reference](../../../../DOCS/reference/settings.md). Compositions were
reviewed against [Mantine UI navbars](https://ui.mantine.dev/category/navbars/).

## Text editor role

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
The intentional difference is theme-derived spacing, a rounded supporting surface
and no OS-painted caption. No copied gallery composition or new runtime is added.

Required props: title, focused, maximized, canMinimize, canMaximize, canClose,
canDrag; localized minimizeLabel, maximizeLabel, restoreLabel, closeLabel;
onMinimize(), onToggleMaximize(), onClose(), onDrag(). All callbacks are supplied
by the SDK consumer; this renderer imports no window/native APIs. The title is
plain text with ellipsis and a full title tooltip. Buttons remain stable across
props/theme updates and unavailable actions are disabled. Drag starts only on the
left mouse button over the title area; double-click requests maximize/restore.
Buttons are outside that area, with keyboard-only focus and distinct press states.

Ownership: the root Slots container supplies vertical ordering and available
width. This role owns only titlebar surface, height, margin and internal controls;
it neither covers nor recreates Workspace or startup screens. Its public default
presentation is standalone/content: the owned root paints the theme page background
behind caption margins so no host boot color leaks through on theme changes.
In windowChrome mode the caption has no external margins or rounded cutouts: its
blue themed surface fills the entire allocated row to the top and both side edges.
Caption text uses captionText, overriding the normal content text color. An
explicit embedded context remains transparent. Theme windowChrome caption colors are applied
only within this owned caption. The controller releases native chrome ownership
when the role disappears. Automated role tests cover interaction, stable controls,
localization props and theme updates. Native visual acceptance, dragging,
double-click, edge resize/snap, long titles, narrow/short windows and keyboard
focus in both themes remain manual checks in the real host.

Caption width correction: the Owner's follow-up screenshot exposed a caption
shrunk to its contents. The caption now grows across the row inside the UIKit-owned
flex root while retaining intrinsic height, theme-dependent margins and fixed-size actions.
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

## Workspace bottom target

WorkspaceLayout accepts optional bottomVisible and lends a stable bottom target beneath main within its pane. The layout owns Paper surface, spacing, corners and overflow. Embedded/content views inherit this surface. Files and the rail retain full height. Targets survive theme, visibility and prop updates.

## Status bar role

lunaris.status-bar renders a transparent embedded/content footer using Mantine Box, Group and Text. Its localized string props are label, filename, fileTitle, serverLabel, serverTitle, wordsLabel and lettersLabel. Numeric words/letters are nonnegative integers or null; serverState is connected/offline/expired/unknown or null. Null values omit their sections. Lucide icons replace captions, with numbers still visible and localized title/accessible labels retained. WorkspaceLayout owns the enclosing supporting surface beneath main; this role owns internal spacing and text only. Reference: the Owner's bottom-strip screenshot, existing Files footer and [Mantine UI footers](https://ui.mantine.dev/category/footers/). The view has no controls; names are escaped and truncated with full titles, and counts remain in one row at all widths. Its owned root grows horizontally with flex 1 1 auto and normal containment, keeping intrinsic height without collapsing the file area. No gallery runtime was added. See [integration and pending manual acceptance](../../status-bar/DOCS/README.md).

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
