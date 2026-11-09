# Interface settings

Purpose: own immediate Vault-local language/theme preferences and contribute them
to Settings. Package `@lunaris/interface-settings`; plugin
`lunaris.interface-settings`. Factory: `createInterfaceSettings({ defaultThemeId })`.
The host supplies its registered default theme ID. English is the default locale.
This is a single interface-preference controller, independent of the startup
theme selector and the underlying replaceable theme/localization services.

## Contracts and persistence

Requires Logger, Config/ConfigChanged, Settings 1.2, Localization/
LocaleChanged, Themes/ThemeChanged and Vault/VaultChanged through `ctx.use` and
SDK events. Grants: `config.access`, `vault.access`. Provides no API/events and
registers no Components role. Registers category `lunaris.interface-settings.customization`,
group `lunaris.interface-settings.preferences` and two `select` items:
`lunaris.interface-settings.locale` and `lunaris.interface-settings.theme`.
The hierarchy is Customization / Interface / Language and Theme. Each item declares
its title, type, inline layout, order, value, options, disabled/error state and
change handler through Settings registration; none of this structure is in Config.

The category replaces the former General UI contribution; no other shipped plugin
references that category ID. The Config namespace and `locale`/`theme` keys are
unchanged, so saved choices require no migration. The controller still requires
no Components dependency or DOM permission.

The plugin reads/writes only its own namespace with explicit
`{ scope: "vault", vaultId }` targets. It never reads global/effective preferences.

```toml
[plugins."lunaris.interface-settings"]
locale = "en"
theme = "lunaris.base-theme-engine.monochrome"
```

The legacy `lunaris.theme-settings.theme` remains startup configuration; there is
no automatic migration or fallback from it into this namespace. Tauri starts the
new controller after startup theme selection and normal product registration.

On Vault opening/switching, reset to English and the host default, then restore
that Vault's preferences without requiring Settings to be opened. Closing a Vault
restores those defaults. Missing keys use defaults. Invalid/unavailable choices
are preserved in storage, with default behavior, a localized warning and logging.
Read failures show Retry. ConfigChanged reloads only matching Vault/namespace/keys;
external file edits do not produce that event and are read on a later reload.

Language choices are the registered locale snapshot at controller activation,
displayed through Intl.DisplayNames in the current language. English-only product
catalogs remain English through normal fallback; this integration adds no language
packs. Runtime catalog discovery remains outside Localization's existing contract.
Changes require restart to refresh that availability snapshot.

Theme choices follow the live Themes registry and use author-supplied names.
The selector supports the documented `lunaris.base-theme` schema version 1 used
by the current Mantine adapter; it does not claim arbitrary theme compatibility.
New registrations, replacements and removal refresh choices and restore the saved
selection if it becomes available again. Only Monochrome ships by default.

Accepted changes apply immediately, without Apply or restart. Controls are busy
until the explicit Vault write completes, rejecting duplicate/concurrent edits.
Persistence failure restores the previous choice and shows a retryable error;
the user can select again. Vault/session epochs and read revisions reject stale
results. An already accepted write may complete in its original Vault after the
view closes; it cannot update another Vault. Cleanup makes no SDK calls.

## Rendering and ownership

The controller updates group/item presentation through `updateGroup`/`updateItem`.
Settings supplies the explicit `{ vaultId, signal }` context to change/retry
handlers and owns item-view cancellation, type validation and callback invocation.
The controller checks that context before using its current Vault session.
Released callbacks cannot start writes. No Components, React/Mantine, DOM or
another plugin implementation is imported.

Workspace owns the surrounding geometry/surfaces. Settings owns category navigation,
the main page and group targets/headings. The embedded/content Mantine role owns
only labeled controls, internal spacing and inline errors. It paints no outer
surface, card or border. A single available choice is rendered as text instead of
an input with no meaningful alternatives; multiple choices use the shared themed Mantine Select.
Inputs survive locale/theme/item presentation updates. Rows wrap on narrow
containers; registered `inline` layout puts labels and controls beside each other
when space permits. This follows the
[Mantine UI input compositions](https://ui.mantine.dev/category/inputs/) without
adding flags, decorative cards or a parallel component system.

## Integration and verification

Completed SDK connections: Settings 1.2 registry/UI, Config,
Vault lifecycle, Themes, Localization and required Logger; Tauri registers, starts
and grants the controller. The startup theme plugin remains separate. File Explorer
is unchanged. The Settings container supplies the Components/Mantine connection;
the preference controller requires no DOM grant. Additional translations/palettes
and runtime catalog discovery are not implemented by this integration.

Run `npm run interface-settings:check`, the Tauri frontend build and documentation/
public-export audit. Tests exercise the composed Settings page, persistence,
live application, Vault isolation, stale reads/writes, errors/retry, restored values,
theme availability, retained inputs and inherited surfaces.

Native visual acceptance remains manual: open Settings > Customization in a disposable
Vault; verify Language/Theme and the available values, narrow/short windows, long
labels, focus and inherited surfaces. With additional registered catalogs/themes,
verify immediate selection and restoration across Vault changes/restart. Desktop
automation is prohibited; automated DOM tests do not prove WebView geometry.

Verification evidence for declarative registration is recorded in the
[Settings reference](../../../../DOCS/reference/settings.md). Native visual
acceptance has not been performed.
