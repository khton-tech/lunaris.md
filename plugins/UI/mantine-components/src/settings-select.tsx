import { useEffect } from "react";
import { Combobox, InputBase, useCombobox } from "@mantine/core";
import type { SettingsOption } from "@lunaris/settings";
import { Icon } from "./icons.js";

interface Props {
  readonly id?: string; readonly label?: string; readonly value: string;
  readonly options: readonly SettingsOption[]; readonly disabled: boolean;
  readonly portalTarget?: string | undefined;
  readonly "aria-label"?: string; readonly "aria-describedby"?: string | undefined; readonly "aria-invalid"?: boolean;
  readonly onChange: (value: string) => void;
}
/** The optional viewport overlay shares the owning component's theme. */
export function SettingsSelect({ options, onChange, portalTarget, ...props }: Props) {
  const store = useCombobox({
    onDropdownOpen: () => store.selectActiveOption(),
    onDropdownClose: () => store.resetSelectedOption(),
  });
  useEffect(() => { if (props.disabled) store.closeDropdown(); }, [props.disabled]);
  const selected = options.find(option => option.value === props.value);
  return <Combobox store={store} size="sm" withinPortal={!!portalTarget} position="bottom-end" offset={4}
    {...(portalTarget ? { portalProps: { target: portalTarget }, floatingStrategy: "fixed", hideDetached: true } : {})}
    transitionProps={{ duration: 0 }}
    classNames={{ dropdown: "lm-setting-dropdown", option: "lm-setting-option", options: "lm-setting-options" }}
    onOptionSubmit={value => {
      if (props.disabled || typeof value !== "string" || !options.some(option => option.value === value)) return;
      store.closeDropdown(); onChange(value);
    }}>
    <Combobox.Target targetType="button" withExpandedAttribute>
      {/* Let the menu handle Escape before an enclosing Mantine modal. */}
      <InputBase {...props} component="button" type="button" size="sm" pointer
        data-mantine-stop-propagation={store.dropdownOpened || undefined}
        classNames={{ input: "lm-input lm-setting-input lm-setting-select" }}
        leftSection={<Icon name="vault-switch" />} leftSectionWidth={32} leftSectionPointerEvents="none" rightSection={<span />} rightSectionWidth={0}
        onClick={() => { if (!props.disabled) store.toggleDropdown(); }}>
        {selected?.label ?? props.value}
      </InputBase>
    </Combobox.Target>
    <Combobox.Dropdown><Combobox.Options>
      {options.map(option => <Combobox.Option key={option.value} value={option.value} active={option.value === props.value}
        aria-selected={option.value === props.value} data-checked={option.value === props.value || undefined}>
        <span>{option.label}</span>{option.value === props.value && <Icon name="check" />}
      </Combobox.Option>)}
    </Combobox.Options></Combobox.Dropdown>
  </Combobox>;
}
