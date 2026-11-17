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

The provider displays up to four 192 × 64 logical-pixel windows with 8 logical
pixels between them. It opens one native window at a time and appends each new
card above the visible ones. Closing a card frees its position. The provider
compacts only the displaced windows through anchored moves. It retains a slot
until the driver confirms closure. Timers start after successful display and run
independently. During shutdown the provider drains in-flight openings and waits
for visible windows to close.

The existing in-app client update notice supplies the product reference for a
compact, themed message. [Mantine Notification](https://mantine.dev/core/notification/)
supplies the desktop card structure. The desktop role pairs a Lucide icon with
a strong title and wrapping secondary text. Long content scrolls within the
allocated surface. The icon is decorative and the message is a status region.

`node tools/scripts/lime-pong.mjs` builds a package using the public API and runs
it through the application plugin runtime with the real provider and Mantine role.
For Windows acceptance, install and enable the resulting Pong package and send
five different messages quickly from DevTools. Check four visible cards,
promotion of the queued fifth card, gap compaction, dismissal and long text.
Keep typing in DevTools while the cards appear and dismiss, then click or hover
a card while another application has focus. Repeat with a light and dark theme.
Disable Pong with active notifications and confirm that its windows close.
