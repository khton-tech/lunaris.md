import { Box, Group, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
interface StatusBarProps {
 readonly label: string; readonly filename: string; readonly fileTitle: string;
 readonly serverLabel: string; readonly serverTitle: string; readonly wordsLabel: string; readonly lettersLabel: string;
}
export function statusBarProps(value: ComponentProps): StatusBarProps {
 for (const key of ["label", "filename", "fileTitle", "serverLabel", "serverTitle", "wordsLabel", "lettersLabel"]) {
  if (typeof value[key] !== "string") throw new TypeError("Invalid status bar labels.");
 }
 return value as unknown as StatusBarProps;
}
export function StatusBar({ props, theme }: { props: StatusBarProps; theme: ReturnType<typeof resolveTheme> }) {
 return <Box component="footer" className="lm-status-bar" aria-label={props.label} style={theme.contentStyle}>
  <Group className="lm-status-context" gap="xs" wrap="nowrap">
   <Text component="span" className="lm-status-file" title={props.fileTitle || props.filename} inherit>{props.filename}</Text>
   {props.serverLabel && <Text component="span" className="lm-status-server" title={props.serverTitle} inherit>{props.serverLabel}</Text>}
  </Group>
  {(props.wordsLabel || props.lettersLabel) && <Group className="lm-status-counts" gap="md" wrap="nowrap">
   <Text component="span" inherit>{props.wordsLabel}</Text><Text component="span" inherit>{props.lettersLabel}</Text>
  </Group>}
 </Box>;
}
