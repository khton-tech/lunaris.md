import { ActionButton } from "./action-button.js";
import { ProductDropdown } from "./product-dropdown.js";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ActionIcon, Box, Group, Menu, Text, TextInput, UnstyledButton } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
import { ToolPanelHeader } from "./tool-navigation.js";
import { ViewportMenu } from "./dropdown-overlay.js";

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
  const resultsId = useId();
  const heading = useRef<HTMLButtonElement>(null); const results = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (collapsed && results.current?.contains(results.current.ownerDocument.activeElement)) heading.current?.focus({ preventScroll: true });
    setOpen(!collapsed);
  }, [collapsed]);
  return <Box className="lm-backlink-source">
    <UnstyledButton ref={heading} className="lm-backlink-heading lm-focus" aria-expanded={open} aria-controls={resultsId} onClick={() => setOpen(!open)} title={source.id}>
      <span className="lm-disclosure-icon" data-open={open || undefined}><Icon name="expand" /></span>
      <Icon name="file" /><Text component="span" inherit style={{ flex: 1, overflowWrap: "anywhere" }}>{source.title}</Text><Text component="span" size="xs" c="dimmed">{source.count}</Text>
    </UnstyledButton>
    <Box className="lm-backlink-branches" ref={results} id={resultsId} hidden={!open}>{open && source.mentions.map(result => <Box key={result.id} className="lm-backlink-result">
      <UnstyledButton className="lm-backlink-context lm-focus" disabled={busy} onClick={result.onOpen} title={`${source.id}:${result.line}`}>
        {result.before}<mark>{result.match}</mark>{result.after}
      </UnstyledButton>
      {result.onLink && <ActionButton disabled={busy} onClick={result.onLink}>{linkLabel}</ActionButton>}
    </Box>)}</Box>
  </Box>;
}
function Section({ title, groups, props, initialOpen }: { title: string; groups: readonly Source[]; props: Props; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen); const count = groups.reduce((sum, group) => sum + group.count, 0);
  const resultsId = useId();
  return <Box component="section">
    <UnstyledButton className="lm-backlink-heading lm-focus" aria-expanded={open} aria-controls={resultsId} onClick={() => setOpen(!open)}>
      <span className="lm-disclosure-icon" data-open={open || undefined}><Icon name="expand" /></span>
      <Text component="span" size="sm" fw={500} style={{ flex: 1 }}>{title}</Text><Text component="span" size="xs" c="dimmed">{count}</Text>
    </UnstyledButton>
    <Box className="lm-backlink-branches" id={resultsId} hidden={!open}>{open && (groups.length ? groups.map(source => <SourceGroup key={source.id} source={source} collapsed={props.collapse} busy={props.busy} linkLabel={props.labels.link!} />) : <Text size="xs" c="dimmed" px="xs" py={4}>{props.labels.empty}</Text>)}</Box>
  </Box>;
}
/** Embedded contents inherit their panel/document surface; no outer card is painted here. */
export function BacklinksView({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  const filterToggle = useRef<HTMLButtonElement>(null);
  const label = (key: string) => props.labels[key] ?? key;
  const action = (key: string, icon: string, callback: () => void, pressed?: boolean, disabled = false) => <ActionIcon key={key} ref={key === "filterToggle" ? filterToggle : undefined} size="sm" variant="subtle" className="lm-focus" title={label(key)} aria-label={label(key)} aria-pressed={pressed} disabled={disabled} onClick={callback}><Icon name={icon} /></ActionIcon>;
  return <Box className="lm-backlinks" data-inline={props.inline} style={theme.contentStyle}>
    <ToolPanelHeader title={props.title} />
    <Group className="lm-explorer-actions lm-backlink-toolbar" gap={4} wrap="wrap">
      {props.note && <ViewportMenu position="bottom-start" offset={4} returnFocus>
        <Menu.Target><ActionIcon variant="subtle" className="lm-focus" title={label("sort")} aria-label={label("sort")}><Icon name="sort" /></ActionIcon></Menu.Target>
        <ProductDropdown>
          {([["name", "name"], ["name-desc", "nameDesc"], ["modified-desc", "newest"], ["modified-asc", "oldest"]] as const).map(([value, key]) =>
            <Menu.Item key={value} aria-current={props.sort === value ? "true" : undefined} rightSection={props.sort === value ? <Icon name="check" /> : undefined} onClick={() => props.onSort(value)}>{label(key)}</Menu.Item>)}
        </ProductDropdown>
      </ViewportMenu>}
      {props.note && <>
        {action("collapse", "expand-all", props.onCollapse, props.collapse)}
        {action("context", "editor", props.onContext, props.more)}
        {action("filterToggle", "search", props.onFilter, props.filterVisible)}
      </>}
      {action("refresh", "refresh", props.onRefresh, undefined, props.busy)}
      {props.note && action("pin", "backlinks", props.onPin)}
      {action("inDocument", "outline", props.onInline, props.inDocument, props.preferencesDisabled)}
    </Group>
    {!props.inline && props.note && <Text className="lm-backlink-note" size="xs" c="dimmed" title={props.note} style={{ overflowWrap: "anywhere" }}>{props.note}</Text>}
    {props.note && props.filterVisible && <Box px="xs" pb={4}><TextInput size="sm" aria-label={label("filter")} placeholder={label("filter")} title={label("hint")} value={props.query}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation();
          filterToggle.current?.focus({ preventScroll: true }); props.onFilter();
        }
      }} onChange={event => props.onQuery(event.currentTarget.value)} /></Box>}
    {props.status && <Text size="xs" c="dimmed" px="xs" role="status">{props.status}</Text>}
    {props.error && <Text size="sm" c="var(--vault-error)" px="xs" role="alert">{props.error}</Text>}
    {props.note && (!props.status || props.linked.length > 0 || props.unlinked.length > 0) && <Box className="lm-backlink-results" key={props.note}>
      <Section title={label("linked")} groups={props.linked} props={props} initialOpen />
      <Section title={label("unlinked")} groups={props.unlinked} props={props} initialOpen={false} />
    </Box>}
  </Box>;
}
