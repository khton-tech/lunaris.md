import { useId, useLayoutEffect, useRef } from "react";
import { Box, Button, NativeSelect, Stack, Text, Title } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface Item { readonly id: string; readonly title: string; readonly description?: string }
interface ChoiceField { readonly id: string; readonly label: string; readonly value: string; readonly options: readonly { readonly value: string; readonly label: string }[] }
interface ChoicesProps {
  readonly fields: readonly ChoiceField[]; readonly disabled: boolean; readonly error: string;
  readonly retryLabel: string; readonly canRetry: boolean;
  readonly onChange: (id: string, value: string) => void; readonly onRetry: () => void;
}
export function settingsChoicesProps(value: ComponentProps): ChoicesProps {
  if (!Array.isArray(value.fields) || !value.fields.every(field => field && typeof field.id === "string" && typeof field.label === "string" && typeof field.value === "string" &&
      Array.isArray(field.options) && field.options.every((option: { value?: unknown; label?: unknown } | null) => option && typeof option.value === "string" && typeof option.label === "string") &&
      new Set(field.options.map((option: { value: string }) => option.value)).size === field.options.length) ||
      new Set(value.fields.map(field => field.id)).size !== value.fields.length ||
      typeof value.disabled !== "boolean" || typeof value.error !== "string" || typeof value.retryLabel !== "string" || typeof value.canRetry !== "boolean" ||
      typeof value.onChange !== "function" || typeof value.onRetry !== "function") throw new TypeError("Invalid settings choices props.");
  return value as unknown as ChoicesProps;
}
export function SettingsChoices({ props, theme }: { props: ChoicesProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Stack className="lm-settings-choices" style={theme.contentStyle} gap="md">
    {props.fields.map(field => field.options.length === 1 ? <Stack key={field.id} gap={4}>
      <Text size="sm" fw={500}>{field.label}</Text><Text size="sm">{field.options[0]!.label}</Text>
    </Stack> : <NativeSelect key={field.id} label={field.label} value={field.value}
      data={field.options.map(option => ({ ...option }))} disabled={props.disabled || field.options.length === 0}
      onChange={event => props.onChange(field.id, event.currentTarget.value)} />)}
    {props.error && <Text role="alert" c="var(--vault-error)" size="sm">{props.error}</Text>}
    {props.canRetry && <Button variant="subtle" disabled={props.disabled} onClick={props.onRetry}>{props.retryLabel}</Button>}
  </Stack>;
}
interface NavigationProps {
  readonly title: string; readonly emptyLabel: string; readonly categories: readonly Item[];
  readonly selectedId: string | null; readonly onSelect: (id: string) => void;
}
interface PageProps {
  readonly title: string; readonly emptyLabel: string; readonly sections: readonly Item[];
  readonly onTargets: (targets: ReadonlyMap<string, HTMLElement> | null) => void;
}
const items = (value: unknown): value is readonly Item[] => Array.isArray(value) && value.every(item => item && typeof item.id === "string" && typeof item.title === "string" && (item.description === undefined || typeof item.description === "string")) && new Set(value.map(item => item.id)).size === value.length;
export function settingsNavigationProps(value: ComponentProps): NavigationProps {
  if (typeof value.title !== "string" || typeof value.emptyLabel !== "string" || !items(value.categories) ||
      (value.selectedId !== null && (typeof value.selectedId !== "string" || !value.categories.some(item => item.id === value.selectedId))) || typeof value.onSelect !== "function") throw new TypeError("Invalid settings navigation props.");
  return value as unknown as NavigationProps;
}
export function settingsPageProps(value: ComponentProps): PageProps {
  if (typeof value.title !== "string" || typeof value.emptyLabel !== "string" || !items(value.sections) || typeof value.onTargets !== "function") throw new TypeError("Invalid settings page props.");
  return value as unknown as PageProps;
}
export function SettingsNavigation({ props, theme }: { props: NavigationProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Stack component="nav" className="lm-settings-navigation" aria-label={props.title} style={theme.contentStyle} gap="xs">
    <Title order={2} size="sm">{props.title}</Title>
    {props.categories.length ? props.categories.map(item => <Button key={item.id} variant="subtle" justify="start"
      className="lm-settings-category lm-focus" aria-current={item.id === props.selectedId ? "page" : undefined}
      onClick={() => props.onSelect(item.id)}>{item.title}</Button>) : <Text size="sm" c="dimmed">{props.emptyLabel}</Text>}
  </Stack>;
}
export function SettingsPage({ props, theme }: { props: PageProps; theme: ReturnType<typeof resolveTheme> }) {
  const headingId = useId();
  const targets = useRef(new Map<string, HTMLElement>()); const publish = props.onTargets;
  const signature = JSON.stringify(props.sections.map(section => section.id));
  useLayoutEffect(() => { publish(new Map(targets.current)); }, [signature, publish]);
  useLayoutEffect(() => () => publish(null), [publish]);
  return <Stack className="lm-settings-page" style={theme.contentStyle} gap={0}>
    <Box component="header" className="lm-settings-page-header"><Title order={1} size="h2">{props.title}</Title></Box>
    {props.sections.length ? props.sections.map(section => <Stack component="section" className="lm-settings-group" key={section.id} gap={0} aria-labelledby={`${headingId}-${section.id}`}>
      <Stack component="header" className="lm-settings-group-header" gap="xs">
        <Title id={`${headingId}-${section.id}`} order={2} size="sm" fw={600}>{section.title}</Title>
        {section.description && <Text size="sm" c="dimmed">{section.description}</Text>}
      </Stack>
      <Box className="lm-settings-section" data-settings-section={section.id}
        ref={node => { if (node) targets.current.set(section.id, node); else targets.current.delete(section.id); }} />
    </Stack>) : <Text c="dimmed">{props.emptyLabel}</Text>}
  </Stack>;
}
