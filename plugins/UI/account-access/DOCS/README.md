# Account access

`createAccountAccess({ defaultOpen, defaultAddress, allowLocal })` provides
AccountAccess.visible/open/close and AccountAccessChanged. It consumes account
session/catalog services, FilesystemSources, Vault/VaultLocations, Startup,
Components, Slots/SlotDom, Localization and mandatory Logger through SDK contracts.

This controller owns a standalone screen slot only while visible, startup is
loaded and no Vault is active. It contributes the public lunaris.account-access
Mantine role; it does not import React, Mantine or another implementation.
The role owns the screen's content card and form layout. Workspace owns its own
surface after opening a Vault; the account screen releases its entire child scope.

Flows: connect -> sign in/register -> catalog -> open/create/trash/restore. The
server's registration policy controls the invitation field. Passwords remain
ephemeral form state and are cleared after submission. Session changes clear old
catalog entries before a new account can render. Browser defaults to the current
server; desktop can return to the local selector without restarting.

Catalog locations are wrapped through FilesystemSources.location('remote', ...)
before VaultLocations.open, preserving existing preparation and release guards.
The controller never interprets an opaque reference or bypasses the Vault manager.
Logger reports readiness and failed operations without credentials or note data.

References: existing Vault Selector forms/CardRow navigation and
[Mantine authentication compositions](https://ui.mantine.dev/category/authentication/).
The existing product theme controls sizing, input/focus/selection and surfaces.
Visual acceptance remains manual: check login/password visibility, registration
with/without an invitation, populated/empty/trash lists, long translations, focus,
themes, narrow/short windows and transition into the actual Workspace.
