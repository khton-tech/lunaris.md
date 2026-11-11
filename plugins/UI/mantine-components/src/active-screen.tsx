import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { ActionIcon, Badge, Box, Tabs } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { Icon } from "./icons.js";
import type { resolveTheme } from "./theme.js";

type TabEdge = "before" | "after";
interface TabDrop { readonly id: string; readonly edge: TabEdge }
interface TabDrag {
  readonly id: string;
  readonly pointerId: number;
  readonly button: HTMLButtonElement;
  readonly element: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly grip: number;
  offset: number;
  moved: boolean;
}

interface ScreenProps {
  readonly ids: readonly string[];
  readonly activeId: string | null;
  readonly onTargets: (targets: ReadonlyMap<string, HTMLElement> | null) => void;
  readonly tabs?: TabProps;
  readonly compactTabs?: boolean;
}

interface TabProps {
  readonly tabs: readonly { readonly id: string; readonly title: string; readonly description: string; readonly location: string;
    readonly extension?: string; readonly closable: boolean }[];
  readonly selectedId: string | null;
  readonly busy: boolean;
  readonly error: string;
  readonly labels: { readonly tabs: string; readonly add: string; readonly close: string; readonly back: string; readonly forward: string };
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly onAdd: () => Promise<boolean>;
  readonly onSelect: (id: string) => Promise<boolean>;
  readonly onClose: (id: string) => Promise<boolean>;
  readonly onReorder?: (id: string, targetId: string, edge: TabEdge) => void;
  readonly onNavigate: (step: -1 | 1) => Promise<boolean>;
}

function validateTabs(value: unknown): void {
  const props = value as Partial<TabProps> | null;
  if (!props || !Array.isArray(props.tabs) || props.tabs.some(tab => !tab || typeof tab.closable !== "boolean" ||
      (tab.extension !== undefined && typeof tab.extension !== "string") ||
      ["id", "title", "description", "location"].some(key => typeof tab[key] !== "string")) ||
    new Set(props.tabs.map(tab => tab.id)).size !== props.tabs.length ||
    (props.selectedId !== null && !props.tabs.some(tab => tab.id === props.selectedId)) ||
    !props.labels || ["tabs", "add", "close", "back", "forward"].some(key => typeof props.labels![key as keyof TabProps["labels"]] !== "string") ||
    typeof props.error !== "string" || ["busy", "canGoBack", "canGoForward"].some(key => typeof props[key as keyof TabProps] !== "boolean") ||
    ["onAdd", "onSelect", "onClose", "onNavigate"].some(key => typeof props[key as keyof TabProps] !== "function") ||
    (props.onReorder !== undefined && typeof props.onReorder !== "function")) {
    throw new TypeError("Invalid workspace tabs props.");
  }
}

export function activeScreenProps(value: ComponentProps): ScreenProps {
  if (!Array.isArray(value.ids) || value.ids.some(id => typeof id !== "string") || new Set(value.ids).size !== value.ids.length ||
      (value.activeId !== null && (typeof value.activeId !== "string" || !value.ids.includes(value.activeId))) || typeof value.onTargets !== "function" ||
      (value.compactTabs !== undefined && typeof value.compactTabs !== "boolean")) throw new TypeError("Invalid active screen props.");
  if (value.tabs !== undefined) validateTabs(value.tabs);
  return value as unknown as ScreenProps;
}

function WorkspaceTabs({ props, panelId, compact }: { props: TabProps; panelId: string; compact: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<TabDrag | null>(null);
  const suppressClick = useRef(false);
  const [drop, setDrop] = useState<TabDrop | null>(null);
  const canReorder = !compact && !props.busy && !!props.onReorder && props.tabs.length > 1;
  const selected = props.tabs.find(tab => tab.id === props.selectedId);
  const selectedButton = () => list.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
  useLayoutEffect(() => { selectedButton()?.parentElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [props.selectedId, compact]);
  useLayoutEffect(() => {
    const current = drag.current;
    if (current && (!canReorder || !props.tabs.some(tab => tab.id === current.id))) resetDrag();
  }, [canReorder, props.tabs]);
  const focusSelected = (action: Promise<boolean>) => { void action.then(completed => { if (completed) selectedButton()?.focus(); }); };
  function resetDrag(): void {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    current.element.style.removeProperty("transform");
    delete current.element.dataset.dragging;
    if (current.button.hasPointerCapture(current.pointerId)) current.button.releasePointerCapture(current.pointerId);
    setDrop(null);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string): void {
    if (!canReorder || drag.current || event.button !== 0 || event.pointerType === "touch") return;
    const button = event.currentTarget;
    const element = button.parentElement!;
    button.setPointerCapture(event.pointerId);
    drag.current = { id, button, element, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      grip: event.clientX - element.getBoundingClientRect().left, offset: 0, moved: false };
  }
  function positionTab(current: TabDrag, clientX: number): TabDrop | null {
    const row = list.current;
    if (!row) return null;
    const tabs = [...row.querySelectorAll<HTMLElement>("[data-workspace-tab-id]")];
    const index = tabs.indexOf(current.element);
    if (index === -1) return null;
    const direction = row.ownerDocument.defaultView?.getComputedStyle(row).direction === "rtl" ? -1 : 1;
    const rect = current.element.getBoundingClientRect();
    const origin = rect.left - current.offset;
    const leftmost = tabs[direction === 1 ? 0 : tabs.length - 1]!;
    const rightmost = tabs[direction === 1 ? tabs.length - 1 : 0]!;
    const left = leftmost === current.element ? origin : leftmost.getBoundingClientRect().left;
    const right = rightmost === current.element ? origin + rect.width : rightmost.getBoundingClientRect().right;
    const nextLeft = Math.max(left, Math.min(right - rect.width, clientX - current.grip));
    current.offset = nextLeft - origin;
    const center = nextLeft + rect.width / 2;
    const step = current.offset * direction < 0 ? -1 : 1;
    let target: TabDrop | null = null;
    for (let i = index + step; i >= 0 && i < tabs.length; i += step) {
      const tab = tabs[i]!;
      const box = tab.getBoundingClientRect();
      if ((center - box.left - box.width / 2) * direction * step < 0) break;
      target = { id: tab.dataset.workspaceTabId!, edge: step < 0 ? "before" : "after" };
    }
    current.element.style.transform = `translateX(${current.offset}px)`;
    return target;
  }
  function scrollWhileDragging(clientX: number): void {
    const element = list.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const { left, right, width } = element.getBoundingClientRect();
    const edge = Math.min(24, width / 4);
    if (clientX >= left && clientX < left + edge) element.scrollLeft -= edge;
    if (clientX <= right && clientX > right - edge) element.scrollLeft += edge;
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved) {
      const horizontal = Math.abs(event.clientX - current.startX);
      if (horizontal >= 5 || Math.abs(event.clientY - current.startY) >= 5) suppressClick.current = true;
      if (horizontal < 5) return;
      current.moved = true;
      current.element.dataset.dragging = "";
    }
    scrollWhileDragging(event.clientX);
    const next = positionTab(current, event.clientX);
    setDrop(previous => previous?.id === next?.id && previous?.edge === next?.edge ? previous : next);
  }
  function finishDrag(event: PointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = current.moved ? positionTab(current, event.clientX) : null;
    resetDrag();
    if (target) props.onReorder?.(current.id, target.id, target.edge);
  }
  function cancelDrag(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId === event.pointerId) resetDrag();
  }
  const labels = props.labels;
  return <Box className="lm-workspace-tabs" data-compact-tabs={compact || undefined} aria-busy={props.busy}>
    {!compact && <Tabs unstyled value={props.selectedId} activateTabWithKeyboard={false} onChange={id => { if (id) void props.onSelect(id); }}
      className="lm-workspace-tab-strip"
      onPointerDownCapture={() => { if (!drag.current) suppressClick.current = false; }}
      onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
      onClickCapture={event => {
        if (!suppressClick.current || event.detail === 0) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDownCapture={event => { if (event.button === 1) event.preventDefault(); }}
      onAuxClick={event => {
        if (event.button === 1 && (event.target === event.currentTarget || event.target === list.current)) {
          event.preventDefault();
          void props.onAdd();
        }
      }}>
      <Tabs.List className="lm-workspace-tab-list" ref={list} aria-label={labels.tabs}>
        {props.tabs.map(tab => <Box key={tab.id} role="presentation" className="lm-workspace-tab" mod={{ selected: tab.id === props.selectedId }}
          data-workspace-tab-id={tab.id} data-drop={drop?.id === tab.id ? drop.edge : undefined} data-sortable={canReorder || undefined}
          onAuxClick={event => {
            if (event.button !== 1) return;
            event.preventDefault();
            event.stopPropagation();
            if (tab.closable) void props.onClose(tab.id);
          }}>
          <Tabs.Tab className="lm-workspace-tab-label lm-focus" classNames={{ tabSection: "lm-workspace-tab-section" }}
            value={tab.id} id={`${panelId}-${tab.id}`} aria-controls={panelId}
            title={tab.description} onPointerDown={event => startDrag(event, tab.id)} onKeyDown={event => {
              if (event.key === "Delete" && tab.closable) { event.preventDefault(); focusSelected(props.onClose(tab.id)); }
            }} rightSection={tab.extension && <Badge className="lm-workspace-tab-extension" size="xs" radius="xl" variant="light">{tab.extension}</Badge>}>
            {tab.title}
          </Tabs.Tab>
          {tab.closable && <ActionIcon type="button" variant="subtle" className="lm-workspace-tab-action" title={labels.close}
            aria-label={`${labels.close} — ${tab.title}`} tabIndex={tab.id === props.selectedId ? 0 : -1}
            onClick={event => {
              const closing = props.onClose(tab.id);
              if (event.detail === 0) focusSelected(closing);
            }}><Icon name="window-close" /></ActionIcon>}
        </Box>)}
      </Tabs.List>
      <ActionIcon type="button" variant="subtle" className="lm-workspace-tab-action lm-workspace-tab-add" title={labels.add}
        aria-label={labels.add} onClick={event => {
          const adding = props.onAdd();
          if (event.detail === 0) focusSelected(adding);
        }}><Icon name="create" /></ActionIcon>
    </Tabs>}
    <Box className="lm-workspace-tab-navigation">
      <ActionIcon type="button" variant="subtle" className="lm-workspace-tab-action" title={labels.back} aria-label={labels.back}
        disabled={!props.canGoBack} onClick={() => { void props.onNavigate(-1); }}><Icon name="back" /></ActionIcon>
      <ActionIcon type="button" variant="subtle" className="lm-workspace-tab-action" title={labels.forward} aria-label={labels.forward}
        disabled={!props.canGoForward} onClick={() => { void props.onNavigate(1); }}><Icon name="next" /></ActionIcon>
      {selected && <Box className="lm-workspace-tab-location" title={selected.description}>{selected.location}</Box>}
    </Box>
    {props.error && <Box className="lm-workspace-tab-error" role="status">{props.error}</Box>}
  </Box>;
}

export function ActiveScreenView({ props, theme }: { props: ScreenProps; theme: ReturnType<typeof resolveTheme> }) {
  const panelId = useId();
  const targets = useRef(new Map<string, HTMLElement>());
  const signature = JSON.stringify(props.ids); const publish = props.onTargets;
  useLayoutEffect(() => { publish(new Map(targets.current)); }, [signature, publish]);
  useLayoutEffect(() => () => publish(null), [publish]);
  const hasTabStrip = props.tabs && !props.compactTabs;
  return <Box className="lm-active-screen" style={theme.contentStyle}>
    {props.tabs && <WorkspaceTabs props={props.tabs} panelId={panelId} compact={props.compactTabs ?? false} />}
    <Box className="lm-screen-content" id={panelId} role={hasTabStrip ? "tabpanel" : undefined}
      aria-labelledby={hasTabStrip && props.tabs?.selectedId ? `${panelId}-${props.tabs.selectedId}` : undefined}>
      {props.ids.map(id => <Box key={id} className="lm-screen-target" data-screen-id={id}
        ref={node => { if (node) targets.current.set(id, node); else targets.current.delete(id); }}
        hidden={id !== props.activeId} inert={id !== props.activeId} aria-hidden={id !== props.activeId}
        style={{ display: id === props.activeId ? "flex" : "none", flex: "1 1 0%", minWidth: 0, minHeight: 0 }} />)}
    </Box>
  </Box>;
}
