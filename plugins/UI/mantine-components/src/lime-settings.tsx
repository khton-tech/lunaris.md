import { ActionButton } from "./action-button.js";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActionIcon, Box, Group, Menu, Modal, Stack, Switch, Tabs, Text, TextInput } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { ViewportMenu } from './dropdown-overlay.js';
import { Icon } from './icons.js';
import { ProductDropdown } from './product-dropdown.js';
import { SettingsSelect } from './settings-select.js';

interface Metadata { readonly id: string; readonly name: string; readonly version: string; readonly description: string; readonly fields: readonly { readonly label: string; readonly value: string }[] }
interface Row extends Metadata { readonly requirements?: Metadata['fields']; readonly enabled: boolean; readonly recovery: boolean; readonly state: string; readonly removing: boolean }
interface Dependency { readonly kind: 'api' | 'event' | 'hook'; readonly id: string; readonly range: string; readonly optional: boolean; readonly selected?: string; readonly candidates: readonly { readonly id: string; readonly version: string; readonly state: string }[] }
interface DependencyPlan { readonly pluginId: string; readonly revision: number; readonly affected: readonly string[]; readonly dependencies: readonly Dependency[] }
interface Props {
  readonly labels: Readonly<Record<string, string>>;
  readonly rows: readonly Row[];
  readonly vaultId?: string | null;
  readonly preview: (Metadata & { readonly requirements: Metadata['fields']; readonly warning: boolean; readonly action: string; readonly installDisabled?: boolean }) | null;
  readonly busy: boolean; readonly available: boolean; readonly safeMode: boolean; readonly error: string;
  readonly onAdd: () => void; readonly onConfirm: (enabled?: boolean) => void; readonly onCancel: () => void;
  readonly onToggle: (id: string, enabled: boolean) => void; readonly onRetry: (id: string) => void;
  readonly onUpdate: (id: string) => void; readonly onRemove: (id: string, deleteData: boolean) => void;
  readonly onSafeMode: (safeMode: boolean) => void;
  readonly dependencyPlan: DependencyPlan | null;
  readonly onPlan: (id: string) => void;
  readonly onSelectProvider: (id: string, kind: Dependency['kind'], contractId: string, providerId: string, revision: number) => void;
}
const labels = ['add', 'empty', 'noVault', 'enabled', 'details', 'remove', 'cancel', 'keepData', 'deleteData', 'removePrompt', 'warning', 'retry', 'update', 'provider', 'applyProvider', 'refreshDependencies', 'affected', 'missingDependency', 'noDependencies', 'selectProvider', 'enableProvider', 'optional', 'overview', 'requires', 'previewTabs', 'search', 'noMatches', 'pluginActions', 'manage', 'retryRemoval', 'paused', 'safeModeTitle', 'safeModeHint', 'localPackages', 'localPackagesHint', 'installed'];
const validFields = (fields: unknown): fields is Metadata['fields'] =>
  Array.isArray(fields) && fields.every(field => typeof field?.label === 'string' && typeof field.value === 'string');
export function limeSettingsProps(value: ComponentProps): Props {
  const metadata = (input: unknown): input is Metadata => {
    const item = input as Partial<Metadata> | null;
    return !!item && ['id', 'name', 'version', 'description'].every(key => typeof (item as Record<string, unknown>)[key] === 'string') && validFields(item.fields);
  };
  if (!value.labels || typeof value.labels !== 'object' || !labels.every(key => typeof (value.labels as Record<string, unknown>)[key] === 'string') ||
    !Array.isArray(value.rows) || !value.rows.every(row => metadata(row) && ['enabled', 'recovery', 'removing'].every(key => typeof (row as unknown as Record<string, unknown>)[key] === 'boolean') && typeof (row as Row).state === 'string' && ((row as Row).requirements === undefined || validFields((row as Row).requirements))) || new Set(value.rows.map(row => row.id)).size !== value.rows.length ||
    (value.preview !== null && (!metadata(value.preview) || !validFields((value.preview as Props['preview'])?.requirements) || typeof (value.preview as Props['preview'])?.warning !== 'boolean' || typeof (value.preview as Props['preview'])?.action !== 'string')) ||
    !['busy', 'available', 'safeMode'].every(key => typeof value[key] === 'boolean') || typeof value.error !== 'string' ||
    (value.vaultId != null && typeof value.vaultId !== 'string') ||
    !['onAdd', 'onConfirm', 'onCancel', 'onToggle', 'onRetry', 'onUpdate', 'onRemove', 'onSafeMode', 'onPlan', 'onSelectProvider'].every(key => typeof value[key] === 'function')) throw new TypeError('Invalid Lime Settings props.');
  const plan = value.dependencyPlan as DependencyPlan | null;
  if (plan !== null && (!plan || typeof plan.pluginId !== 'string' || !Number.isSafeInteger(plan.revision) || !Array.isArray(plan.affected) || !plan.affected.every(id => typeof id === 'string') || !Array.isArray(plan.dependencies) || !plan.dependencies.every(item => item && ['api','event','hook'].includes(item.kind) && typeof item.id === 'string' && typeof item.range === 'string' && typeof item.optional === 'boolean' && (item.selected === undefined || typeof item.selected === 'string') && Array.isArray(item.candidates) && item.candidates.every((candidate: Dependency['candidates'][number]) => candidate && ['id','version','state'].every(key => typeof (candidate as unknown as Record<string, unknown>)[key] === 'string'))))) throw new TypeError('Invalid Lime dependency plan.');
  const installDisabled = (value.preview as Props['preview'])?.installDisabled;
  if (installDisabled !== undefined && (typeof installDisabled !== 'boolean' ||
      (installDisabled && typeof (value.labels as Record<string, unknown>).installDisabled !== 'string'))) throw new TypeError('Invalid Lime install action.');
  return value as unknown as Props;
}
function Details({ item }: { item: Pick<Metadata, 'description' | 'fields'> }) {
  return <Stack gap={6} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    {item.description && <Text size="sm">{item.description}</Text>}
    {item.fields.map((field, index) => <Text key={index} size="sm"><Text span c="dimmed">{field.label}: </Text>{field.value}</Text>)}
  </Stack>;
}
function PackageDialog({ item, labels, overview, dependencies, footer, onClose, closeOnEscape = true }: {
  item: Metadata; labels: Props['labels']; overview: ReactNode; dependencies: ReactNode;
  footer: ReactNode; onClose: () => void; closeOnEscape?: boolean;
}) {
  return <Modal opened onClose={onClose} title={item.name} centered withinPortal={false} returnFocus={false}
    closeOnEscape={closeOnEscape} closeOnClickOutside={false} withCloseButton={false}
    transitionProps={{ duration: 0 }} size="lg" xOffset="1rem" yOffset="1rem"
    classNames={{ content: 'lm-lime-dialog', header: 'lm-lime-dialog-header', body: 'lm-lime-dialog-body' }}>
    <Tabs className="lm-lime-tabs" color="var(--vault-accent-foreground)" defaultValue="overview" keepMounted={false}>
      <Tabs.List aria-label={labels.previewTabs}>
        <Tabs.Tab value="overview" data-autofocus>{labels.overview}</Tabs.Tab>
        <Tabs.Tab value="dependencies">{labels.requires}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview" className="lm-lime-panel" tabIndex={0}>
        <Text size="sm" c="dimmed" mb="xs">{item.version}</Text>
        {overview}
      </Tabs.Panel>
      <Tabs.Panel value="dependencies" className="lm-lime-panel" tabIndex={0}>
        {dependencies}
      </Tabs.Panel>
    </Tabs>
    <Stack className="lm-lime-dialog-footer" gap="xs">{footer}</Stack>
  </Modal>;
}
function PackagePreview({ preview, props }: { preview: NonNullable<Props['preview']>; props: Props }) {
  return <PackageDialog item={preview} labels={props.labels} onClose={props.onCancel} closeOnEscape={!props.busy}
    overview={<Details item={preview} />}
    dependencies={preview.requirements.length ? <Details item={{ description: '', fields: preview.requirements }} /> :
      <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
    footer={<>
      <Text size="sm" c="dimmed">{props.labels.pluginAccess}</Text>
      {preview.warning && <Text role="alert" size="sm" c="var(--vault-error)">{props.labels.warning}</Text>}
      {props.error && <Text role="alert" size="sm" c="var(--vault-error)">{props.error}</Text>}
      <Group gap="xs" wrap="wrap" justify="flex-end">
        <ActionButton disabled={props.busy} onClick={props.onCancel}>{props.labels.cancel}</ActionButton>
        {preview.installDisabled && <ActionButton disabled={props.busy || !props.available}
          onClick={() => props.onConfirm(false)}>{props.labels.installDisabled}</ActionButton>}
        <ActionButton disabled={props.busy || !props.available} onClick={() => props.onConfirm()}>{preview.action}</ActionButton>
      </Group>
    </>} />;
}
function ProviderSelection({ dependency, plan, props, row }: { dependency: Dependency; plan: DependencyPlan; props: Props; row: Row }) {
  const current = dependency.selected ?? '';
  const [selected, setSelected] = useState(current);
  useEffect(() => { setSelected(current); }, [plan.revision, current]);
  const candidate = dependency.candidates.find(item => item.id === selected);
  const options = dependency.candidates.map(item => ({
    value: item.id, label: `${item.id} ${item.version} · ${props.labels[item.state] ?? item.state}`,
  }));
  const [onlyOption] = options;
  const needsEnable = row.enabled && candidate?.state === 'disabled';
  const locked = props.busy || props.safeMode;
  return <Box component="li" className="lm-lime-dependency">
    <Text size="sm" fw={600}>
      {dependency.kind}:{dependency.id}{' '}
      <Text span fw={400} c="dimmed">{dependency.range}{dependency.optional ? ` (${props.labels.optional})` : ''}</Text>
    </Text>
    {!onlyOption ? <Text size="sm" c="dimmed">{props.labels.missingDependency}</Text> :
      options.length === 1 && onlyOption.value === dependency.selected ?
        <Text size="sm">{options.find(option => option.value === dependency.selected)?.label ?? options.map(option => option.label).join(', ')}</Text> :
        <Group className="lm-lime-provider-actions" gap="xs">
          <Box className="lm-lime-provider-select">
            <SettingsSelect aria-label={`${props.labels.provider} ${dependency.id}`} value={selected || props.labels.selectProvider!} options={options} disabled={locked} onChange={setSelected} />
          </Box>
          <ActionButton disabled={locked || !candidate || needsEnable || selected === current}
            onClick={() => props.onSelectProvider(plan.pluginId, dependency.kind, dependency.id, selected, plan.revision)}>{props.labels.applyProvider}</ActionButton>
        </Group>}
    {needsEnable && <Text size="sm" c="dimmed">{props.labels.enableProvider}</Text>}
  </Box>;
}
function PackageDetails({ row, props, onClose }: { row: Row; props: Props; onClose: () => void }) {
  const plan = props.dependencyPlan?.pluginId === row.id ? props.dependencyPlan : null;
  return <PackageDialog item={row} labels={props.labels} onClose={onClose}
    overview={<Stack gap="xs">
      {row.description && <Text size="sm">{row.description}</Text>}
      <Box component="dl" className="lm-lime-metadata">
        {row.fields.map((field, index) => <Box key={index} className="lm-lime-metadata-row">
          <Text component="dt" size="sm" c="dimmed">{field.label}</Text>
          <Text component="dd" size="sm">{field.value}</Text>
        </Box>)}
      </Box>
    </Stack>}
    dependencies={<Stack gap="xs">
      <Group justify="flex-end" gap="xs">
        <ActionButton leftSection={<Icon name="refresh" />} disabled={props.busy}
          onClick={() => props.onPlan(row.id)}>{props.labels.refreshDependencies}</ActionButton>
      </Group>
      {plan ? <>
        {plan.affected.some(pluginId => pluginId !== row.id) &&
          <Text size="sm" c="dimmed">{props.labels.affected}: {plan.affected.join(', ')}</Text>}
        {plan.dependencies.length ? <Box component="ul" className="lm-lime-dependency-list">
          {plan.dependencies.map(dependency => <ProviderSelection key={`${dependency.kind}:${dependency.id}`}
            dependency={dependency} plan={plan} props={props} row={row} />)}
        </Box> : <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
      </> : row.requirements?.length ? <Details item={{ description: '', fields: row.requirements }} /> :
        <Text size="sm" c="dimmed">{props.labels.noDependencies}</Text>}
    </Stack>}
    footer={<>
      {props.error && <Text size="sm" c="var(--vault-error)" role="alert">{props.error}</Text>}
      <Group justify="flex-end">
        <ActionButton onClick={onClose}>{props.labels.close ?? props.labels.cancel}</ActionButton>
      </Group>
    </>} />;
}
interface PackageRowProps {
  readonly row: Row;
  readonly props: Props;
  readonly locked: boolean;
  readonly onDetails: (id: string, trigger: HTMLButtonElement) => void;
  readonly onUpdate: (id: string, trigger: HTMLButtonElement) => void;
  readonly onRequestRemoval: (id: string, trigger: HTMLButtonElement) => void;
  readonly confirmation?: ReactNode;
}

function PackageRow({ row, props, locked, onDetails, onUpdate, onRequestRemoval, confirmation }: PackageRowProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menuLabel = `${props.labels.pluginActions}: ${row.name}`;
  return <Box component="li" className="lm-lime-package" data-lime-id={row.id}>
    <Box className="lm-lime-package-header">
      <Stack className="lm-lime-package-name" gap={4}>
        <Text size="sm" fw={600}>{row.name}</Text>
        <Text size="xs" c="dimmed">{row.version} · {row.state}</Text>
      </Stack>
      <Group className="lm-lime-row-actions" gap="xs" wrap="nowrap">
        <Switch aria-label={`${props.labels.enabled} ${row.name}`} checked={row.enabled}
          disabled={locked || props.safeMode || row.removing}
          onChange={event => props.onToggle(row.id, event.currentTarget.checked)} />
        <ViewportMenu disabled={locked} position="bottom-end" offset={6} returnFocus>
          <Menu.Target>
            <ActionIcon ref={trigger} className="lm-lime-icon lm-focus" variant="subtle" size={30}
              aria-label={menuLabel} title={props.labels.pluginActions} disabled={locked}><Icon name="actions" /></ActionIcon>
          </Menu.Target>
          <ProductDropdown className="lm-lime-row-menu" aria-label={menuLabel}>
            <Menu.Item leftSection={<Icon name="callout-info" />} aria-haspopup="dialog"
              onClick={() => onDetails(row.id, trigger.current!)}>{props.labels.details}</Menu.Item>
            {row.recovery && !row.removing && <Menu.Item leftSection={<Icon name="refresh" />} disabled={props.safeMode}
              onClick={() => props.onRetry(row.id)}>{props.labels.retry}</Menu.Item>}
            <Menu.Item leftSection={<Icon name="refresh" />} disabled={row.removing}
              onClick={() => onUpdate(row.id, trigger.current!)}>{props.labels.update}</Menu.Item>
            <Menu.Divider />
            <Menu.Item className="lm-lime-remove-action" leftSection={<Icon name={row.removing ? 'refresh' : 'trash'} />}
              onClick={() => row.removing ? props.onRemove(row.id, false) : onRequestRemoval(row.id, trigger.current!)}>
              {props.labels[row.removing ? 'retryRemoval' : 'remove']}
            </Menu.Item>
          </ProductDropdown>
        </ViewportMenu>
      </Group>
    </Box>
    {confirmation}
  </Box>;
}

interface LimeViewProps {
  props: Props;
  theme: ReturnType<typeof resolveTheme>;
  overlay: { id: string; target: HTMLElement };
}

export function LimeSettings(view: LimeViewProps) {
  return <LimeManagement key={view.props.vaultId} {...view} />;
}

function LimeManagement({ props, theme, overlay }: LimeViewProps) {
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const details = props.available ? props.rows.find(row => row.id === detailsId) : undefined;
  const dialogOpen = !!(props.preview || details);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement>(null);
  const cancelRemoval = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const safeModeSwitch = useRef<HTMLInputElement>(null);
  const changingMode = useRef(false);
  const hadDialog = useRef(false);
  useEffect(() => {
    if (dialogOpen) {
      hadDialog.current = true;
      return;
    }
    if (!hadDialog.current || props.busy) return;
    hadDialog.current = false;
    const trigger = dialogTrigger.current;
    (trigger?.isConnected ? trigger : searchInput.current ?? addButton.current)?.focus({ preventScroll: true });
  }, [dialogOpen, props.busy]);
  useEffect(() => { if (detailsId && !details) setDetailsId(null); }, [detailsId, details]);
  useEffect(() => { if (removing) cancelRemoval.current?.focus({ preventScroll: true }); }, [removing]);
  useEffect(() => {
    if (!removing || props.busy) return;
    const row = props.rows.find(item => item.id === removing);
    if (row && !row.removing) return;
    setRemoving(null);
    if (!props.rows.length) setQuery('');
    (row ? removeTrigger.current : searchInput.current ?? addButton.current)?.focus({ preventScroll: true });
  }, [props.rows, props.busy, removing]);
  useEffect(() => {
    if (!changingMode.current || props.busy) return;
    changingMode.current = false;
    safeModeSwitch.current?.focus({ preventScroll: true });
  }, [props.safeMode, props.busy]);

  const locked = props.busy || !props.available || dialogOpen;
  const selectDetails = (id: string, trigger: HTMLButtonElement) => {
    dialogTrigger.current = trigger;
    props.onPlan(id);
    setDetailsId(id);
  };
  const update = (id: string, trigger: HTMLButtonElement) => {
    dialogTrigger.current = trigger;
    props.onUpdate(id);
  };
  const requestRemoval = (id: string, trigger: HTMLButtonElement) => {
    removeTrigger.current = trigger;
    props.onPlan(id);
    setRemoving(id);
  };
  const closeRemoval = () => {
    setRemoving(null);
    removeTrigger.current?.focus({ preventScroll: true });
  };
  const changeSafeMode = (enabled: boolean) => {
    changingMode.current = true;
    props.onSafeMode(enabled);
  };
  const filter = query.trim().toLowerCase();

  function renderList(rows: readonly Row[]) {
    const filtered = filter ? rows.filter(row => row.name.toLowerCase().includes(filter) || row.id.toLowerCase().includes(filter)) : rows;
    return <Stack gap="sm">
      {rows.length > 0 && <TextInput ref={searchInput} className="lm-lime-search" classNames={{ input: 'lm-input' }} type="search"
          aria-label={props.labels.search} placeholder={props.labels.search} leftSection={<Icon name="search" />} value={query}
          onChange={event => { setRemoving(null); setQuery(event.currentTarget.value); }}
          onKeyDown={event => {
            if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) {
              event.preventDefault();
              setQuery('');
            }
          }} />}
      {filtered.length > 0 ? <Box component="ul" className="lm-lime-package-list">
        {filtered.map(row => <PackageRow key={row.id} row={row} props={props} locked={locked}
          onDetails={selectDetails} onUpdate={update} onRequestRemoval={requestRemoval}
          confirmation={removing === row.id && !row.removing && <Stack className="lm-lime-removal" gap="xs" role="group"
            aria-label={`${props.labels.remove} ${row.name}`} onKeyDown={event => {
              if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!locked) closeRemoval();
            }}>
            <Text size="sm">{props.labels.removePrompt}</Text>
            {props.dependencyPlan?.pluginId === row.id && props.dependencyPlan.affected.some(id => id !== row.id) &&
              <Text size="sm" c="dimmed">{props.labels.affected}: {props.dependencyPlan.affected.join(', ')}</Text>}
            <Group gap="xs" wrap="wrap">
              <ActionButton disabled={locked} onClick={() => props.onRemove(row.id, false)}>{props.labels.keepData}</ActionButton>
              <ActionButton className="lm-lime-remove-action" disabled={locked} onClick={() => props.onRemove(row.id, true)}>{props.labels.deleteData}</ActionButton>
              <ActionButton ref={cancelRemoval} disabled={locked} onClick={closeRemoval}>{props.labels.cancel}</ActionButton>
            </Group>
          </Stack>} />)}
      </Box> : <Text className="lm-lime-message" role="status" size="sm" c="dimmed">{rows.length ? props.labels.noMatches : props.labels.empty}</Text>}
    </Stack>;
  }

  return <Stack className="lm-lime-settings" gap="sm" style={theme.contentStyle} aria-busy={props.busy}>
    {props.error && !dialogOpen && <Text className="lm-lime-message" size="sm" c="var(--vault-error)" role="alert">{props.error}</Text>}
    {!props.available ? <Text className="lm-lime-message" size="sm" c="dimmed">{props.labels.noVault}</Text> : <>
      <Box className="lm-lime-overview">
        <Group className="lm-lime-overview-row" gap="xs">
          <Box className="lm-lime-overview-copy">
            <Text size="sm" fw={600}>{props.labels.safeModeTitle}</Text>
            <Text size="sm" c="dimmed" role="status">{props.safeMode ? props.labels.paused : props.labels.safeModeHint}</Text>
          </Box>
          <Switch ref={safeModeSwitch} aria-label={props.labels.safeModeTitle} checked={props.safeMode} disabled={locked}
            onChange={event => changeSafeMode(event.currentTarget.checked)} />
        </Group>
        <Group className="lm-lime-overview-row" gap="xs">
          <Box className="lm-lime-overview-copy">
            <Text size="sm" fw={600}>{props.labels.localPackages}</Text>
            <Text size="sm" c="dimmed">{props.labels.localPackagesHint}</Text>
          </Box>
          <ActionButton ref={addButton} accent leftSection={<Icon name="create" />} disabled={locked}
            onClick={event => { dialogTrigger.current = event.currentTarget; props.onAdd(); }}>{props.labels.add}</ActionButton>
        </Group>
        <Group className="lm-lime-overview-row" gap="xs">
          <Text className="lm-lime-overview-copy" size="sm" fw={600}>{props.labels.installed}</Text>
          <Text className="lm-lime-installed-count" size="sm">{props.rows.length}</Text>
        </Group>
      </Box>
      <Text component="h3" className="lm-lime-management-heading" size="md" fw={650}>{props.labels.manage}</Text>
      {renderList(props.rows)}
    </>}
    {dialogOpen && createPortal(
      <div id={overlay.id} className="lm-root lm-lime-overlay" data-mantine-color-scheme={theme.scheme}
        data-window-chrome={theme.windowChrome} style={theme.contentStyle}>
        {props.preview ? <PackagePreview key={props.preview.id} preview={props.preview} props={props} /> :
          details && <PackageDetails key={details.id} row={details} props={props} onClose={() => setDetailsId(null)} />}
      </div>,
      overlay.target,
    )}
  </Stack>;
}
