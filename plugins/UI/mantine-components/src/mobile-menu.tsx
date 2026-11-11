import { ActionIcon, Group, Menu } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { createPortal } from "react-dom";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
interface Choice { readonly id: string; readonly label: string; readonly title?: string }
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
export function mobileMenuProps(value: ComponentProps): Props {
 if (value.density !== undefined && value.density !== "compact" && value.density !== "comfortable") throw new TypeError("Invalid mobile menu density");
 if (!Array.isArray(value.items) || value.items.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string" ||
     typeof item.icon !== "string" || typeof item.onPress !== "function" || (item.disabled !== undefined && typeof item.disabled !== "boolean") ||
     (item.count !== undefined && (!Number.isSafeInteger(item.count) || item.count < 0)) ||
     (item.choices !== undefined && (!Array.isArray(item.choices) || !item.choices.length ||
       item.choices.some((choice: Choice) => !choice || typeof choice.id !== "string" || typeof choice.label !== "string" ||
         (choice.title !== undefined && typeof choice.title !== "string")) ||
       new Set(item.choices.map((choice: Choice) => choice.id)).size !== item.choices.length)) ||
     (item.selectedChoiceId != null && !item.choices?.some((choice: Choice) => choice.id === item.selectedChoiceId))) ||
     new Set(value.items.map(item => item.id)).size !== value.items.length) throw new TypeError("Invalid mobile menu items");
 return value as unknown as Props;
}
export function MobileMenuView({ props, theme, overlay }: {
 props: Props; theme: ReturnType<typeof resolveTheme>; overlay: { id: string; target: HTMLElement };
}) {
 return <Group style={theme.contentStyle} className="lm-mobile-menu-items" data-density={props.density ?? "comfortable"} gap={4} wrap="nowrap">
  {props.items.map(item => {
    const button = <ActionIcon key={item.id} className="lm-sidebar-tab lm-focus" size={props.density === "compact" ? 32 : 44}
      radius="xl" variant="subtle" title={item.label} aria-label={item.label} disabled={item.disabled ?? false}
      onClick={item.choices ? undefined : () => item.onPress()}>
      {item.count === undefined ? <Icon name={item.icon} /> : <span className="lm-mobile-page-count" aria-hidden="true">{item.count}</span>}
    </ActionIcon>;
    if (!item.choices) return button;
    return <Menu key={item.id} position="top" width={256} offset={10} returnFocus
      portalProps={{ target: `#${overlay.id}` }} transitionProps={{ duration: 0 }}>
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu lm-mobile-choice-menu" aria-label={item.label}>
        {item.choices.map(choice => {
          const selected = choice.id === item.selectedChoiceId;
          return <Menu.Item key={choice.id} title={choice.title ?? choice.label} aria-current={selected ? "true" : undefined}
            rightSection={selected ? <Icon name="check" /> : undefined} onClick={() => item.onPress(choice.id)}>{choice.label}</Menu.Item>;
        })}
      </Menu.Dropdown>
    </Menu>;
  })}
  {props.items.some(item => item.choices) && createPortal(
    <div id={overlay.id} className="lm-root lm-mobile-choice-overlay" data-mantine-color-scheme={theme.scheme} style={theme.contentStyle} />,
    overlay.target,
  )}
 </Group>;
}
