import { Box, Button, Group, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
interface NoticeProps { readonly message: string; readonly action: string; readonly error: string; readonly busy: boolean; readonly onReload: () => void }
export function noticeProps(value: ComponentProps): NoticeProps {
  if (["message", "action", "error"].some(key => typeof value[key] !== "string") || typeof value.busy !== "boolean" || typeof value.onReload !== "function") throw TypeError("Invalid client update notice.");
  return value as unknown as NoticeProps;
}
export function ClientUpdateNotice({ props, theme }: { props: NoticeProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box className="lm-client-update" style={theme.contentStyle} role="status"><Group justify="space-between" wrap="wrap">
    <Text>{props.message}</Text><Button disabled={props.busy} onClick={props.onReload}>{props.action}</Button>
  </Group>{props.error && <Text role="alert">{props.error}</Text>}</Box>;
}
