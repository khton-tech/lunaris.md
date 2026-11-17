import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface NotificationOptions {
  /** Lucide icon name, such as `circle-check`. */
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}

export type NotificationErrorCode = "INVALID_ARGUMENT" | "UNSUPPORTED" | "BUSY" | "CANCELLED" | "DISPLAY_FAILED";
export type NotificationResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false;
  readonly error: { readonly code: NotificationErrorCode; readonly message: string };
};

export interface NotificationsApi {
  /** Resolve after the notification has appeared, or when it cannot be shown. */
  show(options: NotificationOptions, owner: CancellationSignal): Promise<NotificationResult>;
}

export const Notifications = defineApi<NotificationsApi>({
  id: "lunaris.notifications", version: "1.0.0", consumePermission: "notifications.show",
  validate: api => !!api && typeof api === "object" && typeof Object.getOwnPropertyDescriptor(api, "show")?.value === "function",
});

export const NotificationRole = "lunaris.notification";

/** Read and copy the shared notification and component role props. */
export function readNotificationOptions(value: unknown): NotificationOptions | undefined {
  if (!value || typeof value !== "object") return;
  const icon = Object.getOwnPropertyDescriptor(value, "icon")?.value;
  const title = Object.getOwnPropertyDescriptor(value, "title")?.value;
  const text = Object.getOwnPropertyDescriptor(value, "text")?.value;
  if (typeof icon !== "string" || icon.length > 80 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(icon)) return;
  if (typeof title !== "string" || title.length > 120 || !title.trim() || /[\u0000-\u001f]/u.test(title)) return;
  if (typeof text !== "string" || text.length > 600 || !text.trim()) return;
  return Object.freeze({ icon, title, text });
}
