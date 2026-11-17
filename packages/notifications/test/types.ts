import { Notifications } from "@lunaris/notifications";
import type { PluginContext } from "@lunaris/sdk";

declare const ctx: PluginContext;
const notifications = ctx.use(Notifications);
void notifications.show({ icon: "circle-check", title: "Complete", text: "The result is ready." }, ctx.signal);
// @ts-expect-error The notification requires a title.
void notifications.show({ icon: "bell", text: "Waiting" }, ctx.signal);
// @ts-expect-error An activation signal owns each notification.
void notifications.show({ icon: "bell", title: "Reminder", text: "Waiting" });
