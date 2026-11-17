# Pong notification

Pong is a desktop test plugin for the external window manager. Install and
enable `dist/lime-examples/pong-notification.lup` with the third-party plugin
settings in an open Vault. In the **main Lunaris window's** developer console run
`await ui.pong("text here")`.

The text appears in a frameless window at the bottom-right of the primary
monitor's work area, on the `top` layer. It closes after four seconds. Calling
the command again updates the visible notification and restarts the timer.
The popup uses no taskbar entry and requests no focus.

The external window manager owns placement and lifetime. The public Views API
mounts the plain-text message through the shared Mantine declarative role with
standalone presentation. The plugin owns the message, timeout and scoped
DevTools command. ApplicationDom supplies the console's JavaScript window.
An existing `ui` namespace is preserved, and an occupied `ui.pong` prevents
activation. Disabling the plugin removes its command and releases its window.

The plugin requires ApplicationDom, ExternalWindows, Localization, Logger and
Views. It declares `ui.dom` and `window.external`, provides no SDK APIs and
subscribes to no SDK events. Both the application and the installed contract
must support named external-window anchors and layers.

Build the installable package with `node tools/scripts/lime-pong.mjs`. In the
desktop app, verify positioning against the taskbar, focus retention, automatic
dismissal, replacement on a second command and cleanup on disable.
