# browser-navigation

Browser update integration through public ClientUpdates/ClientUpdateChanged and
ApplicationReload contracts. Required Logger records readiness, availability
changes and failures without polling noise or sensitive data.

The service compares immutable server and client build IDs. The UI owns one
transient standalone/content notice slot; Mantine owns its surface and controls.
Reload first closes the Vault through existing save/draft guards. The navigation
driver owns actual browser reload and beforeunload protection for edits without
an acknowledged local draft. Scope cleanup releases listeners/timers only.

Composed only for browser navigation; server bundle notices do not imply a desktop
binary update. Manual checks: updated bundle notice, save/conflict/offline states,
narrow layouts, themes and native reload confirmation remain pending.
