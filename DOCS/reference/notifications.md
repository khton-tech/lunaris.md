# Desktop notifications

Import `Notifications` from `@lunaris/notifications`. Declare
`api:lunaris.notifications@^1.0.0` in `requires` and `notifications.show` in
`permissions`. These declarations apply to all consumers. Use an optional
requirement and `ctx.optional(Notifications)` for plugins that also run on Web.

```ts
const result = await ctx.use(Notifications).show({
  icon: "circle-check",
  title: localization.text(ctx.pluginId, "exportComplete"),
  text: localization.text(ctx.pluginId, "exportReady"),
}, ctx.signal);
```

All three fields are required. Use a kebab-case Lucide icon name. Mantine displays
the bell for an unknown name. Titles are single-line strings of up to 120
characters. Text accepts line breaks and up to 600 characters. Both are rendered
as plain text. The calling plugin translates its own title and body.

`show` resolves once the notification appears. It returns a `NotificationResult`
with `INVALID_ARGUMENT`, `UNSUPPORTED`, `BUSY`, `CANCELLED`, or `DISPLAY_FAILED`
on failure. The service shows up to four notifications at once and accepts up to
32 waiting requests in submission order. New cards appear above visible ones.
Remaining cards move toward the bottom as earlier cards close. Each visible
notification has its own 5 to 15 second timer, depending on message length.
Ending the caller's activation cancels its waiting and visible notifications.

See [the notification provider](../../plugins/systems/notifications/DOCS/README.md)
for implementation and manual verification, and [Pong](../../examples/pong-notification/DOCS/README.md)
for a DevTools test package.
