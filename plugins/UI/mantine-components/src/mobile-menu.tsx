import { ActionIcon, Group, Menu, useDirection } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
interface Option { readonly id: string; readonly label: string; readonly title?: string; readonly icon?: string }
interface Choice extends Option { readonly trailingAction?: Option }
interface Item {
 readonly id: string;
 readonly label: string;
 readonly icon: string;
 readonly count?: number;
 readonly disabled?: boolean;
 readonly choices?: readonly Choice[];
 readonly selectedChoiceId?: string | null;
 readonly onPress: (choiceId?: string) => void;
}
interface Props { readonly density?: "compact" | "comfortable"; readonly items: readonly Item[] }
function validOption(option: Option | undefined): option is Option {
 return !!option && typeof option.id === "string" && typeof option.label === "string" &&
   (option.title === undefined || typeof option.title === "string") &&
   (option.icon === undefined || typeof option.icon === "string");
}
function validChoices(choices: readonly Choice[]): boolean {
 if (!Array.isArray(choices) || !choices.length) return false;
 const ids = new Set<string>();
 for (const choice of choices as readonly Choice[]) {
  if (!validOption(choice) || ids.has(choice.id)) return false;
  ids.add(choice.id);
  const trailing = choice.trailingAction;
  if (trailing === undefined) continue;
  if (!validOption(trailing) || ids.has(trailing.id)) return false;
  ids.add(trailing.id);
 }
 return true;
}
export function mobileMenuProps(value: ComponentProps): Props {
 if (value.density !== undefined && value.density !== "compact" && value.density !== "comfortable") throw new TypeError("Invalid mobile menu density");
 if (!Array.isArray(value.items) || value.items.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string" ||
     typeof item.icon !== "string" || typeof item.onPress !== "function" || (item.disabled !== undefined && typeof item.disabled !== "boolean") ||
     (item.count !== undefined && (!Number.isSafeInteger(item.count) || item.count < 0)) ||
     (item.choices !== undefined && !validChoices(item.choices)) ||
     (item.selectedChoiceId != null && !item.choices?.some((choice: Choice) => choice.id === item.selectedChoiceId))) ||
     new Set(value.items.map(item => item.id)).size !== value.items.length) throw new TypeError("Invalid mobile menu items");
 return value as unknown as Props;
}
type Overlay = { readonly id: string; readonly target: HTMLElement };

function MobileAction({ item, compact, dock, overlay }: {
 item: Item; compact: boolean; dock: HTMLElement | undefined; overlay: Overlay;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const { dir } = useDirection();
  const [geometry, setGeometry] = useState<{ width: number; crossAxis: number; mainAxis: number }>();
  const measure = useCallback(() => {
    if (!dock || !trigger.current) return;
    const area = dock.getBoundingClientRect();
    if (!area.width) return;
    const anchor = trigger.current.getBoundingClientRect();
    const crossAxis = (area.left + area.width / 2 - anchor.left - anchor.width / 2) * (dir === "rtl" ? -1 : 1);
    const mainAxis = 8 + Math.max(0, anchor.top - area.top);
    setGeometry(previous => previous?.width === area.width && previous.crossAxis === crossAxis && previous.mainAxis === mainAxis
      ? previous : { width: area.width, crossAxis, mainAxis });
  }, [dock, dir]);
  const hasChoices = item.choices !== undefined;
  useLayoutEffect(() => {
    if (!dock || !hasChoices || !trigger.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    observer.observe(trigger.current);
    dock.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { observer.disconnect(); dock.removeEventListener("scroll", measure); };
  }, [dock, hasChoices, measure]);
  const button = <ActionIcon ref={trigger} className="lm-sidebar-tab lm-focus" size={compact ? 32 : 44}
    radius="xl" variant="subtle" title={item.label} aria-label={item.label} disabled={item.disabled ?? false}
    onClick={item.choices ? undefined : () => item.onPress()}>
    {item.count === undefined ? <Icon name={item.icon} /> : <span className="lm-mobile-page-count" aria-hidden="true">{item.count}</span>}
  </ActionIcon>;
  if (!item.choices) return button;
  return <Menu position="top" onOpen={measure}
    offset={geometry ? { mainAxis: geometry.mainAxis, crossAxis: geometry.crossAxis } : 8} returnFocus
    portalProps={{ target: `#${overlay.id}` }} transitionProps={{ duration: 0 }}>
    <Menu.Target>{button}</Menu.Target>
    <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu lm-mobile-choice-menu" aria-label={item.label}
      style={dock ? { width: geometry?.width ?? "70vw" } : undefined}>
      {item.choices.map(choice => {
        const selected = choice.id === item.selectedChoiceId;
        const primary = <Menu.Item key={choice.id} title={choice.title ?? choice.label} aria-current={selected ? "true" : undefined}
          leftSection={choice.icon ? <Icon name={choice.icon} /> : undefined}
          rightSection={selected ? <Icon name="check" /> : undefined} onClick={() => item.onPress(choice.id)}>{choice.label}</Menu.Item>;
        const trailing = choice.trailingAction;
        if (!trailing) return primary;
        return <div key={choice.id} className="lm-mobile-choice-row" role="group" aria-label={choice.label}>
          {primary}
          <Menu.Item className="lm-mobile-choice-trailing" aria-label={trailing.label} title={trailing.title ?? trailing.label}
            onClick={() => item.onPress(trailing.id)}><Icon name={trailing.icon ?? "actions"} /></Menu.Item>
        </div>;
      })}
    </Menu.Dropdown>
  </Menu>;
}

export function MobileMenuView({ props, theme, overlay, target }: {
 props: Props; theme: ReturnType<typeof resolveTheme>; overlay: Overlay; target: HTMLElement;
}) {
 const compact = props.density === "compact";
 return <Group style={theme.contentStyle} className="lm-mobile-menu-items" data-density={props.density ?? "comfortable"}
   gap={compact ? 4 : 0} justify={compact ? "start" : "space-evenly"} wrap="nowrap">
  {props.items.map(item => <MobileAction key={item.id} item={item} compact={compact} overlay={overlay} dock={compact ? undefined : target} />)}
  {props.items.some(item => item.choices) && createPortal(
    <div id={overlay.id} className="lm-root lm-mobile-choice-overlay" data-mantine-color-scheme={theme.scheme} style={theme.contentStyle} />,
    overlay.target,
  )}
 </Group>;
}
