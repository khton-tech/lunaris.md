import { useId, useLayoutEffect, useRef } from "react";
import { ActionIcon, Badge, Box, Tabs } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { Icon } from "./icons.js";
import { useListReorder } from "./list-reorder.js";
import type { resolveTheme } from "./theme.js";

type TabEdge = "before" | "after";
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

function WorkspaceTabs({ props, panelId }: { props: TabProps; panelId: string }) {
  const { list, drop, enabled: canReorder, start, handlers } = useListReorder("x", props.tabs, props.busy ? undefined : props.onReorder);
  const selected = props.tabs.find(tab => tab.id === props.selectedId);
  const selectedButton = () => list.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
  useLayoutEffect(() => { selectedButton()?.parentElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [props.selectedId]);
  const focusSelected = (action: Promise<boolean>) => { void action.then(completed => { if (completed) selectedButton()?.focus(); }); };
  const labels = props.labels;
  return <Box className="lm-workspace-tabs" aria-busy={props.busy}>
    <Tabs unstyled value={props.selectedId} activateTabWithKeyboard={false} onChange={id => { if (id) void props.onSelect(id); }}
      className="lm-workspace-tab-strip"
      {...handlers}
      onMouseDownCapture={event => { if (event.button === 1) event.preventDefault(); }}
      onAuxClick={event => {
        if (event.button === 1 && (event.target === event.currentTarget || event.target === list.current)) {
          event.preventDefault();
          void props.onAdd();
        }
      }}>
      <Tabs.List className="lm-workspace-tab-list" ref={list} aria-label={labels.tabs}>
        {props.tabs.map(tab => <Box key={tab.id} role="presentation" className="lm-workspace-tab" mod={{ selected: tab.id === props.selectedId }}
          data-workspace-tab-id={tab.id} data-reorder-id={tab.id} data-drop={drop?.id === tab.id ? drop.edge : undefined} data-sortable={canReorder || undefined}
          onAuxClick={event => {
            if (event.button !== 1) return;
            event.preventDefault();
            event.stopPropagation();
            if (tab.closable) void props.onClose(tab.id);
          }}>
          <Tabs.Tab className="lm-workspace-tab-label lm-focus" classNames={{ tabSection: "lm-workspace-tab-section" }}
            value={tab.id} id={`${panelId}-${tab.id}`} aria-controls={panelId}
            title={tab.description} onPointerDown={event => start(event, event.currentTarget.parentElement!)} onKeyDown={event => {
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
    </Tabs>
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
  const tabStrip = props.compactTabs ? undefined : props.tabs;
  return <Box className="lm-active-screen" style={theme.contentStyle}>
    {tabStrip && <WorkspaceTabs props={tabStrip} panelId={panelId} />}
    <Box className="lm-screen-content" id={panelId} role={tabStrip ? "tabpanel" : undefined}
      aria-labelledby={tabStrip?.selectedId ? `${panelId}-${tabStrip.selectedId}` : undefined}>
      {props.ids.map(id => <Box key={id} className="lm-screen-target" data-screen-id={id}
        ref={node => { if (node) targets.current.set(id, node); else targets.current.delete(id); }}
        hidden={id !== props.activeId} inert={id !== props.activeId} aria-hidden={id !== props.activeId}
        style={{ display: id === props.activeId ? "flex" : "none", flex: "1 1 0%", minWidth: 0, minHeight: 0 }} />)}
    </Box>
    {props.compactTabs && props.tabs?.error && <Box className="lm-workspace-tab-error lm-workspace-tab-error-compact" role="status">{props.tabs.error}</Box>}
  </Box>;
}
