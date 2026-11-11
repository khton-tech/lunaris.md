import { definePlugin } from "@lunaris/sdk";
import type { PluginManifest } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Lime, LimeChanged } from "@lunaris/lime";
import type { LimeDependencyPlan, LimePreview, LimeResult } from "@lunaris/lime";
import { Settings } from "@lunaris/settings";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { catalogs } from "./catalogs.js";

const categoryId = 'lunaris.lime-settings.plugins'; const sectionId = 'lunaris.lime-settings.manager';
export default definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lime-settings', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/index.js',
  provides: [], requires: [Logger, Lime, LimeChanged, Settings, Localization, LocaleChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions: ['runtime.manage'], optionalPermissions: [],
}, activate(ctx) {
  const logger = ctx.use(Logger); const engine = ctx.use(Lime); const settings = ctx.use(Settings); const localization = ctx.use(Localization);
  const registered = localization.register(ctx.pluginId, catalogs, ctx.signal); if (!registered.ok) throw new Error('Cannot register Lime Settings catalogs.', { cause: registered.error });
  const text = (key: string) => localization.text(ctx.pluginId, key);
  let preview: LimePreview | null = null; let localBusy = false; let error = ''; let scheduled = false; let currentVault = engine.snapshot().vaultId;
  let dependencyPlan: LimeDependencyPlan | null = null;
  function metadata(manifest: PluginManifest | undefined, id: string, version: string, includeRequirements = true) {
    const meta = manifest?.metadata; const locale = localization.locale().toLowerCase();
    const translationKey = Object.keys(meta?.translations ?? {}).find(key => key.toLowerCase() === locale) ?? Object.keys(meta?.translations ?? {}).find(key => key.toLowerCase() === locale.split('-')[0]);
    const translation = translationKey ? meta!.translations![translationKey] : undefined;
    const fields = [{ label: text('identifier'), value: id }];
    if (meta) fields.push({ label: text('author'), value: meta.author }, { label: text('platforms'), value: meta.platforms === 'universal' ? text('universal') : meta.platforms.join(', ') }, { label: text('languages'), value: meta.languages.join(', ') });
    if (meta?.repository) fields.push({ label: text('repository'), value: meta.repository });
    if (manifest?.provides.length) fields.push({ label: text('provides'), value: manifest.provides.map(item => `${item.kind}:${item.id} ${item.version}`).join('; ') });
    if (includeRequirements && manifest?.requires.length) fields.push({ label: text('requires'), value: manifest.requires.map(item => `${item.kind}:${item.id} ${item.range}${item.optional ? ` (${text('optional')})` : ''}`).join('; ') });
    if (meta?.fields) fields.push(...meta.fields);
    return { id, version, name: translation?.name ?? meta?.name ?? id, description: translation?.description ?? meta?.description ?? '', fields };
  }
  function changed(): void {
    if (scheduled || ctx.signal.aborted) return; scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false; if (ctx.signal.aborted) return;
      const state = engine.snapshot();
      if (state.vaultId !== currentVault) { preview = null; dependencyPlan = null; error = ''; currentVault = state.vaultId; }
      if (dependencyPlan && !state.installations.some(item => item.id === dependencyPlan!.pluginId)) dependencyPlan = null;
      const category = settings.updateCategory(categoryId, { title: text('title'), icon: 'package' });
      const result = settings.updateSection(sectionId, { title: text('section'), props: props() });
      if (!category.ok || !result.ok) logger.error(ctx.pluginId, 'Cannot refresh Lime Settings', { error: !result.ok ? result.error : !category.ok ? category.error : undefined });
    }).catch(cause => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, 'Lime Settings refresh failed', { error: cause }); });
  }
  async function operate(work: () => Promise<LimeResult<null>>): Promise<void> {
    if (ctx.signal.aborted || localBusy) return; localBusy = true; error = ''; changed();
    try {
      const result = await work(); if (ctx.signal.aborted) return;
      if (!result.ok) { error = text(result.error.code); logger.warn(ctx.pluginId, 'Lime Settings action failed', { data: { code: result.error.code } }); }
      else logger.info(ctx.pluginId, 'Lime Settings action completed');
    } catch (cause) { if (!ctx.signal.aborted) { error = text('RUNTIME_FAILED'); logger.error(ctx.pluginId, 'Lime Settings action failed', { error: cause }); } }
    finally { localBusy = false; changed(); }
  }
  async function choose(expectedId?: string): Promise<void> {
    if (ctx.signal.aborted || localBusy) return; localBusy = true; error = ''; changed();
    try {
      // Preserve native picker user activation: invoke before the first await.
      const result = await engine.preview(); if (ctx.signal.aborted) return;
      if (!result.ok) error = text(result.error.code);
      else if (result.value && expectedId && result.value.manifest.id !== expectedId) { engine.cancelPreview(result.value.ticket); error = text('identityError'); }
      else preview = result.value;
    } catch (cause) { if (!ctx.signal.aborted) { error = text('INVALID_PACKAGE'); logger.error(ctx.pluginId, 'Cannot select plugin package', { error: cause }); } }
    finally { localBusy = false; changed(); }
  }
  function props() {
    const state = engine.snapshot(); const busy = state.busy || localBusy;
    const rows = state.installations.map(item => ({ ...metadata(item.manifest, item.id, item.version), enabled: item.enabled, recovery: item.recoveryRequired, removing: item.removalPending, state: text(Object.hasOwn(catalogs.en, item.state) ? item.state : 'unavailable') }));
    const previewDetails = preview && metadata(preview.manifest, preview.manifest.id, preview.manifest.version, false);
    const requirements: { label: string; value: string }[] = [];
    if (preview?.dependencyPlan) {
      const plan = preview.dependencyPlan;
      if (plan.affected.length > 1) requirements.push({ label: text('affected'), value: plan.affected.join(', ') });
      for (const node of plan.graph) for (const dependency of node.dependencies) {
        const candidates = dependency.candidates.map(candidate =>
          `${candidate.id} ${candidate.version} · ${text(Object.hasOwn(catalogs.en, candidate.state) ? candidate.state : 'unavailable')}`);
        requirements.push({
          label: `${node.pluginId} / ${dependency.kind}:${dependency.id} ${dependency.range}`,
          value: candidates.length ? candidates.join(', ') : text(dependency.optional ? 'optionalUnavailable' : 'missingDependency'),
        });
      }
    }
    if (!requirements.length) for (const item of preview?.manifest.requires ?? []) {
      requirements.push({ label: `${item.kind}:${item.id}`, value: `${item.range}${item.optional ? ` (${text('optional')})` : ''}` });
    }
    return { labels: Object.fromEntries(Object.keys(catalogs.en).map(key => [key, text(key)])), rows,
      preview: preview && previewDetails ? { ...previewDetails, requirements, warning: preview.platformWarning, action: text(state.installations.some(item => item.id === preview!.manifest.id) ? 'update' : 'install') } : null,
      dependencyPlan,
      onPlan: (id: string) => {
        if (localBusy || state.busy) return;
        const result = engine.plan(id); dependencyPlan = result.ok ? result.value : null;
        if (!result.ok) error = text(result.error.code); changed();
      },
      onSelectProvider: (id: string, kind: 'api' | 'event' | 'hook', contractId: string, providerId: string, revision: number) => { void operate(async () => {
        const result = await engine.selectProvider(id, kind, contractId, providerId, revision);
        if (!ctx.signal.aborted) { const refreshed = engine.plan(id); dependencyPlan = refreshed.ok ? refreshed.value : null; }
        return result;
      }); },
      busy, available: !!state.vaultId, safeMode: state.safeMode, error: error || (state.error ? text('environmentError') : ''),
      onAdd: () => { void choose(); }, onUpdate: (id: string) => { void choose(id); },
      onConfirm: () => { const selected = preview; if (!selected) return; void operate(async () => {
        try { return await (engine.snapshot().installations.some(item => item.id === selected.manifest.id) ? engine.update(selected.ticket) : engine.install(selected.ticket)); }
        finally { preview = null; }
      }); },
      onCancel: () => { if (preview) engine.cancelPreview(preview.ticket); preview = null; changed(); },
      onToggle: (id: string, enabled: boolean) => { void operate(() => enabled ? engine.enable(id) : engine.disable(id)); },
      onRetry: (id: string) => { void operate(() => engine.retry(id)); },
      onRemove: (id: string, deleteData: boolean) => { void operate(() => engine.remove(id, deleteData)); },
      onSafeMode: (safeMode: boolean) => { void operate(() => engine.restore(safeMode)); },
    };
  }
  const category = settings.registerCategory({ id: categoryId, title: text('title'), icon: 'package', order: 80 }, ctx.signal);
  if (!category.ok) throw new Error('Cannot register Lime Settings category.', { cause: category.error });
  const section = settings.registerSection({ id: sectionId, categoryId, title: text('section'), componentId: 'lunaris.lime-settings', props: props() }, ctx.signal);
  if (!section.ok) throw new Error('Cannot register Lime Settings section.', { cause: section.error });
  ctx.events.on(LimeChanged, changed); ctx.events.on(LocaleChanged, changed);
  logger.info(ctx.pluginId, 'Lime Settings ready');
} });
