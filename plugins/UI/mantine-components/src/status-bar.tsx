import { Box, Group, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
interface StatusBarProps {
  readonly label: string; readonly filename: string; readonly fileTitle: string;
  readonly serverLabel: string; readonly serverTitle: string; readonly wordsLabel: string; readonly lettersLabel: string;
  readonly serverState: "connected" | "offline" | "expired" | "unknown" | null;
  readonly words: number | null; readonly letters: number | null;
}
export function statusBarProps(value: ComponentProps): StatusBarProps {
  for (const key of ["label", "filename", "fileTitle", "serverLabel", "serverTitle", "wordsLabel", "lettersLabel"]) {
    if (typeof value[key] !== "string") throw new TypeError("Invalid status bar labels.");
  }
  for (const key of ["words", "letters"]) {
    const count = value[key];
    if (count !== null && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) throw new TypeError("Invalid status bar count.");
  }
  if (value.serverState !== null && !["connected", "offline", "expired", "unknown"].includes(value.serverState as string)) throw new TypeError("Invalid server state.");
  return value as unknown as StatusBarProps;
}
export function StatusBar({ props, theme }: { props: StatusBarProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="footer" className="lm-status-bar" aria-label={props.label} style={theme.contentStyle}>
    <Group className="lm-status-context" gap="xs" wrap="nowrap">
      <Text component="span" className="lm-status-file" title={props.fileTitle || props.filename} inherit>{props.filename}</Text>
      {props.serverState && <Box component="span" className="lm-status-server" role="img" aria-label={props.serverLabel}
        title={props.serverLabel + (props.serverTitle ? ": " + props.serverTitle : "")}>
        <Icon name={"server-" + props.serverState} />
      </Box>}
    </Group>
    {(props.words !== null || props.letters !== null) && <Group className="lm-status-counts" gap="md" wrap="nowrap">
      {props.words !== null && <Box component="span" className="lm-status-metric" role="img" aria-label={props.wordsLabel} title={props.wordsLabel}>
        <Icon name="word-count" /><Text component="span" inherit aria-hidden="true">{props.words}</Text>
      </Box>}
      {props.letters !== null && <Box component="span" className="lm-status-metric" role="img" aria-label={props.lettersLabel} title={props.lettersLabel}>
        <Icon name="letter-count" /><Text component="span" inherit aria-hidden="true">{props.letters}</Text>
      </Box>}
    </Group>}
  </Box>;
}
