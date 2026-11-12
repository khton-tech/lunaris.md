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

Browser acceptance (2026-11-08): inspected the served production bundle in the
in-app browser with the test account. Verified sign-in, registration form, empty
and populated catalogs, opened account/Vault menus, recoverable trash/restore,
create disclosure and narrow-window composition with the Monochrome theme.
The trash name is display-only; Restore is its explicit action. Invitation-only
registration, alternate themes and the native desktop WebView remain manual
acceptance cases. Behavioral coverage includes escaped names, stable password
inputs, create cancellation/focus, trash/restore callbacks and real-server login,
creation, editing, draft recovery and shutdown.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and existing public component
props; no renderer translation or SDK change is required. Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.

## Server account UI refactor (2026-11-12)

Reference: existing local Vault Selector/CardRow and Mantine UI authentication
compositions (https://ui.mantine.dev/category/authentication/). Local selection
is unchanged. The account role owns standalone geometry and surfaces; its auth,
catalog and feedback components own internal content only. Authentication now
keeps its heading, fields, inline error and pending submit in one surface. The
page is top-anchored so registration and errors do not recenter the whole form.
Password and login use the same control sizing; login does not apply registration's
minimum password length. Username entry disables capitalization and spellcheck.

The controller supplies optional catalogState (loading/ready/error; omitted means
ready), with localized text.loading when loading. Failed reads offer retry and do
not claim an empty catalog. Route changes clear previous entries before loading;
responses are checked against request revision, route and session epoch. Session
changes clear password, invitation and creation drafts. Auth/catalog renderers
have separate lifetimes, so creation disclosure does not survive sign-out.

Integration uses existing Components, AccountSession, AccountVaults and
VaultLocations SDK contracts. No HTTP, disk layout, SQLite, note format or local
selector changes. Targeted role and real-server composition tests cover inline
errors, pending/error catalog states, retry and normal document operations.
Native visual acceptance is pending: web login/registration/invitation, opened
account/Vault menus, empty/populated/trash/error states, long Russian names,
keyboard focus, light/dark themes and narrow/short windows. Desktop automation
is prohibited; these states require an Owner browser check.

## Authentication visual alignment and responsive composition

The Owner requested the login page to match the application rather than an
independent website. References: local Vault Selector form density, shared UIKit
controls and Settings' Luna caption. Authentication owns one surface and heading;
branding is secondary. The catalog and local selector are unchanged. Desktop uses
a bounded 26rem panel and wrapping inline actions. At allocations up to 640px the
panel fills available width, starts at the top, and stacks full-width actions.
Mobile controls and password visibility have 44px targets. The outer role scrolls;
the content cannot shrink and no fixed height clips keyboard/short-screen content.
All spacing, colors, borders and caption finishes use existing theme tokens.
Embedded presentation does not receive standalone frame/shadow styling.

The title, labels and buttons use product typography. Password explicitly uses
the same md size as TextInput. Primary submit has no decorative arrow. Permanent
explanatory copy is removed; server address remains secondary context and password
reset guidance appears with login errors. Existing localized labels and SDK role
callbacks remain compatible; AccountSession/Vault integration is unchanged.

Targeted tests cover form/error placement, retained inputs through Monochrome and
both Luna presets, and existing catalog interactions. Native acceptance remains
pending: desktop versus 320/390/640px allocations, short landscape, keyboard-open
scrolling, long Russian labels, password visibility, focus and error states in
all three themes. DOM tests do not establish visual or native geometry acceptance.

## Public server identity

ServerInfo adds optional name (nonblank, max 80) and description (max 280).
Transport validates supplied fields; legacy discovery may omit them. AccountAccess
passes them as serverName/serverDescription through Components, rendered as plain
text above authentication. No address footer is shown. Mobile uses auto margins
to center the combined identity/form block when space permits, falling back to
scrolling when content exceeds the allocation. No storage changes. Integration
connects server discovery, transport, account controller and UIKit. Native mobile
centering, keyboard-open scrolling and long descriptions require manual acceptance.

## Server Vault selector reference adaptation

Reference: Owner's desktop local Vault Selector screenshot (two panels, 1:2
proportions, folder CardRows and centered ASCII artwork). AccountAccess's public
role owns both catalog regions and their surfaces. Desktop places server Vaults
on the left, creation/trash actions on the right; the host supplies existing art
through optional createAccountAccess.art and role art props. Consumers never read
asset paths. No new SDK service is needed. Existing AccountVaults/VaultLocations
integration remains responsible for all operations.

At allocations up to 640px the list comes first, actions follow, large artwork
is omitted, and the page owns scrolling rather than nested panels. Controls keep
44px touch targets. The account menu remains above both regions. Empty/loading/
error states, creation disclosure and recoverable trash retain their callbacks.
The local selector and authentication composition are unchanged. Native acceptance
is pending for desktop 1:2 geometry, mobile long lists, opened row/account menus,
creation focus, narrow/short allocations and theme replacement.
