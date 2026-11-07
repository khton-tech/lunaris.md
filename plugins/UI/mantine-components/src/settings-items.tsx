import { useId } from "react";
import { Box, Button, NativeSelect, NumberInput, Stack, Switch, Text, TextInput } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { SettingsItem } from "@lunaris/settings";
import type { resolveTheme } from "./theme.js";

interface Props { readonly items: readonly SettingsItem[]; readonly onChange: (id: string, value: unknown) => void; readonly onRetry: (id: string) => void }
export function settingsItemsProps(value: ComponentProps): Props {
  if (!Array.isArray(value.items) || new Set(value.items.map(item => item?.id)).size !== value.items.length || typeof value.onChange !== "function" || typeof value.onRetry !== "function" ||
      !value.items.every(item => item && typeof item.id === "string" && typeof item.title === "string" &&
        (item.description === undefined || typeof item.description === "string") && (item.error === undefined || typeof item.error === "string") &&
        (item.disabled === undefined || typeof item.disabled === "boolean") && (item.layout === undefined || item.layout === "inline" || item.layout === "stacked") &&
        (item.type === "select" ? typeof item.value === "string" && Array.isArray(item.options) && item.options.every((option: { value?: unknown; label?: unknown } | null) => option && typeof option.value === "string" && typeof option.label === "string") && new Set(item.options.map((option: { value: string }) => option.value)).size === item.options.length :
          item.type === "switch" ? typeof item.value === "boolean" : item.type === "text" ? typeof item.value === "string" && (item.placeholder === undefined || typeof item.placeholder === "string") :
            item.type === "number" && typeof item.value === "number" && Number.isFinite(item.value) && [item.min, item.max, item.step].every(value => value === undefined || typeof value === "number" && Number.isFinite(value))) &&
        (item.retryLabel === undefined || typeof item.retryLabel === "string"))) throw new TypeError("Invalid declarative settings items.");
  return value as unknown as Props;
}
function SettingRow({ item, onChange, onRetry }: { item: SettingsItem; onChange: Props["onChange"]; onRetry: Props["onRetry"] }) {
  const id = useId(); const descriptionId = `${id}-description`; const errorId = `${id}-error`;
  const describedBy = [item.description ? descriptionId : "", item.error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const staticValue = item.type === "select" && item.options.length === 1 && item.options[0]!.value === item.value;
  const shared = { id, "aria-label": item.title, "aria-describedby": describedBy, "aria-invalid": !!item.error, disabled: !!item.disabled };
  let control;
  switch (item.type) {
    case "select": control = staticValue ? <Text size="sm" aria-describedby={describedBy}>{item.options[0]!.label}</Text> :
      <NativeSelect {...shared} value={item.value} data={item.options.map(option => ({ ...option }))} disabled={!!item.disabled || !item.options.length} onChange={event => onChange(item.id, event.currentTarget.value)} />; break;
    case "switch": control = <Switch {...shared} checked={item.value} onChange={event => onChange(item.id, event.currentTarget.checked)} />; break;
    case "text": control = <TextInput {...shared} value={item.value} placeholder={item.placeholder} onChange={event => onChange(item.id, event.currentTarget.value)} />; break;
    case "number": control = <NumberInput {...shared} value={item.value} {...(item.min === undefined ? {} : { min: item.min })} {...(item.max === undefined ? {} : { max: item.max })} {...(item.step === undefined ? {} : { step: item.step })} onChange={value => { if (typeof value === "number" && Number.isFinite(value)) onChange(item.id, value); }} />; break;
  }
  return <Box className="lm-setting-row" data-settings-item={item.id} data-layout={item.layout ?? "inline"}>
    <Stack className="lm-setting-label" gap={4}>
      <Text component={staticValue ? "div" : "label"} htmlFor={staticValue ? undefined : id} size="sm" fw={500}>{item.title}</Text>
      {item.description && <Text id={descriptionId} size="sm" c="dimmed">{item.description}</Text>}
    </Stack>
    <Stack className="lm-setting-control" gap="xs">
      {control}
      {item.error && <Text id={errorId} role="alert" size="sm" c="var(--vault-error)">{item.error}</Text>}
      {item.onRetry && <Button variant="subtle" disabled={!!item.disabled} onClick={() => onRetry(item.id)}>{item.retryLabel}</Button>}
    </Stack>
  </Box>;
}
export function SettingsItems({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  return <Stack className="lm-settings-items" style={theme.contentStyle} gap="lg">
    {props.items.map(item => <SettingRow key={item.id} item={item} onChange={props.onChange} onRetry={props.onRetry} />)}
  </Stack>;
}
