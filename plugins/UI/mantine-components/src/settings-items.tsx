import { useEffect, useId, useState } from "react";
import { Box, Button, Group, NumberInput, Slider, Stack, Switch, Text, TextInput } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { SettingsItem } from "@lunaris/settings";
import type { resolveTheme } from "./theme.js";
import { SettingsSelect } from "./settings-select.js";

interface Props { readonly items: readonly SettingsItem[]; readonly onChange: (id: string, value: unknown) => void; readonly onRetry: (id: string) => void; readonly onReset?: (id: string) => void }
export function settingsItemsProps(value: ComponentProps): Props {
  if (!Array.isArray(value.items) || new Set(value.items.map(item => item?.id)).size !== value.items.length || typeof value.onChange !== "function" || typeof value.onRetry !== "function" || (value.onReset !== undefined && typeof value.onReset !== "function") ||
      !value.items.every(item => item && typeof item.id === "string" && typeof item.title === "string" &&
        (item.description === undefined || typeof item.description === "string") && (item.error === undefined || typeof item.error === "string") &&
        (item.disabled === undefined || typeof item.disabled === "boolean") && (item.layout === undefined || item.layout === "inline" || item.layout === "stacked") &&
        (item.type === "select" ? typeof item.value === "string" && Array.isArray(item.options) && item.options.every((option: { value?: unknown; label?: unknown } | null) => option && typeof option.value === "string" && typeof option.label === "string") && new Set(item.options.map((option: { value: string }) => option.value)).size === item.options.length :
          item.type === "switch" ? typeof item.value === "boolean" : item.type === "text" ? typeof item.value === "string" && (item.placeholder === undefined || typeof item.placeholder === "string") :
            (item.type === "number" || item.type === "slider") && typeof item.value === "number" && Number.isFinite(item.value) && [item.min, item.max, item.step].every(value => value === undefined || typeof value === "number" && Number.isFinite(value)) &&
            (item.type !== "slider" || typeof item.min === "number" && typeof item.max === "number" && typeof item.step === "number" && item.min < item.max && item.step > 0 && item.value >= item.min && item.value <= item.max && (item.unit === undefined || typeof item.unit === "string"))) &&
        (item.retryLabel === undefined || typeof item.retryLabel === "string") &&
        (item.resetDisabled === undefined || typeof item.resetDisabled === "boolean") &&
        ((item.resetLabel === undefined && item.onReset === undefined) || typeof item.resetLabel === "string" && !!item.resetLabel.trim() && typeof item.onReset === "function" && typeof value.onReset === "function"))) throw new TypeError("Invalid declarative settings items.");
  return value as unknown as Props;
}
function SettingsSlider({ item, id, describedBy, onChange }: { item: Extract<SettingsItem, { type: "slider" }>; id: string; describedBy: string | undefined; onChange: Props["onChange"] }) {
  const [value, setValue] = useState(item.value);
  useEffect(() => { setValue(item.value); }, [item.value, item.disabled]);
  const format = (value: number) => `${Number(value.toFixed(4))}${item.unit ? ` ${item.unit}` : ""}`;
  return <Group className="lm-setting-slider-control" gap="md" wrap="nowrap">
    <Slider className="lm-setting-slider" color="var(--vault-text)" size="sm" min={item.min} max={item.max} step={item.step}
      value={value} onChange={setValue} onChangeEnd={value => { if (!item.disabled && value !== item.value) onChange(item.id, value); }}
      disabled={!!item.disabled} label={null} thumbLabel={item.title} thumbValueText={format}
      thumbProps={{ id, "aria-describedby": describedBy, "aria-invalid": !!item.error }} />
    <Text className="lm-setting-slider-value" size="sm" aria-hidden="true">{format(value)}</Text>
  </Group>;
}
function SettingRow({ item, onChange, onRetry, onReset }: { item: SettingsItem; onChange: Props["onChange"]; onRetry: Props["onRetry"]; onReset: Props["onReset"] }) {
  const id = useId(); const descriptionId = `${id}-description`; const errorId = `${id}-error`;
  const describedBy = [item.description ? descriptionId : "", item.error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const staticValue = item.type === "select" && item.options.length === 1 && item.options[0]!.value === item.value;
  const shared = { id, "aria-label": item.title, "aria-describedby": describedBy, "aria-invalid": !!item.error, disabled: !!item.disabled };
  let control;
  switch (item.type) {
    case "select": control = staticValue ? <Text className="lm-setting-static-value" size="sm" aria-describedby={describedBy}>{item.options[0]!.label}</Text> :
      <SettingsSelect {...shared} value={item.value} options={item.options} disabled={!!item.disabled || !item.options.length} onChange={value => onChange(item.id, value)} />; break;
    case "switch": control = <Switch {...shared} checked={item.value} onChange={event => onChange(item.id, event.currentTarget.checked)} />; break;
    case "text": control = <TextInput {...shared} size="sm" classNames={{ input: "lm-input lm-setting-input" }} value={item.value} placeholder={item.placeholder} onChange={event => onChange(item.id, event.currentTarget.value)} />; break;
    case "number": control = <NumberInput {...shared} size="sm" classNames={{ input: "lm-input lm-setting-input" }} value={item.value} {...(item.min === undefined ? {} : { min: item.min })} {...(item.max === undefined ? {} : { max: item.max })} {...(item.step === undefined ? {} : { step: item.step })} onChange={value => { if (typeof value === "number" && Number.isFinite(value)) onChange(item.id, value); }} />; break;
    case "slider": control = <SettingsSlider item={item} id={id} describedBy={describedBy} onChange={onChange} />; break;
  }
  return <Box className="lm-setting-row" data-settings-item={item.id} data-layout={item.layout ?? "inline"}>
    <Stack className="lm-setting-label" gap={4}>
      <Text component={staticValue ? "div" : "label"} htmlFor={staticValue ? undefined : id} size="sm" fw={400}>{item.title}</Text>
      {item.description && <Text id={descriptionId} size="sm" c="dimmed">{item.description}</Text>}
    </Stack>
    <Stack className="lm-setting-control" gap="xs">
      {control}
      {item.onReset && <Button className="lm-setting-reset" variant="subtle" size="compact-xs" disabled={!!item.disabled || !!item.resetDisabled} onClick={() => onReset?.(item.id)}>{item.resetLabel}</Button>}
      {item.error && <Text id={errorId} role="alert" size="sm" c="var(--vault-error)">{item.error}</Text>}
      {item.onRetry && <Button variant="subtle" disabled={!!item.disabled} onClick={() => onRetry(item.id)}>{item.retryLabel}</Button>}
    </Stack>
  </Box>;
}
export function SettingsItems({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  return <Stack className="lm-settings-items" style={theme.contentStyle} gap={0}>
    {props.items.map(item => <SettingRow key={item.id} item={item} onChange={props.onChange} onRetry={props.onRetry} onReset={props.onReset} />)}
  </Stack>;
}
