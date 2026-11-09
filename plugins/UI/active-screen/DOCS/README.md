# Active screen container

Purpose: display one selected screen inside Workspace main, preserving previously
opened screen instances while hidden. Plugin `lunaris.active-screen` is exported
as the default from `@lunaris/active-screen-plugin`.

Requires Logger, ActiveScreen/ActiveScreenChanged, Workspace 1.1,
Components/ComponentsChanged and Localization/LocaleChanged. The host grants
`ui.dom`. No Config, file access, editor implementation or settings implementation
is included.

On activation it registers the orchestration role `lunaris.active-screen-host`
through Components and one main content entry through Workspace. It provides no
additional APIs or events. It subscribes to ActiveScreenChanged, ComponentsChanged
and LocaleChanged. Every rendered host instance owns its layout, per-screen scopes
and placeholders. Workspace cancellation releases them on Vault switch or closure.

Mantine's `lunaris.active-screen` role supplies stable child targets. The controller
mounts child roles only after layout mount/update returns, passing each screen's
props plus Workspace context. Only previously selected screens are mounted.
Switching hides and makes inactive targets inert, removes hidden focus, and retains
the instance, input drafts and scroll. Null selection shows the localized empty
state. Unavailable or failed selected roles show a localized failure state; later
registration or props updates can recover. Renderer replacement can lose local
view state and is outside the retention guarantee.

Consumers use only `@lunaris/active-screen`; they must not import this plugin or
manipulate its DOM. See [usage and limits](../../../../DOCS/reference/active-screen.md).
Run `npm run active-screen:check` and the Tauri frontend build. Native geometry
and focus behavior require manual acceptance; desktop automation is prohibited.

The controller supplies `presentation: { mode: "embedded", sizing: "fill" }` to
its layout, screens and placeholders after custom props. Screen roots inherit the
Workspace surface, independently of their target DOM.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and existing public component
props; no renderer translation or SDK change is required. Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.
