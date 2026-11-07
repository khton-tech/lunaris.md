# Interface settings

Purpose: own immediate Vault-local language/theme preferences and contribute them
to Settings. Package `@lunaris/interface-settings`; plugin
`lunaris.interface-settings`. Factory: `createInterfaceSettings({ defaultThemeId })`.
The host supplies its registered default theme ID. English is the default locale.
This is a single interface-preference controller, independent of the startup
theme selector and the underlying replaceable theme/localization services.

## Contracts and persistence

Requires Logger, Config/ConfigChanged, Settings, Components, Localization/
LocaleChanged, Themes/ThemeChanged and Vault/VaultChanged through `ctx.use` and
SDK events. Grants: `config.access`, `vault.access`, `ui.dom`. Provides no API/events.
Registers category `lunaris.interface-settings.general` and section
`lunaris.interface-settings.preferences`, displayed as General / Interface.

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

The controller registers `lunaris.interface-settings-controls` as an orchestration
role. It receives Settings' explicit Workspace context and mount signal, delegates
to `lunaris.settings-choices`, and binds change/retry callbacks to that view and
Vault lifetime. Released callbacks cannot write settings. No React/Mantine or
another plugin implementation is imported.

Workspace owns the surrounding geometry/surfaces. Settings owns category navigation,
the main page and section targets/headings. The embedded/content Mantine role owns
only labeled controls, internal spacing and inline errors. It paints no outer
surface, card or border. A single available choice is rendered as text instead of
an input with no meaningful alternatives; multiple choices use Mantine NativeSelect.
Inputs survive locale/theme/section props updates. This follows the
[Mantine UI input compositions](https://ui.mantine.dev/category/inputs/) without
adding flags, decorative cards or a parallel component system.

## Integration and verification

Completed SDK connections: Settings registry/UI, Components/Mantine, Config,
Vault lifecycle, Themes, Localization and required Logger; Tauri registers, starts
and grants the controller. The startup theme plugin remains separate. File Explorer
is unchanged. Additional translations/palettes and runtime catalog discovery are
not implemented by this integration.

Run `npm run interface-settings:check`, the Tauri frontend build and documentation/
public-export audit. Tests exercise the composed Settings page, persistence,
live application, Vault isolation, stale reads/writes, errors/retry, restored values,
theme availability, retained inputs and inherited surfaces.

Native visual acceptance remains manual: open Settings > General in a disposable
Vault; verify Language/Theme and the available values, narrow/short windows, long
labels, focus and inherited surfaces. With additional registered catalogs/themes,
verify immediate selection and restoration across Vault changes/restart. Desktop
automation is prohibited; automated DOM tests do not prove WebView geometry.

Local evidence, 2026-11-07: targeted interface-settings, Settings UI, Mantine and
affected Tauri checks passed 108 tests, zero skipped, including builds, import
boundaries and type fixtures. Tauri production frontend build, documentation/
public-export audit and CI scope-selection test passed. Native visual acceptance
has not been performed.
