import { useEffect, useRef, useState } from "react";
import { Box, Button, Group, Stack, Switch, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { SettingsSelect } from './settings-select.js';

interface Metadata { readonly id: string; readonly name: string; readonly version: string; readonly description: string; readonly fields: readonly { readonly label: string; readonly value: string }[] }
interface Row extends Metadata { readonly enabled: boolean; readonly recovery: boolean; readonly state: string; readonly removing: boolean }
interface Dependency { readonly kind: 'api' | 'event' | 'hook'; readonly id: string; readonly range: string; readonly optional: boolean; readonly selected?: string; readonly candidates: readonly { readonly id: string; readonly version: string; readonly state: string }[] }
interface DependencyPlan { readonly pluginId: string; readonly revision: number; readonly affected: readonly string[]; readonly dependencies: readonly Dependency[] }
interface Props {
  readonly labels: Readonly<Record<string, string>>;
  readonly rows: readonly Row[];
  readonly preview: (Metadata & { readonly warning: boolean; readonly action: string }) | null;
  readonly busy: boolean; readonly available: boolean; readonly safeMode: boolean; readonly error: string;
  readonly onAdd: () => void; readonly onConfirm: () => void; readonly onCancel: () => void;
  readonly onToggle: (id: string, enabled: boolean) => void; readonly onRetry: (id: string) => void;
  readonly onUpdate: (id: string) => void; readonly onRemove: (id: string, deleteData: boolean) => void;
  readonly onSafeMode: (safeMode: boolean) => void;
  readonly dependencyPlan: DependencyPlan | null;
  readonly onPlan: (id: string) => void;
  readonly onSelectProvider: (id: string, kind: Dependency['kind'], contractId: string, providerId: string, revision: number) => void;
}
const labels = ['add', 'empty', 'noVault', 'enabled', 'details', 'remove', 'cancel', 'keepData', 'deleteData', 'removePrompt', 'warning', 'retry', 'update', 'safeMode', 'resume', 'provider', 'applyProvider', 'refreshDependencies', 'affected', 'missingDependency', 'noDependencies', 'selectProvider', 'enableProvider', 'optional'];
export function limeSettingsProps(value: ComponentProps): Props {
  const metadata = (input: unknown): input is Metadata => {
    const item = input as Partial<Metadata> | null;
    return !!item && ['id', 'name', 'version', 'description'].every(key => typeof (item as Record<string, unknown>)[key] === 'string') && Array.isArray(item.fields) && item.fields.every(field => typeof field?.label === 'string' && typeof field.value === 'string');
  };
  if (!value.labels || typeof value.labels !== 'object' || !labels.every(key => typeof (value.labels as Record<string, unknown>)[key] === 'string') ||
    !Array.isArray(value.rows) || !value.rows.every(row => metadata(row) && ['enabled', 'recovery', 'removing'].every(key => typeof (row as unknown as Record<string, unknown>)[key] === 'boolean') && typeof (row as Row).state === 'string') || new Set(value.rows.map(row => row.id)).size !== value.rows.length ||
    (value.preview !== null && (!metadata(value.preview) || typeof (value.preview as Props['preview'])?.warning !== 'boolean' || typeof (value.preview as Props['preview'])?.action !== 'string')) ||
    !['busy', 'available', 'safeMode'].every(key => typeof value[key] === 'boolean') || typeof value.error !== 'string' ||
    !['onAdd', 'onConfirm', 'onCancel', 'onToggle', 'onRetry', 'onUpdate', 'onRemove', 'onSafeMode', 'onPlan', 'onSelectProvider'].every(key => typeof value[key] === 'function')) throw new TypeError('Invalid Lime Settings props.');
  const plan = value.dependencyPlan as DependencyPlan | null;
  if (plan !== null && (!plan || typeof plan.pluginId !== 'string' || !Number.isSafeInteger(plan.revision) || !Array.isArray(plan.affected) || !plan.affected.every(id => typeof id === 'string') || !Array.isArray(plan.dependencies) || !plan.dependencies.every(item => item && ['api','event','hook'].includes(item.kind) && typeof item.id === 'string' && typeof item.range === 'string' && typeof item.optional === 'boolean' && (item.selected === undefined || typeof item.selected === 'string') && Array.isArray(item.candidates) && item.candidates.every((candidate: Dependency['candidates'][number]) => candidate && ['id','version','state'].every(key => typeof (candidate as unknown as Record<string, unknown>)[key] === 'string'))))) throw new TypeError('Invalid Lime dependency plan.');
  return value as unknown as Props;
}
function Details({ item }: { item: Metadata }) {
  return <Stack gap={6} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <Text size="sm">{item.description}</Text>
    {item.fields.map((field, index) => <Text key={index} size="sm"><Text span c="dimmed">{field.label}: </Text>{field.value}</Text>)}
  </Stack>;
}
function ProviderSelection({ dependency, plan, props, enabled }: { dependency: Dependency; plan: DependencyPlan; props: Props; enabled: boolean }) {
  const [selected, setSelected] = useState(dependency.selected ?? '');
  useEffect(() => { setSelected(dependency.selected ?? ''); }, [plan.revision, dependency.selected]);
  const candidate = dependency.candidates.find(item => item.id === selected);
  return <Stack gap="xs" style={{ minWidth: 0 }}>
    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{dependency.kind}:{dependency.id} {dependency.range}{dependency.optional ? ` (${props.labels.optional})` : ''}</Text>
    {!dependency.candidates.length ? <Text size="sm" c="dimmed">{props.labels.missingDependency}</Text> : <>
      <SettingsSelect aria-label={`${props.labels.provider} ${dependency.id}`} value={selected || props.labels.selectProvider!} options={dependency.candidates.map(item => ({ value: item.id, label: `${item.id} ${item.version} · ${props.labels[item.state] ?? item.state}` }))} disabled={props.busy || props.safeMode} onChange={setSelected} />
      {enabled && candidate?.state === 'disabled' && <Text size="sm" c="dimmed">{props.labels.enableProvider}</Text>}
      <Group><Button size="compact-xs" variant="subtle" disabled={props.busy || props.safeMode || !candidate || (enabled && candidate.state === 'disabled') || selected === dependency.selected} onClick={() => props.onSelectProvider(plan.pluginId, dependency.kind, dependency.id, selected, plan.revision)}>{props.labels.applyProvider}</Button></Group>
    </>}
  </Stack>;
}
export function LimeSettings({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  const [expanded, setExpanded] = useState<string | null>(null); const [removing, setRemoving] = useState<string | null>(null);
  const add = useRef<HTMLButtonElement>(null); const confirm = useRef<HTMLButtonElement>(null); const hadPreview = useRef(false);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (props.preview) confirm.current?.focus(); else if (hadPreview.current) add.current?.focus(); hadPreview.current = !!props.preview; }, [props.preview?.id]);
  useEffect(() => { if (removing && !props.rows.some(row => row.id === removing)) setRemoving(null); }, [props.rows, removing]);
  const disabled = props.busy || !props.available;
  return <Stack className="lm-lime-settings" gap="md" style={{ ...theme.contentStyle, minWidth: 0, width: '100%' }}>
    <Group className="lm-lime-toolbar" gap="sm" wrap="wrap" justify="space-between">
      {!props.available ? <Text size="sm" c="dimmed">{props.labels.noVault}</Text> : <>
        {!props.rows.length && !props.preview && <Text size="sm" c="dimmed">{props.labels.empty}</Text>}
        <Group gap="xs" wrap="wrap">
          <Button ref={add} size="compact-sm" disabled={disabled || !!props.preview} onClick={props.onAdd}>{props.labels.add}</Button>
          {(props.safeMode || props.rows.length > 0) && <Button size="compact-sm" variant="subtle" disabled={disabled || !!props.preview} onClick={() => props.onSafeMode(!props.safeMode)}>{props.safeMode ? props.labels.resume : props.labels.safeMode}</Button>}
        </Group>
      </>}
    </Group>
    {props.error && <Text size="sm" c="var(--vault-error)" role="alert" style={{ overflowWrap: 'anywhere' }}>{props.error}</Text>}
    {props.preview && <Stack gap="sm" role="group" aria-label={props.preview.name} style={{ minWidth: 0 }}>
      <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{props.preview.name} {props.preview.version}</Text>
      <Details item={props.preview} />
      {props.preview.warning && <Text role="alert" size="sm" c="var(--vault-error)">{props.labels.warning}</Text>}
      <Group gap="xs" wrap="wrap">
        <Button ref={confirm} size="compact-sm" disabled={disabled} onClick={props.onConfirm}>{props.preview.action}</Button>
        <Button size="compact-sm" variant="subtle" disabled={props.busy} onClick={props.onCancel}>{props.labels.cancel}</Button>
      </Group>
    </Stack>}
    {props.rows.map(row => <Box key={row.id} data-lime-id={row.id} style={{ minWidth: 0 }}>
      <Box className="lm-setting-row" data-layout="inline">
        <Stack className="lm-setting-label" gap={4} style={{ overflowWrap: 'anywhere' }}>
          <Text size="sm">{row.name} <Text span c="dimmed">{row.version}</Text></Text>
          <Text size="sm" c="dimmed">{row.state}</Text>
        </Stack>
        <Group gap="xs" wrap="wrap">
          <Switch aria-label={`${props.labels.enabled} ${row.name}`} checked={row.enabled} disabled={disabled || row.removing || props.safeMode} onChange={event => props.onToggle(row.id, event.currentTarget.checked)} />
          <Button size="compact-xs" variant="subtle" aria-expanded={expanded === row.id} onClick={() => { if (expanded !== row.id) props.onPlan(row.id); setExpanded(expanded === row.id ? null : row.id); }}>{props.labels.details}</Button>
          {row.recovery && !row.removing && <Button size="compact-xs" variant="subtle" disabled={disabled || props.safeMode} onClick={() => props.onRetry(row.id)}>{props.labels.retry}</Button>}
          <Button size="compact-xs" variant="subtle" disabled={disabled || row.removing || !!props.preview} onClick={() => props.onUpdate(row.id)}>{props.labels.update}</Button>
          <Button ref={element => { if (element) removeButtons.current.set(row.id, element); else removeButtons.current.delete(row.id); }} size="compact-xs" variant="subtle" disabled={disabled} onClick={() => {
            if (row.removing) props.onRemove(row.id, false);
            else {
              if (removing !== row.id) props.onPlan(row.id);
              setRemoving(removing === row.id ? null : row.id);
            }
          }}>{row.removing ? props.labels.retry : props.labels.remove}</Button>
        </Group>
      </Box>
      {expanded === row.id && <Stack gap="sm" style={{ minWidth: 0 }}><Details item={row} />
        {props.dependencyPlan?.pluginId === row.id && <Stack gap="sm">
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{props.labels.affected}: {props.dependencyPlan.affected.join(', ')}</Text>
          {!props.dependencyPlan.dependencies.length && <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
          {props.dependencyPlan.dependencies.map(dependency => <ProviderSelection key={`${dependency.kind}:${dependency.id}`} dependency={dependency} plan={props.dependencyPlan!} props={props} enabled={row.enabled} />)}
          <Group><Button size="compact-xs" variant="subtle" disabled={disabled} onClick={() => props.onPlan(row.id)}>{props.labels.refreshDependencies}</Button></Group>
        </Stack>}
      </Stack>}
      {removing === row.id && <Stack gap="xs" role="group" aria-label={`${props.labels.remove} ${row.name}`}>
        <Text size="sm">{props.labels.removePrompt}</Text>
        {props.dependencyPlan?.pluginId === row.id && props.dependencyPlan.affected.length > 1 &&
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{props.labels.affected}: {props.dependencyPlan.affected.join(', ')}</Text>}
        <Group gap="xs" wrap="wrap">
          <Button size="compact-sm" variant="subtle" disabled={disabled} onClick={() => props.onRemove(row.id, false)}>{props.labels.keepData}</Button>
          <Button size="compact-sm" variant="subtle" disabled={disabled} onClick={() => props.onRemove(row.id, true)}>{props.labels.deleteData}</Button>
          <Button size="compact-sm" variant="subtle" disabled={props.busy} onClick={() => { setRemoving(null); removeButtons.current.get(row.id)?.focus(); }}>{props.labels.cancel}</Button>
        </Group>
      </Stack>}
    </Box>)}
  </Stack>;
}
