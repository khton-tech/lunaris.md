# Settings registry

Purpose: a replaceable portable registry of categories and section contributions.
The default export of `@lunaris/settings-provider` is `lunaris.settings-provider`.
Requires Logger; provides Settings and SettingsChanged 1.0 from `@lunaris/settings`.
Subscribes to no events. It owns no UI, values, storage or system integrations.

Public methods: `registerCategory(category, owner)`, `registerSection(section,
owner)`, `updateCategory(id, { title })`, `updateSection(id, { title, props? })`,
`snapshot()`. All registrations are owned. Categories and sections have independent
lifetimes; sections may precede their category and remain registered after its
removal. Snapshot categories/sections are ordered and immutable. Events publish
committed snapshots after changes without awaiting observers.

See [the SDK reference](../../../../DOCS/reference/settings.md) for validation,
errors, extension examples and lifecycle rules. Readiness and mutations use the
required Logger. Cleanup only detaches local owners and publishes through this
provider's own live event endpoint. Run `npm run settings:check`.
