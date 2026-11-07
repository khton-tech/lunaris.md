# Sidebar

## Responsibilities

Sidebar is a separate product plugin (`lunaris.sidebar`, `plugins/UI/sidebar`),
not a Workspace feature implementation. It binds a public tab service to Workspace
regions. The separate portable provider (`lunaris.sidebar-provider`,
`plugins/UI/sidebar-tabs`) owns registration, selection and tab lifetimes.
Mantine components renders the rail; tool plugins own their content and business
logic. No explorer, search engine or document/editor implementation is included.

Existing services: Logger, Localization, Workspace/WorkspaceChanged, Components
and scoped SDK ownership. Added: `@lunaris/sidebar` API/event contracts, the tab
provider, the Sidebar controller and Mantine rail/layout roles. Workspace's public
API is extended to 1.1.0 with `main`, `left-rail` and `left-panel` regions.
No SDK/kernel runtime or slot-driver changes are needed. Rendering stays inside
the public Components contract, including borrowed composite layout targets.

## Tab API

Sidebar API 1.1 adds optional `placement: "start" | "end"` (default start).
End tabs form a bottom-aligned rail group, independent of numeric order. Order is
local to each group; snapshot and keyboard order follow visual start/end order.
Presentation updates preserve placement. Existing 1.0 consumers remain compatible.

Import `Sidebar` from `@lunaris/sidebar` and require
`api:lunaris.sidebar@^1.0.0`. Registration needs no DOM permission. All product
consumers must also require Logger and use it with their own plugin ID.

```ts
const sidebar = ctx.use(Sidebar);
const result = sidebar.register({
  id: `${ctx.pluginId}.navigation`,
  title: localization.text(ctx.pluginId, "navigation"),
  icon: "files",
  componentId: "lunaris.file-explorer",
  order: 10,
  props: { filter: "" },
}, ctx.signal);
if (!result.ok) {
  logger.warn(ctx.pluginId, "Cannot register sidebar tab", {
    code: result.error.code, error: result.error,
  });
}
```

The default file-explorer controller now registers this role with its full props.
The snippet above illustrates tab registration only; use the
[file explorer contract](file-explorer.md#renderer-contract) for actual renderer props.
Supply a real role
through the Mantine component plugin, following [its guide](../../plugins/UI/mantine-components/DOCS/README.md).
Neither a tool plugin nor Sidebar imports React/Mantine or another plugin's
implementation. Content roles receive their props plus Workspace's frozen
`workspace: { vaultId, vaultName }` context and a per-view ownership signal.

| Method | Behavior |
|---|---|
| `register(tab, owner)` | Add an owned ID, localized title, icon name, component role, optional props and order (default 0). Duplicate IDs fail. |
| `update(id, { title, icon, props? })` | Replace title/icon/props; preserve ID, component role, order and active state. Omitted props become empty. |
| `select(id)` | Open a registered tab. Re-selecting is idempotent at API level. |
| `select(null)` | Collapse the panel while retaining the icon rail. |
| `snapshot()` | Frozen `{ tabs, activeId }`, ordered by order then registration order. |

Results are `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`; codes are `INVALID_ARGUMENT`,
`ALREADY_REGISTERED`, `NOT_FOUND`. Descriptions/props must be plain data-property
records. Dotted IDs, nonempty title/icon and safe-integer order are required.
Reserved `workspace` props are rejected. Records/top-level props are copied and
frozen; nested values and callbacks retain identity, matching Components semantics.
IDs provide attribution rather than authenticated caller isolation.

The first tab opens automatically. Adding more tabs preserves the current selection
or deliberate collapse. Removing the active tab selects the first remaining tab
in sorted order; removing another tab leaves selection alone. Removing the last
tab removes both sidebar regions. Owner cancellation removes a registration;
providers use their own live SDK event context for cleanup notifications and
never invoke Workspace/renderers/Logger during owner cleanup.

`event:lunaris.sidebar-changed@1.0.0` publishes a frozen snapshot after registration,
update, selection or removal. Observers subscribe before reading `snapshot()`.
Tool plugins normally need only the API. On locale changes, tools update their own
localized title and content props. The Sidebar catalog owns navigation and
unavailable-panel labels; tab content localization remains tool-owned.

## Interaction and mounting

The left rail contains only Mantine ActionIcon controls and Lucide icons. Titles
are accessible names and native tooltips. `aria-pressed`/`aria-expanded` expose
persistent active state independently of hover. Arrow Up/Down and Home/End move
focus without selecting; Enter/Space use native button activation. Repeating the
active icon collapses the panel. Escape from the layout dismisses an open panel
and focuses the active icon before content is removed.

Icon roles include `files`, `folder`, `browse`, `search`, `outline`, `settings`
and `package`. Unknown names use PackageOpen rather than dynamic module loading
or arbitrary SVG/HTML. New visual roles can be added to Mantine components.

Sidebar registers its rail and selected content through Workspace 1.1's public
regions. It owns child scopes for those registrations, replacing only selected
content when switching tabs. Workspace owns the actual mounting/Vault lifecycle
and geometry. It renders left regions beside the main column; narrow containers
show the left panel as a nonmodal overlay inside the owned layout. The rail remains
available, Escape closes the overlay, and each region owns scrolling with hidden
native scrollbar chrome. No portals escape the component target or host surface.

No tabs means no rail, panel, reserved width or default demo tools. Missing content
roles retain their tab and show a localized unavailable panel. Later/replacement
roles mount automatically; renderer failures show a Workspace-owned failure
placeholder and are retried on subsequent relevant updates. Removing the rail
role releases Sidebar's region registrations until a replacement appears.

Switching Vaults cancels mounted views and provides fresh Vault context; tab
registrations/selection persist for the plugin activation. Collapse/switch/removal
unmounts content: tools must retain logical drafts/state outside their view and
honor its cancellation signal. No file reads, document persistence, tab session
persistence or plugin-specific tools are added here. Shared panel resizing and its
Config preference are owned by the Workspace layout/controller, independently of
tab registration and selected-tool state.

## Integration and verification

Completed: Tauri registers/starts Sidebar, resolves its tab provider through the
SDK and grants only `ui.dom` to the controller. Sidebar consumes Workspace 1.1,
Components/ComponentsChanged and Localization/LocaleChanged. Workspace contains
no Sidebar imports, tab registry or active-tab state. Mantine supplies
`lunaris.sidebar-rail` and `lunaris.workspace-layout`, scoped to the selected theme.
Existing default-main Workspace consumers remain compatible. The file-explorer tool is now composed by Tauri and registers through this public
Sidebar contract, without private layout targets. Other tools follow the same rule.

Run `npm run sidebar:check` for contracts/types, provider ownership/restart,
validation/order, rail selection/collapse/keyboard focus, missing/replacement/failing
roles, independent main content, layout replacement, Vault transitions and cleanup.
Run the Tauri frontend build and the CI scope/export/documentation audits.
Automated tests use JSDOM; desktop automation is prohibited.

Manual acceptance: run `npm run tauri:dev` and open a Vault. Without tool plugins,
Sidebar must remain hidden and Workspace's main placeholder must remain visible
when the file-explorer tool is excluded. With default composition, its Files tab
and tree must be visible; the main placeholder remains until document UI exists.
For a real tool consumer (or an explicitly composed development fixture), verify
icon-only rail, accessible tooltips, active state, collapse/reopen, keyboard/Escape,
long translated titles, short/narrow windows, nonmodal overlay, theme changes,
consumer removal and Vault switching. Native WebView geometry remains manual.

The supporting navigation rail and selected tool panel now have separate
card-like Mantine Paper surfaces owned by WorkspaceLayout. Theme-derived margins
and radii separate them from the open main workspace. Tool views inherit the
card surface; the main area has no card shell or decorative inset. On narrow
containers the overlay retains its card corners and outer spacing. The SDK
regions/targets, registration and selection contracts are unchanged.
