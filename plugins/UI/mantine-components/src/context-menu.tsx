import { Box, Menu } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { MenuItem } from "@lunaris/context-menu";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

interface ContextMenuProps {
  readonly items: readonly MenuItem[];
  readonly x: number; readonly y: number; readonly label: string;
  onAction(id: string): void; onClose(): void;
}
export function contextMenuProps(value: ComponentProps): ContextMenuProps {
  const ids = new Set<string>();
  function valid(items: unknown, depth = 0): boolean {
    return depth <= 32 && Array.isArray(items) && items.every(item => {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.label !== "string" ||
        (item.icon !== undefined && (typeof item.icon !== "string" || !item.icon.trim())) ||
        (item.disabled !== undefined && typeof item.disabled !== "boolean")) return false;
      ids.add(item.id);
      return item.kind === "action" || (item.kind === "group" && valid(item.children, depth + 1));
    });
  }
  if (!valid(value.items) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || typeof value.label !== "string" ||
    typeof value.onAction !== "function" || typeof value.onClose !== "function") throw new TypeError("Invalid context menu props.");
  return value as unknown as ContextMenuProps;
}
export function ContextMenuView({ props, theme }: { props: ContextMenuProps; theme: ReturnType<typeof resolveTheme> }) {
  // Defer provider disposal beyond React's event/effect work; cleanup owns no SDK calls.
  const close = () => { void Promise.resolve().then(props.onClose); };
  function render(items: readonly MenuItem[]): React.ReactNode {
    return items.filter(item => !item.disabled).map(item => item.kind === "group" ? <Menu.Sub key={item.id} floatingStrategy="fixed" offset={4} safeAreaPolygon
      transitionProps={{ duration: 0 }}>
      <Menu.Sub.Target><Menu.Sub.Item title={item.label} leftSection={<Icon name={item.icon ?? "folder"} />} rightSection={<Icon name="expand" />}>{item.label}</Menu.Sub.Item></Menu.Sub.Target>
      <Menu.Sub.Dropdown className="lm-context-menu">{render(item.children)}</Menu.Sub.Dropdown>
    </Menu.Sub> : <Menu.Item key={item.id} title={item.label} leftSection={<Icon name={item.icon ?? "actions"} />} onClick={() => {
      void Promise.resolve().then(() => props.onAction(item.id));
    }}>{item.label}</Menu.Item>);
  }
  return <Box className="lm-context-surface" style={theme.contentStyle}>
    <Menu opened onChange={opened => { if (!opened) close(); }} withinPortal={false} floatingStrategy="fixed" position="bottom-start" offset={0}
      middlewares={{ flip: true, shift: { padding: 4 } }} transitionProps={{ duration: 0 }} returnFocus={false} trapFocus closeOnItemClick={false} loop>
      <Menu.Target><Box aria-hidden="true" tabIndex={-1} className="lm-context-anchor" style={{ left: props.x, top: props.y }} /></Menu.Target>
      <Menu.Dropdown className="lm-context-menu" aria-label={props.label}>{render(props.items)}</Menu.Dropdown>
    </Menu>
  </Box>;
}
