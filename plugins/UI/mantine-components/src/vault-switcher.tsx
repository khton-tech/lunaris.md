import { Box, Button, Menu, Text } from "@mantine/core";
import { Icon } from "./icons.js";

export interface VaultSwitcherProps {
  name: string; entries: { reference: string; name: string; label: string }[];
  activeReference: string | null; busy: boolean; error: string; historyError: boolean;
  onRecent(reference: string): void; onChange(): void; onRetry(): void;
}
export function validVaultSwitcher(value: unknown): value is VaultSwitcherProps {
  if (!value || typeof value !== "object") return false;
  const props = value as VaultSwitcherProps;
  return typeof props.name === "string" && typeof props.error === "string" && typeof props.busy === "boolean" && typeof props.historyError === "boolean" &&
    (props.activeReference === null || typeof props.activeReference === "string") &&
    [props.onRecent, props.onChange, props.onRetry].every(callback => typeof callback === "function") &&
    Array.isArray(props.entries) && props.entries.every(entry => entry && [entry.reference, entry.name, entry.label].every(item => typeof item === "string"));
}
export function VaultSwitcher({ props, text }: { props: VaultSwitcherProps; text: Record<string, string> }) {
  return <Box className="lm-vault-switcher" aria-busy={props.busy}>
    {props.error && <Text className="lm-explorer-message" role="alert">{text[props.error]}</Text>}
    <Menu withinPortal={false} position="top-start" width="target" offset={6} returnFocus transitionProps={{ transition: "fade" }}>
      <Menu.Target><Button className="lm-explorer-tabs lm-vault-switcher-toggle" fullWidth variant="subtle" justify="space-between"
        disabled={props.busy} aria-label={text.switchVault} title={props.name || text.switchVault} leftSection={<Icon name="folder" />} rightSection={<Icon name="expand" />}>
        {props.name || text.switchVault}
      </Button></Menu.Target>
      <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu" aria-label={text.recentVaults}>
        {props.entries.slice(0, 4).map(entry => <Menu.Item key={entry.reference} title={entry.label} disabled={props.busy}
          aria-current={entry.reference === props.activeReference ? "true" : undefined}
          rightSection={entry.reference === props.activeReference ? <Icon name="check" /> : undefined} onClick={() => props.onRecent(entry.reference)}>{entry.name}</Menu.Item>)}
        {props.historyError && <Menu.Item disabled={props.busy} onClick={props.onRetry} leftSection={<Icon name="refresh" />}>{text.historyUnavailable} · {text.retry}</Menu.Item>}
        {(props.entries.length > 0 || props.historyError) && <Menu.Divider />}
        <Menu.Item disabled={props.busy} onClick={props.onChange} leftSection={<Icon name="browse" />}>{text.switchVault}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Box>;
}
