import { Combobox, Menu } from "@mantine/core";
import type { ComponentProps } from "react";

type DropdownProps =
  | ({ kind?: "menu" } & ComponentProps<typeof Menu.Dropdown>)
  | ({ kind: "submenu" } & ComponentProps<typeof Menu.Sub.Dropdown>)
  | ({ kind: "listbox" } & ComponentProps<typeof Combobox.Dropdown>);

/** One themed surface for action menus, submenus and value pickers. */
export function ProductDropdown(props: DropdownProps) {
  const className = ["lm-dropdown", props.className].filter(Boolean).join(" ");
  if (props.kind === "listbox") {
    const { kind, ...dropdown } = props;
    return <Combobox.Dropdown {...dropdown} className={className} />;
  }
  if (props.kind === "submenu") {
    const { kind, ...dropdown } = props;
    return <Menu.Sub.Dropdown {...dropdown} className={className} />;
  }
  const { kind, ...dropdown } = props;
  return <Menu.Dropdown {...dropdown} className={className} />;
}
