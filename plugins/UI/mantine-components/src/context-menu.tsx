import { Box, Menu, Paper } from "@mantine/core";
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
      return item.kind === "action" || ((item.kind === "group" || (item.kind === "island" && depth === 0)) && valid(item.children, depth + 1));
    });
  }
  if (!valid(value.items) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || typeof value.label !== "string" ||
    typeof value.onAction !== "function" || typeof value.onClose !== "function") throw new TypeError("Invalid context menu props.");
  return value as unknown as ContextMenuProps;
}
export function ContextMenuView({ props, theme }: { props: ContextMenuProps; theme: ReturnType<typeof resolveTheme> }) {
  const close = () => { void Promise.resolve().then(props.onClose); };
  const invoke = (id: string) => { void Promise.resolve().then(() => props.onAction(id)); };
  function render(items: readonly MenuItem[], icons = false): React.ReactNode {
    return items.filter(item => !item.disabled).map(item => item.kind !== "action" ? <Menu.Sub key={item.id} floatingStrategy="fixed" offset={4} safeAreaPolygon transitionProps={{ duration: 0 }}>
      <Menu.Sub.Target><Menu.Sub.Item className={icons ? "lm-island-control" : undefined} aria-label={item.label} title={item.label}
        leftSection={icons ? undefined : <Icon name={item.icon ?? "folder"} />} rightSection={<Icon name="expand" />}>
        {icons ? <Icon name={item.icon ?? "folder"} /> : item.label}
      </Menu.Sub.Item></Menu.Sub.Target>
      <Menu.Sub.Dropdown className="lm-context-menu">{render(item.children)}</Menu.Sub.Dropdown>
    </Menu.Sub> : <Menu.Item key={item.id} className={icons ? "lm-island-control" : undefined} aria-label={item.label} title={item.label}
      leftSection={icons ? undefined : <Icon name={item.icon ?? "actions"} />} onClick={() => invoke(item.id)}>
      {icons ? <Icon name={item.icon ?? "actions"} /> : item.label}
    </Menu.Item>);
  }
  const islands = props.items.filter(item => item.kind === "island");
  const regular = props.items.filter(item => item.kind !== "island");
  return <Box className="lm-context-surface" style={theme.contentStyle}>
    <Menu opened hideDetached={false} onChange={opened => { if (!opened) close(); }} withinPortal={false} floatingStrategy="fixed" position="bottom-start" offset={0}
      middlewares={{ flip: true, shift: { padding: 4 } }} transitionProps={{ duration: 0 }} returnFocus={false} trapFocus closeOnItemClick={false} loop>
      <Menu.Target><Box aria-hidden="true" tabIndex={-1} className="lm-context-anchor" style={{ left: props.x, top: props.y }} /></Menu.Target>
      <Menu.Dropdown className={islands.length ? "lm-context-menu lm-context-composite" : "lm-context-menu"} aria-label={props.label}>
        {islands.map(island => island.kind !== "action" && <Paper key={island.id} className="lm-context-island" role="group" aria-label={island.label} shadow="none"
          onKeyDownCapture={event => {
            if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(":scope > [role=menuitem]")];
            const index = controls.indexOf(event.target as HTMLElement);
            if (index < 0 || (event.key === "ArrowRight" && controls[index]?.getAttribute("aria-haspopup") === "menu")) return;
            event.preventDefault(); event.stopPropagation(); controls[(index + (event.key === "ArrowRight" ? 1 : controls.length - 1)) % controls.length]?.focus();
          }}>{render(island.children, true)}</Paper>)}
        {regular.length > 0 && (islands.length ? <Box className="lm-context-menu lm-context-actions">{render(regular)}</Box> : render(regular))}
      </Menu.Dropdown>
    </Menu>
  </Box>;
}
