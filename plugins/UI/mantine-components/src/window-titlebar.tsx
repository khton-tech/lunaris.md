import { ActionIcon, Box, Paper, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

interface Props {
  readonly title: string; readonly focused: boolean; readonly maximized: boolean;
  readonly canMinimize: boolean; readonly canMaximize: boolean; readonly canClose: boolean; readonly canDrag: boolean;
  readonly minimizeLabel: string; readonly maximizeLabel: string; readonly restoreLabel: string; readonly closeLabel: string;
  readonly onMinimize: () => void; readonly onToggleMaximize: () => void; readonly onClose: () => void; readonly onDrag: () => void;
}
export function windowTitlebarProps(value: ComponentProps): Props {
  for (const key of ["title", "minimizeLabel", "maximizeLabel", "restoreLabel", "closeLabel"]) {
    if (typeof value[key] !== "string" || !(value[key] as string).trim()) throw new TypeError(`Invalid titlebar ${key}.`);
  }
  for (const key of ["focused", "maximized", "canMinimize", "canMaximize", "canClose", "canDrag"]) {
    if (typeof value[key] !== "boolean") throw new TypeError(`Invalid titlebar ${key}.`);
  }
  for (const key of ["onMinimize", "onToggleMaximize", "onClose", "onDrag"]) {
    if (typeof value[key] !== "function") throw new TypeError(`Invalid titlebar ${key}.`);
  }
  return value as unknown as Props;
}

/** Owns only the allocated titlebar region; never paints or reparents product screens. */
export function WindowTitlebar({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  const maximizeLabel = props.maximized ? props.restoreLabel : props.maximizeLabel;
  return <Paper component="header" className="lm-window-titlebar" style={theme.contentStyle} data-focused={props.focused} data-chrome={theme.windowChrome}>
    <Box className="lm-window-titlebar-drag" onMouseDown={event => {
      if (event.button === 0 && event.detail < 2 && props.canDrag) props.onDrag();
    }} onDoubleClick={event => { if (event.button === 0 && props.canMaximize) props.onToggleMaximize(); }}>
      <Text component="span" className="lm-window-titlebar-title" title={props.title}>{props.title}</Text>
    </Box>
    <Box className="lm-window-titlebar-actions">
      <ActionIcon variant="subtle" className="lm-window-action" disabled={!props.canMinimize}
        aria-label={props.minimizeLabel} title={props.minimizeLabel} onClick={props.onMinimize}><Icon name="window-minimize" /></ActionIcon>
      <ActionIcon variant="subtle" className="lm-window-action" disabled={!props.canMaximize}
        aria-label={maximizeLabel} title={maximizeLabel} onClick={props.onToggleMaximize}><Icon name={props.maximized ? "window-restore" : "window-maximize"} /></ActionIcon>
      <ActionIcon variant="subtle" className="lm-window-action lm-window-close" disabled={!props.canClose}
        aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose}><Icon name="window-close" /></ActionIcon>
    </Box>
  </Paper>;
}
