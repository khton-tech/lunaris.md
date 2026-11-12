import { useEffect, useState } from "react";
import { ActionIcon, Box, Button, Group, Text, TextInput, UnstyledButton } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
import { ToolPanelHeader } from "./tool-navigation.js";
import { SettingsSelect } from "./settings-select.js";

interface Result { readonly id: string; readonly before: string; readonly match: string; readonly after: string; readonly line: number; readonly onOpen: () => void; readonly onLink?: () => void }
interface Source { readonly id: string; readonly title: string; readonly count: number; readonly mentions: readonly Result[] }
interface Props {
  readonly title: string; readonly note: string; readonly inline: boolean; readonly labels: Readonly<Record<string, string>>;
  readonly status: string; readonly error: string; readonly busy: boolean; readonly linked: readonly Source[]; readonly unlinked: readonly Source[];
  readonly query: string; readonly sort: string; readonly more: boolean; readonly collapse: boolean; readonly filterVisible: boolean; readonly inDocument: boolean; readonly preferencesDisabled: boolean;
  readonly onQuery: (value: string) => void; readonly onSort: (value: string) => void;
  readonly onContext: () => void; readonly onCollapse: () => void; readonly onFilter: () => void; readonly onRefresh: () => void; readonly onPin: () => void; readonly onInline: () => void;
}
export function backlinksProps(value: ComponentProps): Props {
  for (const key of ["title", "note", "status", "error", "query", "sort"]) if (typeof value[key] !== "string") throw new TypeError(`Backlinks requires ${key}.`);
  for (const key of ["inline", "busy", "more", "collapse", "filterVisible", "inDocument", "preferencesDisabled"]) if (typeof value[key] !== "boolean") throw new TypeError(`Backlinks requires ${key}.`);
  for (const key of ["onQuery", "onSort", "onContext", "onCollapse", "onFilter", "onRefresh", "onPin", "onInline"]) if (typeof value[key] !== "function") throw new TypeError(`Backlinks requires ${key}.`);
  if (!value.labels || typeof value.labels !== "object" || !Array.isArray(value.linked) || !Array.isArray(value.unlinked)) throw new TypeError("Invalid backlink groups.");
  for (const group of [...value.linked, ...value.unlinked] as Source[]) {
    if (!group || typeof group.id !== "string" || typeof group.title !== "string" || !Array.isArray(group.mentions)) throw new TypeError("Invalid backlink source.");
    for (const result of group.mentions) if (typeof result.id !== "string" || typeof result.before !== "string" || typeof result.match !== "string" || typeof result.after !== "string" || typeof result.onOpen !== "function" || (result.onLink !== undefined && typeof result.onLink !== "function")) throw new TypeError("Invalid backlink mention.");
  }
  return value as unknown as Props;
}
function SourceGroup({ source, collapsed, busy, linkLabel }: { source: Source; collapsed: boolean; busy: boolean; linkLabel: string }) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => setOpen(!collapsed), [collapsed]);
  return <Box className="lm-backlink-source">
    <UnstyledButton className="lm-backlink-heading lm-focus" aria-expanded={open} onClick={() => setOpen(!open)} title={source.id}>
      <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : undefined }}><Icon name="expand" /></span>
      <Icon name="file" /><Text component="span" inherit style={{ flex: 1, overflowWrap: "anywhere" }}>{source.title}</Text><Text component="span" size="xs" c="dimmed">{source.count}</Text>
    </UnstyledButton>
    {open && source.mentions.map(result => <Box key={result.id} className="lm-backlink-result">
      <UnstyledButton className="lm-backlink-context lm-focus" disabled={busy} onClick={result.onOpen} title={`${source.id}:${result.line}`}>
        {result.before}<mark>{result.match}</mark>{result.after}
      </UnstyledButton>
      {result.onLink && <Button size="compact-xs" variant="subtle" disabled={busy} onClick={result.onLink}>{linkLabel}</Button>}
    </Box>)}
  </Box>;
}
function Section({ title, groups, props, initialOpen }: { title: string; groups: readonly Source[]; props: Props; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen); const count = groups.reduce((sum, group) => sum + group.count, 0);
  return <Box component="section">
    <UnstyledButton className="lm-backlink-heading lm-focus" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : undefined }}><Icon name="expand" /></span>
      <Text component="span" size="sm" fw={500} style={{ flex: 1 }}>{title}</Text><Text component="span" size="xs" c="dimmed">{count}</Text>
    </UnstyledButton>
    {open && <Box>{groups.length ? groups.map(source => <SourceGroup key={source.id} source={source} collapsed={props.collapse} busy={props.busy} linkLabel={props.labels.link!} />) : <Text size="xs" c="dimmed" px="xs" py={4}>{props.labels.empty}</Text>}</Box>}
  </Box>;
}
/** Embedded contents inherit their panel/document surface; no outer card is painted here. */
export function BacklinksView({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  const label = (key: string) => props.labels[key] ?? key;
  const action = (key: string, icon: string, callback: () => void, pressed?: boolean, disabled = false) => <ActionIcon key={key} size="sm" variant="subtle" className="lm-focus" title={label(key)} aria-label={label(key)} aria-pressed={pressed} disabled={disabled} onClick={callback}><Icon name={icon} /></ActionIcon>;
  return <Box className="lm-backlinks" data-inline={props.inline} style={theme.contentStyle}>
    <ToolPanelHeader title={props.title} />
    {!props.inline && props.note && <Text size="xs" c="dimmed" px="xs" title={props.note} style={{ overflowWrap: "anywhere" }}>{props.note}</Text>}
    <Group gap={4} px="xs" py={4} wrap="wrap">
      {action("collapse", "expand-all", props.onCollapse, props.collapse)}
      {action("context", "editor", props.onContext, props.more)}
      {action("filterToggle", "search", props.onFilter, props.filterVisible)}
      {action("refresh", "refresh", props.onRefresh, undefined, props.busy)}
      {action("pin", "backlinks", props.onPin, undefined, !props.note)}
      {action("inDocument", "outline", props.onInline, props.inDocument, props.preferencesDisabled)}
    </Group>
    <Box px="xs" pb={4}><SettingsSelect aria-label={label("sort")} value={props.sort} disabled={false} onChange={props.onSort} options={[
      { value: "name", label: label("name") }, { value: "name-desc", label: label("nameDesc") }, { value: "modified-desc", label: label("newest") }, { value: "modified-asc", label: label("oldest") },
    ]} /></Box>
    {props.filterVisible && <Box px="xs" pb={4}><TextInput size="xs" aria-label={label("filter")} placeholder={label("filter")} title={label("hint")} value={props.query} onChange={event => props.onQuery(event.currentTarget.value)} /></Box>}
    {props.status && <Text size="xs" c="dimmed" px="xs" role="status">{props.status}</Text>}
    {props.error && <Text size="xs" c="red" px="xs" role="alert">{props.error}</Text>}
    <Box className="lm-backlink-results" key={props.note}>
      <Section title={label("linked")} groups={props.linked} props={props} initialOpen />
      <Section title={label("unlinked")} groups={props.unlinked} props={props} initialOpen={false} />
    </Box>
  </Box>;
}
