import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ActionIcon, Box, Stack } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

type Regions = Readonly<Record<"main" | "left-rail" | "left-panel", HTMLElement>>;
interface LayoutProps {
  readonly railVisible: boolean; readonly panelVisible: boolean; readonly mainLabel: string; readonly panelLabel: string;
  readonly onTargets: (targets: Regions | null) => void; readonly onDismiss: () => void;
}
export function layoutProps(value: ComponentProps): LayoutProps {
  if (typeof value.railVisible !== "boolean" || typeof value.panelVisible !== "boolean" || typeof value.mainLabel !== "string" || typeof value.panelLabel !== "string" || typeof value.onTargets !== "function" || typeof value.onDismiss !== "function") throw new TypeError("Invalid workspace layout props.");
  return value as unknown as LayoutProps;
}
export function WorkspaceLayout({ props, theme }: { props: LayoutProps; theme: ReturnType<typeof resolveTheme> }) {
  const main = useRef<HTMLDivElement>(null); const rail = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const publish = props.onTargets;
  useLayoutEffect(() => {
    publish(Object.freeze({ main: main.current!, "left-rail": rail.current!, "left-panel": panel.current! }));
    return () => publish(null);
  }, [publish]);
  return <Box className="lm-workspace-layout" style={theme.style} data-rail={props.railVisible || undefined} data-panel={props.panelVisible || undefined}
    onKeyDown={event => { if (event.key === "Escape" && props.panelVisible) {
      event.preventDefault(); rail.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")?.focus({ preventScroll: true }); props.onDismiss();
    } }}>
    <Box ref={rail} className="lm-workspace-rail" hidden={!props.railVisible} />
    <Box component="aside" ref={panel} className="lm-workspace-panel" aria-label={props.panelLabel} hidden={!props.panelVisible} />
    <Box component="main" ref={main} className="lm-workspace-main" aria-label={props.mainLabel} />
  </Box>;
}

interface RailProps {
  readonly label: string; readonly activeId: string | null;
  readonly tabs: readonly { readonly id: string; readonly title: string; readonly icon: string }[];
  readonly onSelect: (id: string) => void;
}
export function railProps(value: ComponentProps): RailProps {
  if (typeof value.label !== "string" || (value.activeId !== null && typeof value.activeId !== "string") || typeof value.onSelect !== "function" || !Array.isArray(value.tabs) || value.tabs.some(tab => !tab || ["id", "title", "icon"].some(key => typeof tab[key] !== "string"))) throw new TypeError("Invalid sidebar rail props.");
  return value as unknown as RailProps;
}
export function SidebarRail({ props, theme }: { props: RailProps; theme: ReturnType<typeof resolveTheme> }) {
  const buttons = useRef(new Map<string, HTMLButtonElement>()); const previous = useRef(props.activeId);
  useLayoutEffect(() => {
    const old = previous.current; previous.current = props.activeId;
    const document = buttons.current.values().next().value?.ownerDocument;
    if (old && !props.activeId && document?.activeElement === document?.body) buttons.current.get(old)?.focus({ preventScroll: true });
  }, [props.activeId]);
  function navigate(event: KeyboardEvent, index: number): void {
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % props.tabs.length;
    else if (event.key === "ArrowUp") next = (index + props.tabs.length - 1) % props.tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = props.tabs.length - 1;
    else return;
    event.preventDefault(); buttons.current.get(props.tabs[next]!.id)?.focus();
  }
  return <Box component="nav" className="lm-sidebar-rail" aria-label={props.label} style={theme.style}>
    <Stack gap="xs" align="center">
      {props.tabs.map((tab, index) => <ActionIcon key={tab.id} ref={node => { if (node) buttons.current.set(tab.id, node); else buttons.current.delete(tab.id); }}
          className="lm-sidebar-tab lm-focus" variant="subtle" size="lg" aria-label={tab.title} title={tab.title}
          aria-pressed={props.activeId === tab.id} aria-expanded={props.activeId === tab.id}
          onKeyDown={event => navigate(event, index)} onClick={() => props.onSelect(tab.id)}>
          <Icon name={tab.icon} />
        </ActionIcon>)}
    </Stack>
  </Box>;
}
