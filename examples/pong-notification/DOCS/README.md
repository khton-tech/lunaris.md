# Pong notification

Pong is a desktop test plugin for the notification provider. Install and
enable `dist/lime-examples/pong-notification.lup` with the third-party plugin
settings in an open Vault. In the **main Lunaris window's** developer console run
`await ui.pong("text here")` or pass all three arguments in an object.

```js
ui.pong({ icon: "circle-check", title: "Export complete", text: "The file is ready." })
```

The text appears in a frameless window at the bottom-right of the primary
monitor's work area, on the `top` layer. The notification provider displays one
message at a time and dismisses each automatically. The popup uses no taskbar
entry and requests no focus.

The public Notifications API shows the message in the shared Mantine role. The
plugin owns the scoped DevTools command. ApplicationDom supplies the console's
JavaScript window.
An existing `ui` namespace is preserved, and an occupied `ui.pong` prevents
activation. Disabling the plugin removes its command and releases its window.

The plugin requires ApplicationDom, Notifications, Localization and Logger. It
declares `ui.dom` and `notifications.show`, provides no SDK APIs and subscribes
to no SDK events. Version 1.1.0 requires Lunaris with the notification provider.

Build the installable package with `node tools/scripts/lime-pong.mjs`. In the
desktop app, verify positioning against the taskbar, focus retention, automatic
dismissal, ordering after a second command and cleanup on disable.
