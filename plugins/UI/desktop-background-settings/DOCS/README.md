# Desktop background settings

In desktop Settings, open **Application → Desktop** to change **Run in background**.
The switch defaults to off and applies immediately. It persists the boolean
`runInBackground` in the global `lunaris.desktop-background-settings` Config
namespace. The same preference applies across Vaults and is loaded at startup.

The controller registers one declarative switch through Settings 1.2, following
the existing inline preference rows used by Interface Settings. Workspace owns
the surrounding geometry and surface. Settings owns navigation and group layout.
The shared Mantine role renders the switch, associated text and any retry error.
The controller owns localized labels, the Application category icon, persistence
and the platform preference.

The controller consumes Config, Settings, Localization, Logger and
`DesktopBackground` from `@lunaris/window`. It observes `ConfigChanged` and
`LocaleChanged`. It exposes no APIs or events. The `desktop.background`
permission lets an equivalent controller configure a platform driver's policy.
When the preference saves and the tray update fails, the saved value remains
available and the switch shows a retry action. A failed save retains the last
persisted value.

On Windows, closing the main window with background mode enabled hides it and
keeps the application session, open Vault and external windows alive. The Tauri
host's tray menu can restore the main window or request a full exit. Exit runs
the existing save and shutdown gates. A rejected close restores the main window
for access to the document. The tray belongs to the native application lifetime.

Manual acceptance in Windows covers the switch in both languages, keyboard
focus, restart persistence, closing into the tray, restoring the same workspace,
and exiting through the tray after editing a disposable document. Repeat with
the switch off to verify normal close and with a save failure to verify recovery.
