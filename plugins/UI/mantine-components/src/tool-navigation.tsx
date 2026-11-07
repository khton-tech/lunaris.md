import { Box, Button, Menu, Text } from "@mantine/core";
import { Icon } from "./icons.js";

/** Match the existing Files panel's tool header and compact icon-row hierarchy. */
export function ToolPanelHeader({ title }: { title: string }) {
  return <Box className="lm-tool-panel-toolbar">
    <Menu withinPortal={false} position="bottom-start" width="target" offset={4} returnFocus transitionProps={{ duration: 0 }}>
      <Menu.Target><Button variant="subtle" fullWidth justify="space-between" className="lm-tool-panel-header" aria-label={title}
        rightSection={<Icon name="expand" />}>{title}</Button></Menu.Target>
      <Menu.Dropdown className="lm-tool-panel-menu"><Menu.Item aria-current="page" rightSection={<Icon name="check" />}>{title}</Menu.Item></Menu.Dropdown>
    </Menu>
  </Box>;
}
export function ToolNavigationItem({ title, selected, onSelect }: { title: string; selected: boolean; onSelect: () => void }) {
  return <Button variant="subtle" justify="start" className="lm-tool-navigation-item lm-settings-category lm-focus"
    leftSection={<Icon name="settings" />} aria-current={selected ? "page" : undefined} onClick={onSelect}>
    <Text component="span" inherit>{title}</Text>
  </Button>;
}
