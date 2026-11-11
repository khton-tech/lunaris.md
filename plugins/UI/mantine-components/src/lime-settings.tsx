import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Group, Modal, Stack, Switch, Tabs, Text, Title } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from './icons.js';
import { SettingsSelect } from './settings-select.js';

interface Metadata { readonly id: string; readonly name: string; readonly version: string; readonly description: string; readonly fields: readonly { readonly label: string; readonly value: string }[] }
interface Row extends Metadata { readonly enabled: boolean; readonly recovery: boolean; readonly state: string; readonly removing: boolean }
interface Dependency { readonly kind: 'api' | 'event' | 'hook'; readonly id: string; readonly range: string; readonly optional: boolean; readonly selected?: string; readonly candidates: readonly { readonly id: string; readonly version: string; readonly state: string }[] }
interface DependencyPlan { readonly pluginId: string; readonly revision: number; readonly affected: readonly string[]; readonly dependencies: readonly Dependency[] }
interface Props {
  readonly labels: Readonly<Record<string, string>>;
  readonly rows: readonly Row[];
  readonly preview: (Metadata & { readonly requirements: Metadata['fields']; readonly warning: boolean; readonly action: string }) | null;
  readonly busy: boolean; readonly available: boolean; readonly safeMode: boolean; readonly error: string;
  readonly onAdd: () => void; readonly onConfirm: () => void; readonly onCancel: () => void;
  readonly onToggle: (id: string, enabled: boolean) => void; readonly onRetry: (id: string) => void;
  readonly onUpdate: (id: string) => void; readonly onRemove: (id: string, deleteData: boolean) => void;
  readonly onSafeMode: (safeMode: boolean) => void;
  readonly dependencyPlan: DependencyPlan | null;
  readonly onPlan: (id: string) => void;
  readonly onSelectProvider: (id: string, kind: Dependency['kind'], contractId: string, providerId: string, revision: number) => void;
}
const labels = ['add', 'empty', 'noVault', 'enabled', 'details', 'remove', 'cancel', 'keepData', 'deleteData', 'removePrompt', 'warning', 'retry', 'update', 'safeMode', 'resume', 'provider', 'applyProvider', 'refreshDependencies', 'affected', 'missingDependency', 'noDependencies', 'selectProvider', 'enableProvider', 'optional', 'overview', 'requires', 'previewTabs'];
const validFields = (fields: unknown): fields is Metadata['fields'] =>
  Array.isArray(fields) && fields.every(field => typeof field?.label === 'string' && typeof field.value === 'string');
export function limeSettingsProps(value: ComponentProps): Props {
  const metadata = (input: unknown): input is Metadata => {
    const item = input as Partial<Metadata> | null;
    return !!item && ['id', 'name', 'version', 'description'].every(key => typeof (item as Record<string, unknown>)[key] === 'string') && validFields(item.fields);
  };
  if (!value.labels || typeof value.labels !== 'object' || !labels.every(key => typeof (value.labels as Record<string, unknown>)[key] === 'string') ||
    !Array.isArray(value.rows) || !value.rows.every(row => metadata(row) && ['enabled', 'recovery', 'removing'].every(key => typeof (row as unknown as Record<string, unknown>)[key] === 'boolean') && typeof (row as Row).state === 'string') || new Set(value.rows.map(row => row.id)).size !== value.rows.length ||
    (value.preview !== null && (!metadata(value.preview) || !validFields((value.preview as Props['preview'])?.requirements) || typeof (value.preview as Props['preview'])?.warning !== 'boolean' || typeof (value.preview as Props['preview'])?.action !== 'string')) ||
    !['busy', 'available', 'safeMode'].every(key => typeof value[key] === 'boolean') || typeof value.error !== 'string' ||
    !['onAdd', 'onConfirm', 'onCancel', 'onToggle', 'onRetry', 'onUpdate', 'onRemove', 'onSafeMode', 'onPlan', 'onSelectProvider'].every(key => typeof value[key] === 'function')) throw new TypeError('Invalid Lime Settings props.');
  const plan = value.dependencyPlan as DependencyPlan | null;
  if (plan !== null && (!plan || typeof plan.pluginId !== 'string' || !Number.isSafeInteger(plan.revision) || !Array.isArray(plan.affected) || !plan.affected.every(id => typeof id === 'string') || !Array.isArray(plan.dependencies) || !plan.dependencies.every(item => item && ['api','event','hook'].includes(item.kind) && typeof item.id === 'string' && typeof item.range === 'string' && typeof item.optional === 'boolean' && (item.selected === undefined || typeof item.selected === 'string') && Array.isArray(item.candidates) && item.candidates.every((candidate: Dependency['candidates'][number]) => candidate && ['id','version','state'].every(key => typeof (candidate as unknown as Record<string, unknown>)[key] === 'string'))))) throw new TypeError('Invalid Lime dependency plan.');
  return value as unknown as Props;
}
function Details({ item }: { item: Pick<Metadata, 'description' | 'fields'> }) {
  return <Stack gap={6} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    {item.description && <Text size="sm">{item.description}</Text>}
    {item.fields.map((field, index) => <Text key={index} size="sm"><Text span c="dimmed">{field.label}: </Text>{field.value}</Text>)}
  </Stack>;
}
function PackagePreview({ preview, props }: { preview: NonNullable<Props['preview']>; props: Props }) {
  return <Modal opened onClose={props.onCancel} title={preview.name} centered withinPortal={false} returnFocus={false}
    closeOnEscape={!props.busy} closeOnClickOutside={false} withCloseButton={false}
    transitionProps={{ duration: 0 }} size="lg" xOffset="1rem" yOffset="1rem"
    classNames={{ content: 'lm-lime-dialog', header: 'lm-lime-dialog-header', body: 'lm-lime-dialog-body' }}>
    <Tabs className="lm-lime-tabs" color="var(--vault-accent)" defaultValue="overview" keepMounted={false}>
      <Tabs.List aria-label={props.labels.previewTabs}>
        <Tabs.Tab value="overview" data-autofocus>{props.labels.overview}</Tabs.Tab>
        <Tabs.Tab value="dependencies">{props.labels.requires}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview" className="lm-lime-panel" tabIndex={0}>
        <Text size="sm" c="dimmed" mb="xs">{preview.version}</Text>
        <Details item={preview} />
      </Tabs.Panel>
      <Tabs.Panel value="dependencies" className="lm-lime-panel" tabIndex={0}>
        {preview.requirements.length ? <Details item={{ description: '', fields: preview.requirements }} /> :
          <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
      </Tabs.Panel>
    </Tabs>
    <Stack className="lm-lime-dialog-footer" gap="xs">
      {preview.warning && <Text role="alert" size="sm" c="var(--vault-error)">{props.labels.warning}</Text>}
      <Group gap="xs" wrap="wrap" justify="flex-end">
        <Button size="compact-sm" variant="subtle" disabled={props.busy} onClick={props.onCancel}>{props.labels.cancel}</Button>
        <Button size="compact-sm" disabled={props.busy || !props.available} onClick={props.onConfirm}>{preview.action}</Button>
      </Group>
    </Stack>
  </Modal>;
}
function ProviderSelection({ dependency, plan, props, enabled }: { dependency: Dependency; plan: DependencyPlan; props: Props; enabled: boolean }) {
  const [selected, setSelected] = useState(dependency.selected ?? '');
  useEffect(() => { setSelected(dependency.selected ?? ''); }, [plan.revision, dependency.selected]);
  const candidate = dependency.candidates.find(item => item.id === selected);
  const options = dependency.candidates.map(item => ({
    value: item.id, label: `${item.id} ${item.version} · ${props.labels[item.state] ?? item.state}`,
  }));
  const [onlyOption] = options;
  const needsEnable = enabled && candidate?.state === 'disabled';
  return <Box component="li" className="lm-lime-dependency">
    <Text size="sm" fw={600}>
      {dependency.kind}:{dependency.id}{' '}
      <Text span fw={400} c="dimmed">{dependency.range}{dependency.optional ? ` (${props.labels.optional})` : ''}</Text>
    </Text>
    {!onlyOption ? <Text size="sm" c="dimmed">{props.labels.missingDependency}</Text> :
      options.length === 1 && onlyOption.value === dependency.selected ? <Text size="sm">{onlyOption.label}</Text> :
        <Group className="lm-lime-provider-actions" gap="xs">
          <Box className="lm-lime-provider-select">
            <SettingsSelect aria-label={`${props.labels.provider} ${dependency.id}`} value={selected || props.labels.selectProvider!} options={options} disabled={props.busy || props.safeMode} onChange={setSelected} />
          </Box>
          <Button size="compact-sm" variant="subtle" disabled={props.busy || props.safeMode || !candidate || needsEnable || selected === dependency.selected}
            onClick={() => props.onSelectProvider(plan.pluginId, dependency.kind, dependency.id, selected, plan.revision)}>{props.labels.applyProvider}</Button>
        </Group>}
    {needsEnable && <Text size="sm" c="dimmed">{props.labels.enableProvider}</Text>}
  </Box>;
}
function PackageDetails({ id, row, props, disabled }: { id: string; row: Row; props: Props; disabled: boolean }) {
  const plan = props.dependencyPlan?.pluginId === row.id ? props.dependencyPlan : null;
  return <Stack id={id} className="lm-lime-package-details" gap="md">
    <Stack gap="xs">
      {row.description && <Text size="sm">{row.description}</Text>}
      <Box component="dl" className="lm-lime-metadata">
        {row.fields.map((field, index) => <Box key={index} className="lm-lime-metadata-row">
          <Text component="dt" size="sm" c="dimmed">{field.label}</Text>
          <Text component="dd" size="sm">{field.value}</Text>
        </Box>)}
      </Box>
    </Stack>
    <Stack component="section" aria-labelledby={`${id}-dependencies`} className="lm-lime-dependencies" gap="xs">
      <Group justify="space-between" gap="xs">
        <Title id={`${id}-dependencies`} order={3} size="sm">{props.labels.requires}</Title>
        <Button size="compact-sm" variant="subtle" leftSection={<Icon name="refresh" />} disabled={disabled}
          onClick={() => props.onPlan(row.id)}>{props.labels.refreshDependencies}</Button>
      </Group>
      {plan && <>
        {plan.affected.some(pluginId => pluginId !== row.id) &&
          <Text size="sm" c="dimmed">{props.labels.affected}: {plan.affected.join(', ')}</Text>}
        {plan.dependencies.length ? <Box component="ul" className="lm-lime-dependency-list">
          {plan.dependencies.map(dependency => <ProviderSelection key={`${dependency.kind}:${dependency.id}`}
            dependency={dependency} plan={plan} props={props} enabled={row.enabled} />)}
        </Box> : <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
      </>}
    </Stack>
  </Stack>;
}
export function LimeSettings({ props, theme, overlay }: {
  props: Props;
  theme: ReturnType<typeof resolveTheme>;
  overlay: { id: string; target: HTMLElement };
}) {
  const [expanded, setExpanded] = useState<string | null>(null); const [removing, setRemoving] = useState<string | null>(null);
  const detailsId = useId();
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const hadPreview = useRef(false);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!props.preview && hadPreview.current) previewTrigger.current?.focus();
    hadPreview.current = !!props.preview;
  }, [props.preview]);
  useEffect(() => { if (removing && !props.rows.some(row => row.id === removing)) setRemoving(null); }, [props.rows, removing]);
  const disabled = props.busy || !props.available;
  return <Stack className="lm-lime-settings" gap="md" style={{ ...theme.contentStyle, minWidth: 0, width: '100%' }}>
    <Group className="lm-lime-toolbar" gap="sm" wrap="wrap" justify="space-between">
      {!props.available ? <Text size="sm" c="dimmed">{props.labels.noVault}</Text> : <>
        {!props.rows.length && !props.preview && <Text size="sm" c="dimmed">{props.labels.empty}</Text>}
        <Group gap="xs" wrap="wrap">
          <Button size="sm" variant="filled" leftSection={<Icon name="create" />} disabled={disabled || !!props.preview} onClick={event => { previewTrigger.current = event.currentTarget; props.onAdd(); }}>{props.labels.add}</Button>
          {(props.safeMode || props.rows.length > 0) && <Button size="compact-sm" variant="subtle" disabled={disabled || !!props.preview} onClick={() => props.onSafeMode(!props.safeMode)}>{props.safeMode ? props.labels.resume : props.labels.safeMode}</Button>}
        </Group>
      </>}
    </Group>
    {props.error && <Text size="sm" c="var(--vault-error)" role="alert" style={{ overflowWrap: 'anywhere' }}>{props.error}</Text>}
    {props.preview && createPortal(
      <div id={overlay.id} className="lm-root lm-lime-overlay" data-mantine-color-scheme={theme.scheme} style={theme.contentStyle}>
        <PackagePreview key={props.preview.id} preview={props.preview} props={props} />
      </div>,
      overlay.target,
    )}
    {props.rows.map(row => <Box key={row.id} className="lm-lime-package" data-lime-id={row.id}>
      <Box className="lm-lime-package-header">
        <Stack className="lm-lime-package-name" gap={4}>
          <Text size="sm" fw={600}>{row.name} <Text span fw={400} c="dimmed">{row.version}</Text></Text>
          <Text size="sm" c="dimmed">{row.state}</Text>
        </Stack>
        <Group gap="xs" wrap="wrap">
          <Switch aria-label={`${props.labels.enabled} ${row.name}`} checked={row.enabled} disabled={disabled || row.removing || props.safeMode} onChange={event => props.onToggle(row.id, event.currentTarget.checked)} />
          <Button size="compact-xs" variant="subtle" aria-expanded={expanded === row.id}
            aria-controls={expanded === row.id ? `${detailsId}-${row.id}` : undefined}
            onClick={() => { if (expanded !== row.id) props.onPlan(row.id); setExpanded(expanded === row.id ? null : row.id); }}>{props.labels.details}</Button>
          {row.recovery && !row.removing && <Button size="compact-xs" variant="subtle" disabled={disabled || props.safeMode} onClick={() => props.onRetry(row.id)}>{props.labels.retry}</Button>}
          <Button size="compact-xs" variant="subtle" disabled={disabled || row.removing || !!props.preview} onClick={event => { previewTrigger.current = event.currentTarget; props.onUpdate(row.id); }}>{props.labels.update}</Button>
          <Button ref={element => { if (element) removeButtons.current.set(row.id, element); else removeButtons.current.delete(row.id); }} size="compact-xs" variant="subtle" disabled={disabled} onClick={() => {
            if (row.removing) props.onRemove(row.id, false);
            else {
              if (removing !== row.id) props.onPlan(row.id);
              setRemoving(removing === row.id ? null : row.id);
            }
          }}>{row.removing ? props.labels.retry : props.labels.remove}</Button>
        </Group>
      </Box>
      {expanded === row.id && <PackageDetails id={`${detailsId}-${row.id}`} row={row} props={props} disabled={disabled} />}
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
