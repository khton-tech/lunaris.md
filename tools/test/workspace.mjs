import { useBrowser } from './browser.mjs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Config } from '@lunaris/config';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import { Localization } from '@lunaris/localization';
import { Vault, VaultCreation, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged } from '@lunaris/vault';
import { Workspace } from '@lunaris/workspace';
import { Sidebar } from "@lunaris/sidebar";
import sidebarPlugin from "@lunaris/sidebar-plugin";
import sidebarProvider from "@lunaris/sidebar-provider";
import workspaceProvider from "@lunaris/workspace-provider";
import workspacePlugin from '@lunaris/workspace-plugin';
import { createVaultSelector } from '@lunaris/vault-selector';
import { createStartupProvider } from '@lunaris/startup-provider';
import localization from '@lunaris/localization-manager';
import componentProvider from '@lunaris/component-provider';
import kit from '@lunaris/mantine-components';
import themes from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../../hosts/tauri/dist/slots.js';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
export const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions, optionalPermissions: [] });

export async function setupWorkspace(options = {}) {
  const dom = useBrowser(new JSDOM('<div id="app"></div>')); const surface = dom.window.document.getElementById('app');
  const logs = []; let current = options.current ?? null; let serial = 0; let ctx; let tools; let service;
  const preferences = options.preferences ?? new Map(); const preferenceWrites = [];
  const config = definePlugin({ manifest: manifest('test.config', [Config]), activate(context) {
    context.provide(Config, {
      read: async () => ok(Object.fromEntries(preferences)),
      get: async (_, key) => options.configReadFailure ? fail('IO_ERROR') : ok(preferences.get(key)),
      set: async (pluginId, key, value, target) => {
        preferenceWrites.push({ pluginId, key, value, target });
        if (options.configWriteFailure) return fail('IO_ERROR');
        preferences.set(key, value); return ok(null);
      },
      remove: async (_, key) => ok(preferences.delete(key)),
    });
  } });
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const vaults = definePlugin({ manifest: manifest('test.vaults', [Vault, VaultCreation, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged]), activate(context) {
    async function open(location, input) {
      const previous = current; current = { id: `vault-${++serial}`, name: input?.name ?? 'Notes' };
      await context.events.emit(VaultChanged, { kind: previous ? 'switched' : 'opened', previous, current, location });
      return ok(current);
    }
    service = { current: () => current, open: () => open({ reference: 'saved', label: 'Folder' }), async close() {
      options.closeCalls = (options.closeCalls ?? 0) + 1;
      await options.beforeClose?.();
      if (options.closeFailure) return fail(options.closeFailure);
      const previous = current; current = null;
      await context.events.emit(VaultChanged, { kind: 'closed', previous, current }); return ok(null);
    } };
    context.provide(Vault, service);
    context.provide(VaultCreation, { create: (parent, name) => open({ reference: parent.reference + "/" + name, label: parent.label + "/" + name }, { name }) });
    context.provide(VaultLocations, { describe: async reference => ok({ reference, label: 'Folder' }), select: async () => ok({ reference: 'saved', label: 'Folder' }), open });
    context.provide(VaultHistory, { list: async () => ok([{ location: { reference: 'saved', label: 'Folder' }, name: 'Notes' }]), open: () => service.open() });
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Workspace, Components, Themes, Localization, ...(options.sidebar ? [Sidebar] : [])], ['ui.dom']), activate(context) {
    ctx = context; tools = { ...(options.sidebar ? { sidebar: context.use(Sidebar) } : {}), workspace: context.use(Workspace), components: context.use(Components), themes: context.use(Themes), localization: context.use(Localization) };
    tools.themes.select('lunaris.base-theme-engine.monochrome');
    options.onActivate?.(tools, context);
    options.beforeLoaded?.(surface);
  } });
  const startup = createStartupProvider(); const layout = composeSlotSurface(surface); const selector = createVaultSelector({ art: 'ASCII', hideWhenVaultOpen: true });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ ...layout, startup,
    plugins: [...(options.sidebar ? [sidebarPlugin, sidebarProvider] : []), config, logger, vaults, localization, componentProvider, kit, themes, baseTheme, consumer, startup.plugin, selector, workspacePlugin, workspaceProvider, ...layout.plugins],
    entrypoints: [startup.plugin.manifest.id, baseTheme.manifest.id, ...(options.noKit ? [] : [kit.manifest.id]), selector.manifest.id, workspacePlugin.manifest.id, ...(options.sidebar ? [sidebarPlugin.manifest.id] : []), consumer.manifest.id],
    grants: { ...layout.grants, [componentProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'], 'test.consumer': ['ui.dom'], ...(options.sidebar ? { [sidebarPlugin.manifest.id]: ['ui.dom'] } : {}),
      [selector.manifest.id]: ['ui.dom', 'vault.access'], [workspacePlugin.manifest.id]: options.denied ? ['ui.dom', 'config.access'] : ['ui.dom', 'vault.access', 'config.access'] },
  }) });
  await session.start(); await flush();
  return { dom, surface, session, logs, ctx, tools, service, preferences, preferenceWrites, async open() { await service.open(); await flush(); },
    async stop() { await session.stop(); assert.equal(surface.childElementCount, 0);
      assert.deepEqual(session.snapshot().kernel.diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), [], logs.filter(log => log[0] === 'error').map(log => log[3]?.error?.stack).join('\n')); dom.window.close(); } };
}
export function panel(s, id = 'test.panel', options = {}) {
  const owner = s.ctx.scope.child(); const seen = []; const releases = [];
  const result = s.tools.components.register({ id, mount(target, props, signal) {
    if (options.fail) throw new Error('Panel render failure');
    const node = target.ownerDocument.createElement('article'); node.dataset.panel = id; target.append(node);
    const update = next => { if (options.updateFail) throw new Error('Panel update failure'); seen.push(next); node.textContent = `${next.label ?? 'Panel'}: ${next.workspace.vaultName}`; };
    update(props); signal.addEventListener('abort', () => releases.push(props.workspace.vaultId), { once: true });
    return { update, dispose() { node.remove(); } };
  } }, owner.signal);
  assert.equal(result.ok, true);
  return { owner, seen, releases };
}
