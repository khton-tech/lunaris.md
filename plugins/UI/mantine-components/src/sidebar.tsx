import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ActionIcon, Box, FocusTrap, Paper, Splitter, Stack, UnstyledButton } from "@mantine/core";
import { observeVirtualKeyboard } from "@lunaris/components";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

type Regions = Readonly<Record<"main" | "left-rail" | "left-panel" | "bottom" | "mobile-menu" | "mobile-launcher", HTMLElement>>;
interface LayoutProps {
  readonly mobileLauncherVisible?: boolean; readonly mobileMenuVisible?: boolean; readonly mobileOpen?: boolean; readonly onMobileOpen?: (open: boolean) => void;
  readonly bottomVisible?: boolean; readonly railVisible: boolean; readonly panelVisible: boolean; readonly mainLabel: string; readonly panelLabel: string;
  readonly onTargets: (targets: Regions | null, compact?: boolean) => void; readonly onDismiss: () => void;
  readonly panelWidth?: number; readonly resizeLabel?: string; readonly onPanelWidth?: (width: number) => void;
}
export function layoutProps(value: ComponentProps): LayoutProps {
  if ((value.mobileLauncherVisible !== undefined && typeof value.mobileLauncherVisible !== "boolean") || (value.mobileOpen !== undefined && typeof value.mobileOpen !== "boolean") || (value.mobileMenuVisible !== undefined && typeof value.mobileMenuVisible !== "boolean") || (value.onMobileOpen !== undefined && typeof value.onMobileOpen !== "function")) throw new TypeError("Invalid mobile workspace presentation.");
  if (value.bottomVisible !== undefined && typeof value.bottomVisible !== "boolean") throw new TypeError("Invalid bottom visibility.");
  if (typeof value.railVisible !== "boolean" || typeof value.panelVisible !== "boolean" || typeof value.mainLabel !== "string" || typeof value.panelLabel !== "string" || typeof value.onTargets !== "function" || typeof value.onDismiss !== "function") throw new TypeError("Invalid workspace layout props.");
  if ((value.panelWidth !== undefined && (typeof value.panelWidth !== "number" || !Number.isFinite(value.panelWidth) || value.panelWidth < 120 || value.panelWidth > 4096)) ||
    (value.resizeLabel !== undefined && typeof value.resizeLabel !== "string") || (value.onPanelWidth !== undefined && typeof value.onPanelWidth !== "function")) throw new TypeError("Invalid side panel sizing props.");
  return value as unknown as LayoutProps;
}
export function WorkspaceLayout({ props, theme }: { props: LayoutProps; theme: ReturnType<typeof resolveTheme> }) {
  const bottom = useRef<HTMLDivElement>(null); const main = useRef<HTMLDivElement>(null); const rail = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const panelPane = useRef<HTMLDivElement>(null);
  const mobileMenu = useRef<HTMLDivElement>(null);
  const mobileLauncher = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [floatingHidden, setFloatingHidden] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const scrollPositions = useRef(new WeakMap<HTMLElement, number>());
  const [localOpen, setLocalOpen] = useState(false);
  const mobileOpen = props.mobileOpen ?? localOpen;
  const setMobileOpen = (open: boolean) => { setLocalOpen(open); props.onMobileOpen?.(open); };
  const previousPresentation = useRef({ open: false, compact: false });
  const [available, setAvailable] = useState(0); const [compact, setCompact] = useState(false);
  const [width, setWidth] = useState(props.panelWidth ?? 256); const latestWidth = useRef(width);
  useLayoutEffect(() => { latestWidth.current = props.panelWidth ?? 256; setWidth(latestWidth.current); }, [props.panelWidth]);
  useLayoutEffect(() => {
    const element = root.current!;
    let keyboardVisible = false;
    let fullHeight = 0;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!keyboardVisible || fullHeight === 0) fullHeight = height;
      setAvailable(content.current!.getBoundingClientRect().width);
      // Keep the same layout when the keyboard temporarily shortens the region.
      setCompact(width > 0 && (width <= 760 || (width <= 960 && fullHeight > 0 && fullHeight <= 500)));
    };
    const unsubscribe = observeVirtualKeyboard(element.ownerDocument.defaultView!, viewport => {
      keyboardVisible = viewport !== null;
      setKeyboardOpen(keyboardVisible);
      if (!keyboardVisible) measure();
    });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => { observer.disconnect(); unsubscribe(); };
  }, []);
  const overlayOpen = compact && mobileOpen && props.railVisible;
  const openFromSwipe = useEffectEvent(() => {
    opener.current = null;
    setMobileOpen(true);
  });
  useLayoutEffect(() => {
    if (!compact || overlayOpen || keyboardOpen || !props.railVisible) return;
    const element = root.current!;
    const region = main.current!;
    const document = element.ownerDocument;
    const minimumDrag = 8;
    let swipe: { id: number; x: number; y: number; width: number; threshold: number; dragging: boolean } | null = null;
    const reset = () => {
      swipe = null;
      element.removeAttribute("data-mobile-dragging");
      element.style.removeProperty("--workspace-drawer-reveal");
      element.style.removeProperty("--workspace-drawer-opacity");
    };
    const start = (event: TouchEvent) => {
      if (swipe) reset();
      if (event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      const target = event.target;
      if (!(target instanceof document.defaultView!.Element) || !region.contains(target) ||
          target.closest('input, textarea, [role="slider"], [role="menu"], [role="listbox"]')) return;
      const width = rail.current!.getBoundingClientRect().width +
        (props.panelVisible ? panelPane.current!.getBoundingClientRect().width : 0);
      if (width <= 0) return;
      // Shorten the required travel when the swipe starts near the right edge.
      const remaining = region.getBoundingClientRect().right - touch.clientX;
      const threshold = Math.min(96, width * 0.35, Math.max(minimumDrag, remaining * 0.65));
      swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, width, threshold, dragging: false };
    };
    const move = (event: TouchEvent) => {
      if (!swipe) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch?.identifier !== swipe.id) { reset(); return; }
      const dx = touch.clientX - swipe.x;
      const dy = Math.abs(touch.clientY - swipe.y);
      if (!swipe.dragging) {
        if (Math.max(Math.abs(dx), dy) < minimumDrag) return;
        if (!event.cancelable || dx < minimumDrag || dx < dy * 1.5) { reset(); return; }
        swipe.dragging = true;
        element.setAttribute("data-mobile-dragging", "");
      }
      event.preventDefault();
      const reveal = Math.max(0, Math.min(swipe.width, dx));
      element.style.setProperty("--workspace-drawer-reveal", `${reveal}px`);
      element.style.setProperty("--workspace-drawer-opacity", String(reveal / swipe.width));
    };
    const end = (event: TouchEvent) => {
      const gesture = swipe;
      if (gesture?.dragging && event.touches.length === 0) {
        const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.id);
        if (touch && touch.clientX - gesture.x >= gesture.threshold) openFromSwipe();
      }
      reset();
    };
    // Observe starts across the document so a second finger outside Workspace can cancel.
    document.addEventListener("touchstart", start, { capture: true, passive: true });
    element.addEventListener("touchmove", move, { capture: true, passive: false });
    element.addEventListener("touchend", end, true);
    element.addEventListener("touchcancel", reset, true);
    return () => {
      document.removeEventListener("touchstart", start, true);
      element.removeEventListener("touchmove", move, true);
      element.removeEventListener("touchend", end, true);
      element.removeEventListener("touchcancel", reset, true);
      reset();
    };
  }, [compact, overlayOpen, keyboardOpen, props.railVisible, props.panelVisible, available]);
  useLayoutEffect(() => { if (!compact || !props.railVisible) setMobileOpen(false); }, [compact, props.railVisible]);
  useLayoutEffect(() => {
    const previous = previousPresentation.current;
    previousPresentation.current = { open: overlayOpen, compact };
    const focused = root.current?.ownerDocument.activeElement;
    if (previous.open && !overlayOpen) {
      setFloatingHidden(false);
      const trigger = opener.current;
      opener.current = null;
      const canRestore = compact && trigger?.isConnected && !trigger.disabled && !trigger.closest("[hidden],[inert]") &&
        trigger.ownerDocument.defaultView?.getComputedStyle(trigger).display !== "none";
      (canRestore ? trigger : main.current)?.focus({ preventScroll: true });
    } else if (overlayOpen && (!previous.open || props.panelVisible && focused === panel.current)) {
      (rail.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]") ?? rail.current?.querySelector<HTMLButtonElement>("button") ?? panel.current)?.focus({ preventScroll: true });
    } else if (!overlayOpen && previous.compact !== compact && focused && (mobileLauncher.current?.contains(focused) ||
        mobileMenu.current?.contains(focused) || rail.current?.contains(focused) || panel.current?.contains(focused))) {
      main.current?.focus({ preventScroll: true });
    }
  }, [overlayOpen, compact, props.panelVisible]);
  useLayoutEffect(() => {
    const region = main.current!;
    if (!compact || overlayOpen) return;
    let gesture: { id: number; x: number; y: number; hidden?: boolean } | null = null;
    const floatingFocused = () => mobileLauncher.current?.contains(region.ownerDocument.activeElement) || mobileMenu.current?.contains(region.ownerDocument.activeElement);
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof region.ownerDocument.defaultView!.HTMLElement) || floatingFocused() ||
          (target !== region && !target.hasAttribute("data-workspace-scroll"))) return;
      const position = Math.max(0, target.scrollTop); const previous = scrollPositions.current.get(target) ?? 0;
      if (keyboardOpen || gesture?.hidden !== undefined) { scrollPositions.current.set(target, position); return; }
      if (position !== previous && (Math.abs(position - previous) >= 8 || position === 0)) { setFloatingHidden(position > previous); scrollPositions.current.set(target, position); }
    };
    const onTouchStart = (event: TouchEvent) => {
      if (keyboardOpen || (event.target instanceof Element && event.target.closest('[role="menu"],[role="listbox"]'))) return;
      const touch = event.touches[0];
      gesture = event.touches.length === 1 && touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.defaultPrevented || !gesture || event.touches.length !== 1 || !touch || touch.identifier !== gesture.id) { gesture = null; return; }
      const dx = touch.clientX - gesture.x; const dy = touch.clientY - gesture.y;
      if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy)) { gesture = null; return; }
      if (Math.abs(dy) < 24 || Math.abs(dy) <= Math.abs(dx) * 1.5) return;
      const hidden = dy < 0;
      // A deliberate content gesture takes over from restored launcher focus.
      if (hidden && floatingFocused()) region.focus({ preventScroll: true });
      setFloatingHidden(hidden);
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, hidden };
    };
    const endGesture = () => { gesture = null; };
    // Observe intent even on short documents; leave scrolling/editing to the view.
    const options = { capture: true, passive: true };
    region.addEventListener("scroll", onScroll, true);
    region.addEventListener("touchstart", onTouchStart, options);
    region.addEventListener("touchmove", onTouchMove, options);
    region.addEventListener("touchend", endGesture, options);
    region.addEventListener("touchcancel", endGesture, options);
    return () => {
      region.removeEventListener("scroll", onScroll, true);
      region.removeEventListener("touchstart", onTouchStart, true);
      region.removeEventListener("touchmove", onTouchMove, true);
      region.removeEventListener("touchend", endGesture, true);
      region.removeEventListener("touchcancel", endGesture, true);
    };
  }, [compact, overlayOpen, keyboardOpen]);
  const closeOverlay = () => setMobileOpen(false);
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
    publish(Object.freeze({ main: main.current!, "left-rail": rail.current!, "left-panel": panel.current!, bottom: bottom.current!, "mobile-menu": mobileMenu.current!, "mobile-launcher": mobileLauncher.current! }), compact);
  }, [publish, compact]);
  useLayoutEffect(() => () => publish(null), [publish]);
  const floatingInactive = overlayOpen || keyboardOpen;
  return <FocusTrap active={overlayOpen} innerRef={root}><Box className="lm-workspace-layout" style={{ ...theme.contentStyle, "--workspace-panel-width": `${width}px`, "--workspace-content-width": `${available}px` }} data-launcher={props.mobileLauncherVisible || undefined} data-compact={compact || undefined} data-mobile-open={overlayOpen || undefined} data-mobile-menu={props.mobileMenuVisible || undefined} data-window-chrome={theme.windowChrome || undefined} data-bottom={props.bottomVisible || undefined} data-rail={props.railVisible || undefined} data-panel={props.panelVisible || undefined}
    role={overlayOpen ? "dialog" : undefined} aria-modal={overlayOpen || undefined} aria-label={overlayOpen ? props.panelLabel : undefined}
    onClickCapture={event => {
      if (!compact || overlayOpen) return;
      opener.current = (event.target as Element).closest<HTMLButtonElement>("button");
    }}
    onKeyDown={event => { if (event.key === "Escape" && (compact ? overlayOpen : props.panelVisible)) {
      event.preventDefault(); dismiss();
    } }}>
    <Paper ref={rail} className="lm-workspace-rail lm-workspace-card" shadow="none" hidden={!props.railVisible} inert={compact && !overlayOpen} aria-hidden={compact && !overlayOpen || undefined} />
    <Splitter ref={content} className="lm-workspace-content" sizes={[`${fittedWidth}px`, 100]} withHandle={false} lineSize={8} step="8px" shiftStep="32px"
      attributes={{ handle: { "aria-label": props.resizeLabel ?? props.panelLabel } }}
      onSizeChange={sizes => { const next = Number.parseFloat(String(sizes[0])); if (Number.isFinite(next) && next >= 120) { latestWidth.current = next; setWidth(next); } }}
      onResizeEnd={commitWidth} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && (event.target as HTMLElement).getAttribute("role") === "separator") commitWidth(); }}
      onDoubleClick={event => { if ((event.target as HTMLElement).closest("[role=separator]")) void Promise.resolve().then(commitWidth); }}>
      <Splitter.Pane ref={panelPane} className="lm-workspace-panel-pane" defaultSize="256px" min={compact ? 0 : "12rem"} max={compact ? "100%" : "60%"} inert={compact && !overlayOpen} aria-hidden={compact && !overlayOpen || undefined}>
        <Paper component="aside" ref={panel} tabIndex={-1} className="lm-workspace-panel lm-workspace-card" shadow="none" aria-label={props.panelLabel} hidden={!props.panelVisible} />
      </Splitter.Pane>
      <Splitter.Pane className="lm-workspace-main-pane" defaultSize={100} min={compact ? 0 : "16rem"} inert={overlayOpen} aria-hidden={overlayOpen || undefined}>
        <Box component="main" ref={main} className="lm-workspace-main" aria-label={props.mainLabel} tabIndex={-1}
          style={{ "--workspace-dock-inset": compact && props.mobileMenuVisible && !keyboardOpen ? "calc(60px + 2 * var(--vault-border))" : undefined,
            "--workspace-header-navigation-display": keyboardOpen ? "none" : undefined }} />
        <Paper ref={bottom} className="lm-workspace-bottom lm-workspace-card" shadow="none" hidden={compact || !props.bottomVisible} />
      </Splitter.Pane>
    </Splitter>
    <UnstyledButton className="lm-workspace-backdrop" hidden={!compact} inert={!overlayOpen} aria-hidden={!overlayOpen || undefined} tabIndex={-1} aria-label={props.mainLabel} onClick={closeOverlay} />
    <Paper ref={mobileLauncher} className="lm-workspace-mobile-launcher lm-workspace-card" hidden={!compact || !props.mobileLauncherVisible || floatingHidden || floatingInactive} inert={floatingInactive} aria-hidden={floatingInactive || undefined} />
    <Paper ref={mobileMenu} className="lm-workspace-mobile-toolbar lm-workspace-card" hidden={!compact || !props.mobileMenuVisible || floatingHidden || floatingInactive} inert={floatingInactive} aria-hidden={floatingInactive || undefined} />
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
