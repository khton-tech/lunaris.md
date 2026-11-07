import { Select } from "@mantine/core";
import type { SettingsOption } from "@lunaris/settings";
import { Icon } from "./icons.js";

interface Props {
  readonly id?: string; readonly label?: string; readonly value: string;
  readonly options: readonly SettingsOption[]; readonly disabled: boolean;
  readonly "aria-label"?: string; readonly "aria-describedby"?: string | undefined; readonly "aria-invalid"?: boolean;
  readonly onChange: (value: string) => void;
}
/** Keep both the trigger and opened options inside the themed UIKit root. */
export function SettingsSelect({ options, onChange, ...props }: Props) {
  return <Select {...props} size="sm" data={options.map(option => ({ ...option }))}
    classNames={{ input: "lm-input lm-setting-input lm-setting-select", dropdown: "lm-setting-dropdown", option: "lm-setting-option", options: "lm-setting-options" }}
    leftSection={<Icon name="vault-switch" />} leftSectionWidth={32} leftSectionPointerEvents="none" rightSection={<span />} rightSectionWidth={0}
    allowDeselect={false} clearable={false} withScrollArea={false} checkIconPosition="right"
    comboboxProps={{ withinPortal: false, position: "bottom-end", offset: 4, transitionProps: { duration: 0 } }}
    onChange={value => { if (typeof value === "string") onChange(value); }} />;
}
