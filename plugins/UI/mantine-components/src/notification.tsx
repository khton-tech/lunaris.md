import { Notification } from "@mantine/core";
import { Bell } from "lucide";
import type { IconNode } from "lucide";
import { useEffect, useState } from "react";
import type { ComponentProps } from "@lunaris/components";
import { readNotificationOptions } from "@lunaris/notifications";
import type { NotificationOptions } from "@lunaris/notifications";
import { LucideGlyph } from "./icons.js";
import type { resolveTheme } from "./theme.js";

type IconCatalog = Readonly<Record<string, unknown>>;
let catalog: IconCatalog | undefined;
let loading: Promise<IconCatalog> | undefined;

function loadCatalog(): Promise<IconCatalog> {
  return loading ??= import("lucide/dist/esm/iconsAndAliases.mjs").then(icons => {
    catalog = icons;
    return icons;
  }).catch(error => { loading = undefined; throw error; });
}

export function notificationProps(value: ComponentProps): NotificationOptions {
  const props = readNotificationOptions(value);
  if (!props) throw new TypeError("Invalid notification content.");
  return props;
}

export function DesktopNotification({ props, theme, onIconError }: {
  props: NotificationOptions;
  theme: ReturnType<typeof resolveTheme>;
  onIconError(error: unknown): void;
}) {
  const [icons, setIcons] = useState(catalog);
  useEffect(() => {
    if (icons || props.icon === "bell") return;
    let active = true;
    void loadCatalog().then(result => { if (active) setIcons(result); }, error => { if (active) onIconError(error); });
    return () => { active = false; };
  }, [icons, onIconError, props.icon]);
  const name = props.icon.replace(/(^|-)([a-z0-9])/gu, (_, _separator, letter: string) => letter.toUpperCase());
  const glyph = icons && Object.hasOwn(icons, name) ? icons[name] : undefined;
  const node = Array.isArray(glyph) ? glyph as IconNode : Bell;
  return <Notification className="lm-notification" style={theme.contentStyle}
    classNames={{ icon: "lm-notification-icon", body: "lm-notification-body", title: "lm-notification-title", description: "lm-notification-text" }}
    icon={<LucideGlyph node={node} />} title={props.title} withCloseButton={false} role="status" aria-atomic="true">
    {props.text}
  </Notification>;
}
