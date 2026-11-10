import { ActionIcon, Group } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { Icon } from "./icons.js";
interface Item { readonly id: string; readonly label: string; readonly icon: string; readonly disabled?: boolean; readonly onPress: () => void }
interface Props { readonly density?: "compact" | "comfortable"; readonly items: readonly Item[] }
export function mobileMenuProps(value: ComponentProps): Props {
 if (value.density !== undefined && value.density !== "compact" && value.density !== "comfortable") throw new TypeError("Invalid mobile menu density");
 if (!Array.isArray(value.items) || value.items.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string" || typeof item.icon !== "string" || typeof item.onPress !== "function" || (item.disabled !== undefined && typeof item.disabled !== "boolean")) || new Set(value.items.map(item => item.id)).size !== value.items.length) throw new TypeError("Invalid mobile menu items");
 return value as unknown as Props;
}
export function MobileMenuView({ props }: { props: Props }) {
 return <Group className="lm-mobile-menu-items" data-density={props.density ?? "comfortable"} gap={4} wrap="nowrap">{props.items.map(item => <ActionIcon key={item.id} className="lm-sidebar-tab lm-focus" size={props.density === "compact" ? 32 : 44} radius="xl" variant="subtle" title={item.label} aria-label={item.label} disabled={item.disabled ?? false} onClick={() => item.onPress()}><Icon name={item.icon} /></ActionIcon>)}</Group>;
}
