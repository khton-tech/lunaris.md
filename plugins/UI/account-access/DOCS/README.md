# Account access

`createAccountAccess({ defaultOpen, defaultAddress, allowLocal })` provides
AccountAccess.visible/open/close and AccountAccessChanged. It consumes account
session/catalog services, FilesystemSources, Vault/VaultLocations, Startup,
Components, Slots/SlotDom, Localization and mandatory Logger through SDK contracts.

This controller owns a standalone screen slot only while visible, startup is
loaded and no Vault is active. It contributes the public lunaris.account-access
Mantine role; it does not import React, Mantine or another implementation.
The role owns the screen geometry, authentication form surface, catalog list
surface and internal controls. The catalog heading remains on the page surface. Workspace owns its own
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

Create immediately opens the new Vault through VaultLocations with the requested
name, matching local creation. If preparation fails, the created catalog record
remains available for retry rather than being destructively rolled back.

## Account screen composition

The reference is the existing Vault Selector CardRow navigation and Files footer
menus, with Mantine UI authentication forms and navbars reviewed for composition.
Authentication uses a compact form surface, a single primary submit action and a
secondary sign-in/register switch. The server address and password-reset guidance
are subordinate footer context. Catalog actions are separated into the main Vault
list, a collapsible create form, a Trash route, refresh and a themed account menu.
Per-Vault menus contain recoverable trash; trash rows expose restore and expiry.
Create drafts survive closing the form; Escape/Cancel returns focus to its toggle.
Hidden forms are inert and cannot submit. All copy comes from Localization.

Integration: account-access supplies the additional localized text through the
existing public Components role; Mantine owns rendering and local disclosure/menu
state. AccountSession, AccountVaults and VaultLocations remain the operation owners.
No host-specific DOM selectors, private imports or new SDK APIs are required.
The shared role applies to web and the desktop server sign-in flow; local Vault
Selector and the Customization settings page are unchanged.
