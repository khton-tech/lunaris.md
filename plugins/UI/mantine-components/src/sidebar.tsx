import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ActionIcon, Box, Paper, Splitter, Stack } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

type Regions = Readonly<Record<"main" | "left-rail" | "left-panel" | "bottom", HTMLElement>>;
interface LayoutProps {
  readonly bottomVisible?: boolean; readonly railVisible: boolean; readonly panelVisible: boolean; readonly mainLabel: string; readonly panelLabel: string;
  readonly onTargets: (targets: Regions | null) => void; readonly onDismiss: () => void;
  readonly panelWidth?: number; readonly resizeLabel?: string; readonly onPanelWidth?: (width: number) => void;
}
export function layoutProps(value: ComponentProps): LayoutProps {
  if (value.bottomVisible !== undefined && typeof value.bottomVisible !== "boolean") throw new TypeError("Invalid bottom visibility.");
  if (typeof value.railVisible !== "boolean" || typeof value.panelVisible !== "boolean" || typeof value.mainLabel !== "string" || typeof value.panelLabel !== "string" || typeof value.onTargets !== "function" || typeof value.onDismiss !== "function") throw new TypeError("Invalid workspace layout props.");
  if ((value.panelWidth !== undefined && (typeof value.panelWidth !== "number" || !Number.isFinite(value.panelWidth) || value.panelWidth < 120 || value.panelWidth > 4096)) ||
    (value.resizeLabel !== undefined && typeof value.resizeLabel !== "string") || (value.onPanelWidth !== undefined && typeof value.onPanelWidth !== "function")) throw new TypeError("Invalid side panel sizing props.");
  return value as unknown as LayoutProps;
}
export function WorkspaceLayout({ props, theme }: { props: LayoutProps; theme: ReturnType<typeof resolveTheme> }) {
  const bottom = useRef<HTMLDivElement>(null); const main = useRef<HTMLDivElement>(null); const rail = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null); const [available, setAvailable] = useState(0);
  const [width, setWidth] = useState(props.panelWidth ?? 288); const latestWidth = useRef(width);
  useLayoutEffect(() => { latestWidth.current = props.panelWidth ?? 288; setWidth(latestWidth.current); }, [props.panelWidth]);
  useLayoutEffect(() => {
    const element = content.current!;
    const measure = () => setAvailable(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  // Fit the current viewport without overwriting the user's preferred width.
  const fittedWidth = available > 0 ? Math.max(0, Math.min(width, available * 0.6, available - 264)) : width;
  const commitWidth = () => { if (props.panelVisible) props.onPanelWidth?.(Math.round(latestWidth.current)); };
  const publish = props.onTargets;
  useLayoutEffect(() => {
    publish(Object.freeze({ main: main.current!, "left-rail": rail.current!, "left-panel": panel.current!, bottom: bottom.current! }));
    return () => publish(null);
  }, [publish]);
  return <Box className="lm-workspace-layout" style={{ ...theme.contentStyle, "--workspace-panel-width": `${width}px` }} data-window-chrome={theme.windowChrome || undefined} data-bottom={props.bottomVisible || undefined} data-rail={props.railVisible || undefined} data-panel={props.panelVisible || undefined}
    onKeyDown={event => { if (event.key === "Escape" && props.panelVisible) {
      event.preventDefault(); rail.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")?.focus({ preventScroll: true }); props.onDismiss();
    } }}>
    <Paper ref={rail} className="lm-workspace-rail lm-workspace-card" shadow="none" hidden={!props.railVisible} />
    <Splitter ref={content} className="lm-workspace-content" sizes={[`${fittedWidth}px`, 100]} withHandle={false} lineSize={8} step="8px" shiftStep="32px"
      attributes={{ handle: { "aria-label": props.resizeLabel ?? props.panelLabel } }}
      onSizeChange={sizes => { const next = Number.parseFloat(String(sizes[0])); if (Number.isFinite(next) && next >= 120) { latestWidth.current = next; setWidth(next); } }}
      onResizeEnd={commitWidth} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && (event.target as HTMLElement).getAttribute("role") === "separator") commitWidth(); }}
      onDoubleClick={event => { if ((event.target as HTMLElement).closest("[role=separator]")) void Promise.resolve().then(commitWidth); }}>
      <Splitter.Pane className="lm-workspace-panel-pane" defaultSize="288px" min="12rem" max="60%">
        <Paper component="aside" ref={panel} className="lm-workspace-panel lm-workspace-card" shadow="none" aria-label={props.panelLabel} hidden={!props.panelVisible} />
      </Splitter.Pane>
      <Splitter.Pane className="lm-workspace-main-pane" defaultSize={100} min="16rem">
        <Box component="main" ref={main} className="lm-workspace-main" aria-label={props.mainLabel} />
        <Paper ref={bottom} className="lm-workspace-bottom lm-workspace-card" shadow="none" hidden={!props.bottomVisible} />
      </Splitter.Pane>
    </Splitter>
  </Box>;
}

interface RailProps {
  readonly label: string; readonly activeId: string | null;
  readonly tabs: readonly { readonly id: string; readonly title: string; readonly icon: string; readonly placement?: "start" | "end" }[];
  readonly onSelect: (id: string) => void;
}
export function railProps(value: ComponentProps): RailProps {
  if (typeof value.label !== "string" || (value.activeId !== null && typeof value.activeId !== "string") || typeof value.onSelect !== "function" || !Array.isArray(value.tabs) || value.tabs.some(tab => !tab || ["id", "title", "icon"].some(key => typeof tab[key] !== "string") || (tab.placement !== undefined && !["start", "end"].includes(tab.placement)))) throw new TypeError("Invalid sidebar rail props.");
  return value as unknown as RailProps;
}
export function SidebarRail({ props, theme }: { props: RailProps; theme: ReturnType<typeof resolveTheme> }) {
  const ordered = [...props.tabs.filter(tab => tab.placement !== "end"), ...props.tabs.filter(tab => tab.placement === "end")];
  const buttons = useRef(new Map<string, HTMLButtonElement>()); const previous = useRef(props.activeId);
  useLayoutEffect(() => {
    const old = previous.current; previous.current = props.activeId;
    const document = buttons.current.values().next().value?.ownerDocument;
    if (old && !props.activeId && document?.activeElement === document?.body) buttons.current.get(old)?.focus({ preventScroll: true });
  }, [props.activeId]);
  function navigate(event: ReactKeyboardEvent, index: number): void {
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % ordered.length;
    else if (event.key === "ArrowUp") next = (index + ordered.length - 1) % ordered.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ordered.length - 1;
    else return;
    event.preventDefault(); buttons.current.get(ordered[next]!.id)?.focus();
  }
  const renderTab = (tab: RailProps["tabs"][number]) => <ActionIcon key={tab.id}
    ref={node => { if (node) buttons.current.set(tab.id, node); else buttons.current.delete(tab.id); }}
    className="lm-sidebar-tab lm-focus" variant="subtle" size="lg" aria-label={tab.title} title={tab.title}
    aria-pressed={props.activeId === tab.id} aria-expanded={props.activeId === tab.id}
    onKeyDown={event => navigate(event, ordered.indexOf(tab))} onClick={() => props.onSelect(tab.id)}>
    <Icon name={tab.icon} />
  </ActionIcon>;
  return <Box component="nav" className="lm-sidebar-rail" aria-label={props.label} style={theme.contentStyle}>
    <Stack gap="xs" align="center" className="lm-sidebar-start">
      {ordered.filter(tab => tab.placement !== "end").map(renderTab)}
    </Stack>
    <Stack gap="xs" align="center" className="lm-sidebar-end">
      {ordered.filter(tab => tab.placement === "end").map(renderTab)}
    </Stack>
  </Box>;
}
