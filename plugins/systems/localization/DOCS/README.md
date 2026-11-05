# Localization manager plugin

`@lunaris/localization-manager` provides per-plugin dictionaries, English fallback,
plain-text parameter substitution and application locale selection. It requires
the Logger API and has no platform, filesystem, Vault or Config dependency.

Consumers import `Localization` from `@lunaris/localization`, declare
`api:lunaris.localization@^1.0.0`, register `{ en: english }` with their plugin ID
and owner signal, and call `text(pluginId, key, parameters?)`. English is required;
catalogs are removed automatically when the owner stops. The other methods are
`locale()`, `locales()` and `setLocale(locale)`.

The plugin provides `event:lunaris.locale-changed@1.0.0`, with
`{ previous, current }`; subscribers declare it and use `ctx.events.on`. It has
no incoming event or hook subscriptions. Only English is shipped. Technical
logs/errors are not localized; product UI copy belongs to consumer catalogs.

See the [complete API and lifecycle reference](../../../../DOCS/reference/localization.md)
for examples, fallback, errors, ownership, formatting limits and host recovery.
Run `npm run localization:check` from the repository root.
