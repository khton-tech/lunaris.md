# Localization service

## Responsibilities

Required: plugins obtain user-facing text through a replaceable language service,
ship English first, and add languages later without rewriting UI logic. Existing:
SDK APIs/events, cancellation signals and Logger. New: `@lunaris/localization`
contracts and `@lunaris/localization-manager` in `plugins/systems/localization`.
No SDK/kernel changes, platform access or external dependencies are needed.

The service owns catalog lookup, application locale and plain-text interpolation.
Each consumer owns its dictionaries, message keys and rendering. It does not own
UI, theme, settings, locale persistence or discovery/downloading of language packs.
It depends only on Logger and the SDK/contracts, so filesystem, Vault and Config
remain independent. Additional providers implement the same public contract.

Only English is shipped. Startup always selects `en`; there is no automatic OS
locale selection or language selector. Other catalogs in tests demonstrate future
extension, not installed product languages. Locale persistence and its settings
integration can be added separately when multiple product languages are available.

## Consumer API

Add the `@lunaris/localization` package and require
`api:lunaris.localization@^1.0.0` in the plugin manifest. No additional permission
is required for these trusted local string catalogs. Keep English in a dedicated
file such as `src/locales/en.ts` rather than embedding copy in UI code.

```ts
import { Localization } from "@lunaris/localization";
import { english } from "./locales/en.js";

// During activate(ctx); the plugin also declares/uses its required Logger.
const language = ctx.use(Localization);
const registered = language.register(ctx.pluginId, { en: english }, ctx.signal);
if (!registered.ok) throw new Error(registered.error.message);

// When rendering or handling a user action:
const text = language.text(ctx.pluginId, "filesOpened", { count: 3 });
// english.filesOpened = "Opened {count} files"
```

| Method | Behavior |
|---|---|
| `register(pluginId, catalogs, owner)` | Register one namespace until the owner signal aborts. Requires a nonempty `en` dictionary. Returns a result. |
| `text(pluginId, key, parameters?)` | Return the selected translation, English fallback, or `[pluginId:key]` if neither exists. |
| `locale()` | Current canonical locale, initially `en`. |
| `locales()` | Frozen sorted snapshot of registered locales, always including `en`. |
| `setLocale(locale)` | Select a registered locale; canonicalize casing; return a result. Re-selecting the current locale emits nothing. |

`LocalizationResult` is `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`. Codes are `INVALID_ARGUMENT`,
`ALREADY_REGISTERED` and `UNSUPPORTED_LOCALE`. Invalid registration is atomic;
duplicate namespaces cannot overwrite a live catalog. Unknown locales preserve
the current selection. SDK declaration/lifecycle failures retain SDK behavior.

Namespaces are canonical plugin IDs; use `ctx.pluginId`. This is attribution, not
caller authentication: the SDK does not expose caller identity to API providers.
Catalogs are copied at registration; later input mutations cannot alter text.
Only plain string dictionaries are accepted; accessors and reserved keys are
rejected. English defines the key set; other languages may omit keys but cannot
introduce keys absent from English. Empty translated strings are intentional.

## Lookup and formatting

Locale tags use `Intl.getCanonicalLocales`. Lookup selects the exact locale and
then English: `fr-CA` does not implicitly select `fr`. Missing translations and
keys log a warning once per namespace/key/locale; missing parameters warn once
per parameter too. Registration/unload and locale changes reset this suppression.
Parameter values and message contents are not logged.

Templates substitute `{name}` placeholders whose names match
`[a-zA-Z][a-zA-Z0-9_]*`. Values are strings or finite numbers, including `0` and
empty strings. Missing/invalid parameters leave the placeholder visible. Parameter
accessors are not executed, inherited properties are ignored and substitution is
not recursive. Extra parameters are ignored. Templates are plain text, not HTML;
render through text nodes or framework text interpolation, never `innerHTML`.
Pluralization, ICU syntax, date/number formatting and rich text are deferred.
Avoid concatenating sentence fragments or manually adding plural suffixes in UI.

Require `event:lunaris.locale-changed@^1.0.0` to subscribe through
`ctx.events.on(LocaleChanged, handler)`. Successful changes emit
`{ previous, current }` after committing the selection; listeners re-read text.
Events follow SDK asynchronous delivery and lifecycle rules. There is no catalog
change event: register catalogs during activation and render after registration.

## Ownership and existing text audit

Pass `ctx.signal` or an owned child scope's signal. Aborting it synchronously
releases the namespace, allowing re-registration on restart. Cleanup only changes
local state and detaches listeners; it never invokes SDK handles. Stopping the
provider detaches remaining listeners and clears its state. Closed consumer
handles cannot be reused. Unloading the last catalog for the selected language
preserves the locale across plugin reloads; remaining catalogs use English until
translations return. Therefore `locale()` may temporarily be absent from `locales()`.

The existing Logger, DevTools sink, filesystem provider/driver, Vault Manager and
Config Manager contain no product UI copy. Their English logs, failure codes and
diagnostic messages remain technical data, without a localization dependency.
Future presenters should map failure codes to their own localized user messages;
they must not show raw diagnostic errors as product copy or use error messages
as translation keys. File names, Vault names and user content are not translated.

The Tauri recovery shell is host infrastructure. Its English messages now live in
`hosts/tauri/src/locales/en.ts`, accessed through its typed local catalog. It must
remain readable before startup and when localization or Logger fails, so it does
not call the product localization service. No visible layout changes are made.

## Composition and verification

The separate [interface settings controller](../../plugins/UI/interface-settings/DOCS/README.md)
now persists and applies a Vault-local locale through this API. Localization
itself remains independent of Config/Settings; only English ships by default.
The controller uses an activation-time locale snapshot, without claiming a
catalog-availability event or runtime language-pack discovery.

Tauri registers and starts localization alongside Config Manager. Logger starts
as a dependency. Future consumers import contracts, never the provider or host.

Run `npm run localization:check` for contracts, service, SDK consumer lifecycle,
host recovery, types and package boundaries. Run
`npm run build --workspace @lunaris/tauri` for the frontend bundle. Tests install
English-only consumer catalogs and exercise a partial additional language as a
fixture; no windows or native dialogs are opened.
