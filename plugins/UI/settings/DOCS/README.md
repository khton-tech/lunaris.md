# Settings window

`@lunaris/settings-plugin` (`lunaris.settings`) presents contributed settings for
the current Vault. The plugin exposes no API or events. Contributors register
categories, groups and items through `@lunaris/settings`. Legacy sections can
still contribute a Components role.

The desktop Sidebar 1.2 action uses the bottom rail position. The compact
layout provides the same action in `MobileMenu`. It opens the Settings view in
Workspace 1.6's `overlay` region. Desktop shows categories alongside the initial
or selected page. Compact mode opens the category list and provides Back from
each category. Closing returns to the underlying workspace and restores focus.

Workspace owns overlay placement, background interactivity and Vault lifetime.
The Mantine `lunaris.settings-window` role owns the themed window, its backdrop
and title bar, its category region and its borrowed page and popup targets.
Settings owns category selection and section composition. Mantine renders page
headings and intrinsic controls in their assigned targets. Dropdowns and the
Lime details and preview dialogs stay inside the window's popup target. The
existing Settings category rows and Lime dialogs define the product references.
See [Mantine Modal](https://mantine.dev/core/modal/).

Settings subscribes to `SettingsChanged`, `ComponentsChanged`, `LocaleChanged`
and `VaultChanged`. It uses required Logger, Settings, Sidebar, Workspace,
Components, Localization and Vault, plus optional MobileMenu. The shared web and
desktop hosts already compose these integrations. Custom hosts need the Sidebar
controller and Mantine roles for desktop, and MobileMenu for the compact action.
Custom workspace layouts supply their own entry regions.

Edits and localization or theme changes within one selected category preserve
mounted inputs. Changing categories, going back in compact mode, closing the
window or changing Vaults releases the affected section views. Settings passes
the frozen Workspace context and an owned cancellation signal. Declarative item
callbacks receive `{ vaultId, signal }`; individual removal also aborts that
item's context. Missing sections show localized placeholders and can recover.
Preference values and accepted writes remain the responsibility of contributors.

Manual acceptance in the running application covers desktop and compact window
geometry, category and page scrolling, keyboard and touch focus, nested popups,
the virtual keyboard and theme changes. See the
[settings reference](../../../../DOCS/reference/settings.md) for the extension API.
