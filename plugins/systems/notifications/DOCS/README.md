# Notification provider

`lunaris.notification-provider` implements `api:lunaris.notifications@1.0.0` and
is registered in the Tauri application. The [SDK reference](../../../../DOCS/reference/notifications.md)
documents `show(options, owner)` and the result codes.

The provider uses ExternalWindows and Logger through the SDK. It owns queue
ordering, dismissal timing, owner cancellation and placement policy. The
external window manager owns the native window and its geometry. It anchors the
window to the bottom-right work area, uses the top level, and opens without
requesting focus or a taskbar entry. The Mantine component plugin supplies the
standalone `lunaris.notification` role. It owns the themed card, content layout
and rendering of the icon, title and text. The provider subscribes to no SDK
events.

The existing in-app client update notice supplies the product reference for a
compact, themed message. [Mantine Notification](https://mantine.dev/core/notification/)
supplies the desktop card structure. The desktop role pairs a Lucide icon with
a strong title and wrapping secondary text. Long content scrolls within the
allocated surface. The icon is decorative and the message is a status region.

`node tools/scripts/lime-pong.mjs` builds a package using the public API and runs
it through the application plugin runtime with the real provider and Mantine role.
For Windows acceptance, install and enable the resulting Pong package, send two
different messages from DevTools and check placement, ordering, dismissal, focus
retention, long text and a light/dark theme change. Disable the package with an
active notification and confirm that its window closes.
