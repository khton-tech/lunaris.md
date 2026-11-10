import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ActionIcon, Box, Button, FocusTrap, Paper, Splitter, Stack, UnstyledButton } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

type Regions = Readonly<Record<"main" | "left-rail" | "left-panel" | "bottom" | "mobile-menu", HTMLElement>>;
interface LayoutProps {
  readonly mobileMenuVisible?: boolean; readonly mobileOpen?: boolean; readonly onMobileOpen?: (open: boolean) => void;
  readonly bottomVisible?: boolean; readonly railVisible: boolean; readonly panelVisible: boolean; readonly mainLabel: string; readonly panelLabel: string;
  readonly onTargets: (targets: Regions | null) => void; readonly onDismiss: () => void;
  readonly panelWidth?: number; readonly resizeLabel?: string; readonly onPanelWidth?: (width: number) => void;
}
export function layoutProps(value: ComponentProps): LayoutProps {
  if ((value.mobileOpen !== undefined && typeof value.mobileOpen !== "boolean") || (value.mobileMenuVisible !== undefined && typeof value.mobileMenuVisible !== "boolean") || (value.onMobileOpen !== undefined && typeof value.onMobileOpen !== "function")) throw new TypeError("Invalid mobile workspace presentation.");
  if (value.bottomVisible !== undefined && typeof value.bottomVisible !== "boolean") throw new TypeError("Invalid bottom visibility.");
  if (typeof value.railVisible !== "boolean" || typeof value.panelVisible !== "boolean" || typeof value.mainLabel !== "string" || typeof value.panelLabel !== "string" || typeof value.onTargets !== "function" || typeof value.onDismiss !== "function") throw new TypeError("Invalid workspace layout props.");
  if ((value.panelWidth !== undefined && (typeof value.panelWidth !== "number" || !Number.isFinite(value.panelWidth) || value.panelWidth < 120 || value.panelWidth > 4096)) ||
    (value.resizeLabel !== undefined && typeof value.resizeLabel !== "string") || (value.onPanelWidth !== undefined && typeof value.onPanelWidth !== "function")) throw new TypeError("Invalid side panel sizing props.");
  return value as unknown as LayoutProps;
}
export function WorkspaceLayout({ props, theme }: { props: LayoutProps; theme: ReturnType<typeof resolveTheme> }) {
  const bottom = useRef<HTMLDivElement>(null); const main = useRef<HTMLDivElement>(null); const rail = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const mobileMenu = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const mobileOpen = props.mobileOpen ?? localOpen;
  const setMobileOpen = (open: boolean) => { setLocalOpen(open); props.onMobileOpen?.(open); };
  const previousPresentation = useRef({ open: false, compact: false });
  const [available, setAvailable] = useState(0); const [compact, setCompact] = useState(false);
  const [width, setWidth] = useState(props.panelWidth ?? 288); const latestWidth = useRef(width);
  useLayoutEffect(() => { latestWidth.current = props.panelWidth ?? 288; setWidth(latestWidth.current); }, [props.panelWidth]);
  useLayoutEffect(() => {
    const element = root.current!;
    const measure = () => {
      const size = element.getBoundingClientRect().width;
      setAvailable(content.current!.getBoundingClientRect().width);
      // Measure our own region, including when embedded in a wider host window.
      setCompact(size > 0 && size <= 640);
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  const overlayOpen = compact && mobileOpen && props.railVisible;
  useLayoutEffect(() => { if (!compact || !props.railVisible) setMobileOpen(false); }, [compact, props.railVisible]);
  useLayoutEffect(() => {
    const previous = previousPresentation.current;
    previousPresentation.current = { open: overlayOpen, compact };
    const focused = root.current?.ownerDocument.activeElement;
    if (overlayOpen) (props.panelVisible ? returnButton.current : mobileMenu.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    else if ((previous.open || previous.compact !== compact) && focused && (focused === mobileMenu.current?.querySelector<HTMLButtonElement>("button") || rail.current?.contains(focused) || content.current?.querySelector('.lm-workspace-panel-pane')?.contains(focused))) {
      (compact ? mobileMenu.current?.querySelector<HTMLButtonElement>("button") : main.current)?.focus({ preventScroll: true });
    }
  }, [overlayOpen, compact, props.panelVisible]);
  const closeOverlay = () => { setMobileOpen(false); mobileMenu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); };
  const dismiss = () => {
    if (compact) { closeOverlay(); return; }
    const selected = rail.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]");
    if (selected) selected.focus({ preventScroll: true });
    props.onDismiss();
  };
  // Fit the current viewport without overwriting the user's preferred width.
  const fittedWidth = available > 0 ? Math.max(0, Math.min(width, available * 0.6, available - 264)) : width;
  const commitWidth = () => { if (!compact && props.panelVisible) props.onPanelWidth?.(Math.round(latestWidth.current)); };
  const publish = props.onTargets;
  useLayoutEffect(() => {
    publish(Object.freeze({ main: main.current!, "left-rail": rail.current!, "left-panel": panel.current!, bottom: bottom.current!, "mobile-menu": mobileMenu.current! }));
    return () => publish(null);
  }, [publish]);
  return <FocusTrap active={overlayOpen} innerRef={root}><Box className="lm-workspace-layout" style={{ ...theme.contentStyle, "--workspace-panel-width": `${width}px` }} data-compact={compact || undefined} data-mobile-open={overlayOpen || undefined} data-mobile-menu={props.mobileMenuVisible || undefined} data-window-chrome={theme.windowChrome || undefined} data-bottom={props.bottomVisible || undefined} data-rail={props.railVisible || undefined} data-panel={props.panelVisible || undefined}
    role={overlayOpen ? "dialog" : undefined} aria-modal={overlayOpen || undefined} aria-label={overlayOpen ? props.panelLabel : undefined}
    onKeyDown={event => { if (event.key === "Escape" && (compact ? overlayOpen : props.panelVisible)) {
      event.preventDefault(); dismiss();
    } }}>
    <Paper ref={rail} className="lm-workspace-rail lm-workspace-card" shadow="none" hidden={!props.railVisible} inert={compact && !overlayOpen} aria-hidden={compact && !overlayOpen || undefined} />
    <Splitter ref={content} className="lm-workspace-content" sizes={[`${fittedWidth}px`, 100]} withHandle={false} lineSize={8} step="8px" shiftStep="32px"
      attributes={{ handle: { "aria-label": props.resizeLabel ?? props.panelLabel } }}
      onSizeChange={sizes => { const next = Number.parseFloat(String(sizes[0])); if (Number.isFinite(next) && next >= 120) { latestWidth.current = next; setWidth(next); } }}
      onResizeEnd={commitWidth} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && (event.target as HTMLElement).getAttribute("role") === "separator") commitWidth(); }}
      onDoubleClick={event => { if ((event.target as HTMLElement).closest("[role=separator]")) void Promise.resolve().then(commitWidth); }}>
      <Splitter.Pane className="lm-workspace-panel-pane" defaultSize="288px" min={compact ? 0 : "12rem"} max={compact ? "100%" : "60%"} inert={compact && !overlayOpen} aria-hidden={compact && !overlayOpen || undefined}>
        <Box className="lm-workspace-return" hidden={!overlayOpen}>
          <Button ref={returnButton} className="lm-button lm-focus" variant="subtle" leftSection={<Icon name="back" />} onClick={dismiss}>{props.mainLabel}</Button>
        </Box>
        <Paper component="aside" ref={panel} className="lm-workspace-panel lm-workspace-card" shadow="none" aria-label={props.panelLabel} hidden={!props.panelVisible} />
      </Splitter.Pane>
      <Splitter.Pane className="lm-workspace-main-pane" defaultSize={100} min={compact ? 0 : "16rem"} inert={overlayOpen} aria-hidden={overlayOpen || undefined}>
        <Box component="main" ref={main} className="lm-workspace-main" aria-label={props.mainLabel} tabIndex={-1} />
        <Paper ref={bottom} className="lm-workspace-bottom lm-workspace-card" shadow="none" hidden={compact || !props.bottomVisible} />
      </Splitter.Pane>
    </Splitter>
    <UnstyledButton className="lm-workspace-backdrop" hidden={!overlayOpen} tabIndex={-1} aria-label={props.mainLabel} onClick={closeOverlay} />
    <Box className="lm-workspace-swipe-edge" hidden={!compact || overlayOpen || !props.railVisible} aria-hidden="true"
      onTouchStart={event => { const touch = event.touches[0]; swipe.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, id: touch.identifier } : null; }}
      onTouchMove={event => { const start = swipe.current; const touch = event.touches[0]; if (!touch || event.touches.length !== 1 || (start && Math.abs(touch.clientY - start.y) > 24)) swipe.current = null; }}
      onTouchCancel={() => { swipe.current = null; }}
      onTouchEnd={event => {
        const start = swipe.current; swipe.current = null;
        const touch = Array.from(event.changedTouches).find(item => item.identifier === start?.id);
        if (start && touch && touch.clientX - start.x >= 56 && touch.clientX - start.x > Math.abs(touch.clientY - start.y) * 1.5) setMobileOpen(true);
      }} />
    <Paper ref={mobileMenu} className="lm-workspace-mobile-toolbar lm-workspace-card" hidden={!compact || !props.mobileMenuVisible} />
  </Box></FocusTrap>;
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
