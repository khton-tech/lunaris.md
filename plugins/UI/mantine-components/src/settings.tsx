import { useLayoutEffect, useRef } from "react";
import { Box, Button, Stack, Text, Title } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface Item { readonly id: string; readonly title: string }
interface NavigationProps {
  readonly title: string; readonly emptyLabel: string; readonly categories: readonly Item[];
  readonly selectedId: string | null; readonly onSelect: (id: string) => void;
}
interface PageProps {
  readonly title: string; readonly emptyLabel: string; readonly sections: readonly Item[];
  readonly onTargets: (targets: ReadonlyMap<string, HTMLElement> | null) => void;
}
const items = (value: unknown): value is readonly Item[] => Array.isArray(value) && value.every(item => item && typeof item.id === "string" && typeof item.title === "string") && new Set(value.map(item => item.id)).size === value.length;
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
  return <Stack component="nav" className="lm-settings-navigation" aria-label={props.title} style={theme.style} gap="xs">
    <Title order={2} size="sm">{props.title}</Title>
    {props.categories.length ? props.categories.map(item => <Button key={item.id} variant="subtle" justify="start"
      className="lm-settings-category lm-focus" aria-current={item.id === props.selectedId ? "page" : undefined}
      onClick={() => props.onSelect(item.id)}>{item.title}</Button>) : <Text size="sm" c="dimmed">{props.emptyLabel}</Text>}
  </Stack>;
}
export function SettingsPage({ props, theme }: { props: PageProps; theme: ReturnType<typeof resolveTheme> }) {
  const targets = useRef(new Map<string, HTMLElement>()); const publish = props.onTargets;
  const signature = JSON.stringify(props.sections.map(section => section.id));
  useLayoutEffect(() => { publish(new Map(targets.current)); }, [signature, publish]);
  useLayoutEffect(() => () => publish(null), [publish]);
  return <Stack className="lm-settings-page" style={theme.style} gap="xl">
    <Title order={1} size="h2">{props.title}</Title>
    {props.sections.length ? props.sections.map(section => <Stack component="section" key={section.id} gap="sm">
      <Title order={2} size="h4">{section.title}</Title>
      <Box className="lm-settings-section" data-settings-section={section.id}
        ref={node => { if (node) targets.current.set(section.id, node); else targets.current.delete(section.id); }} />
    </Stack>) : <Text c="dimmed">{props.emptyLabel}</Text>}
  </Stack>;
}
