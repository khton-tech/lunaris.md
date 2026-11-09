import { Box, Button, Text } from "@mantine/core";
import { Icon } from "./icons.js";

/** Match the existing Files panel's tool header and compact icon-row hierarchy. */
export function ToolPanelHeader({ title }: { title: string }) {
  return <Box className="lm-tool-panel-toolbar">
    <Text component="h2" className="lm-tool-panel-title" size="sm" fw={500} m={0}>{title}</Text>
  </Box>;
}
export function ToolNavigationItem({ title, icon = "settings", selected, onSelect }: { title: string; icon?: string | undefined; selected: boolean; onSelect: () => void }) {
  return <Button variant="subtle" justify="start" className="lm-tool-navigation-item lm-settings-category lm-focus"
    leftSection={<Icon name={icon} />} aria-current={selected ? "page" : undefined} onClick={onSelect}>
    <Text component="span" inherit>{title}</Text>
  </Button>;
}
