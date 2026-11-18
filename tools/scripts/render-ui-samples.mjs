// Run against the same built workspace packages used by the integration tests.
// Usage: node tools/scripts/render-ui-samples.mjs <chrome-headless-shell> <output-directory>
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [binary, directory] = process.argv.slice(2);
if (!binary || !directory) throw new Error('Provide a headless-shell executable and an output directory.');
const output = path.resolve(directory);
const temp = await mkdtemp(path.join(tmpdir(), 'lunaris-render-'));
const scenes = [
  ['server', 'monochrome', 1120, 740],
  ['account-menu', 'monochrome', 1120, 740],
  ['buttons', 'rose-pine', 1120, 740],
  ['buttons', 'monochrome', 1120, 740],
  ['buttons', 'windows-xp', 1120, 740],
  ['buttons-disabled', 'monochrome', 1120, 740],
  ['package', 'windows-xp-dark', 844, 390],
  ['history', 'rose-pine', 390, 680],
  ['empty', 'monochrome', 390, 680],
  ['selector', 'monochrome', 1120, 740],
  ['create', 'windows-xp', 1120, 740],
  ['create', 'everforest-dark', 390, 680],
  ['settings', 'monochrome', 1120, 740],
  ['menu', 'windows-xp', 1120, 740],
  ['menu', 'everforest-dark', 390, 680],
  ['menu', 'windows-xp-dark', 844, 390],
  ['editor', 'everforest-dark', 1120, 740],
  ['editor', 'rose-pine', 850, 946],
  ['editor', 'monochrome', 390, 680],
  ['files', 'windows-xp-dark', 390, 680],
];

// Mount the production roles and editor adapter with an in-memory document.
// Filesystem, server and clipboard operations are outside this rendering sample.
async function documentScene(s, showDrawer) {
  const title = 'Подготовка материалов к архитектурному обзору в ноябре';
  const filename = title + '.md';
  const activePath = 'Проекты/Обзоры/' + filename;
  const text = 'Записи к обсуждению рабочей области и структуры хранилища.\n\n## Повестка\n\n- Обновить список материалов.\n- Сверить названия разделов.\n\n> Итоговые решения войдут в протокол встречи.';
  const file = (id, name = id.split('/').at(-1)) => ({ id, name, kind: 'file' });
  const data = [
    { id: 'Проекты', name: 'Проекты', kind: 'directory', children: [
      { id: 'Проекты/Обзоры', name: 'Обзоры', kind: 'directory', children: [file(activePath), file('Проекты/Обзоры/Схема.pdf')] },
      file('Проекты/План.md'),
    ] }, file('Входящие.md'), file('Заметки.md'),
  ];
  const noop = () => {};
  const unavailable = async () => false;
  const { sidebar, screens, workspace } = s.tools;
  const owner = s.ctx.signal;
  const vault = s.service.current();
  sidebar.register({ id: 'sample.files', componentId: 'lunaris.file-explorer', title: filesText.ru.title, icon: 'files', props: {
    vaultId: vault.id, data, activePath, supportedExtensions: ['md'], expanded: ['Проекты', 'Проекты/Обзоры'], selection: [],
    busy: false, loading: false, error: '', degraded: '', canPaste: false, text: filesText.ru, initialDraft: { form: null, name: '' },
    onDraft: noop, onToggle: noop, onSelection: noop, onBuffer: noop, onCreate: unavailable, onRename: unavailable, onMove: unavailable,
    onPaste: unavailable, onRemove: unavailable, onRefresh: noop, onSort: noop, onExpandAll: noop, onContextMenu: noop,
    vaultSwitcher: { name: vault.name, entries: [], activeReference: null, busy: false, error: '', historyError: false, onRecent: noop, onChange: noop, onRetry: noop },
  } }, owner);
  sidebar.select('sample.files');
  let editor;
  screens.register({ id: 'sample.document', componentId: 'lunaris.text-editor', props: {
    documentKey: activePath, name: filename, title, tabTitle: title, titleLabel: editorText.title,
    compact: window.innerWidth <= 760, contentWidth: 698, canRename: true, onRename: unavailable,
    status: '', error: '', ready: true, dirty: false, busy: false, saveLabel: editorText.save, retryLabel: editorText.retry,
    reloadLabel: editorText.reload, discardLabel: editorText.discard, cancelLabel: editorText.cancel, onSave: noop, onReload: noop,
    onTarget(target) {
      editor?.dispose();
      editor = target ? mountEditor(target, { text, locks: 0, recoveryCandidates: [], edit: noop },
        undefined, s.tools.themes.current(), editorText.editor, noop, error => { throw error; }) : undefined;
    },
  } }, owner);
  screens.select('sample.document');
  const { words, letters } = countDocument(text);
  workspace.register({ id: 'sample.status', componentId: 'lunaris.status-bar', region: 'bottom', props: {
    label: statusText.label, filename: title, fileTitle: activePath, serverLabel: '', serverTitle: '', serverState: null,
    words, letters, wordsLabel: statusText.words.replace('{count}', words), lettersLabel: statusText.letters.replace('{count}', letters),
  } }, owner);
  if (showDrawer) s.tools.navigation.open();
  await flush();
  if (!document.querySelector('.cm-content') || !document.querySelector('[role=treeitem][aria-level="4"]')) {
    throw new Error('The sample document or its expanded Files path did not mount.');
  }
  if (!showDrawer) {
    await document.fonts.ready;
    const field = document.querySelector('.lm-editor-title textarea');
    const line = parseFloat(getComputedStyle(field).lineHeight);
    if (field.value !== title || field.scrollHeight > field.clientHeight + 1 || field.clientHeight < line * 1.5) {
      throw new Error(`Document title clipped: height=${field.clientHeight}, content=${field.scrollHeight}, line=${line}.`);
    }
    document.documentElement.dataset.titleBounds = `${innerWidth}px: ${field.clientHeight}/${field.scrollHeight}px, line ${line}px`;
  }
  if (showDrawer || innerWidth > 760) {
    const row = document.querySelector('.lm-explorer-node[data-active]');
    const name = row.querySelector('.lm-explorer-filename').getBoundingClientRect();
    const area = document.querySelector('.lm-explorer-tree').getBoundingClientRect();
    if (name.width <= 0 || name.left < area.left || name.right > area.right + 1) throw new Error('Active name outside the Files viewport.');
  }
  if (innerWidth > 760) {
    const file = document.querySelector('.lm-status-file').getBoundingClientRect();
    const metrics = document.querySelector('.lm-status-counts').getBoundingClientRect();
    if (file.width <= 0 || file.right > metrics.left || file.bottom <= metrics.top) throw new Error('Filename and metrics do not fit the status row.');
  }
}

function sampleProvider(id, tokens, activate) {
  return definePlugin({ manifest: {
    manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: tokens.map(({ kind, id, version }) => ({ kind, id, version })), requires: [], permissions: [], optionalPermissions: [],
  }, activate });
}

function scenePlugins(view, theme) {
  const ok = value => ({ ok: true, value });
  const unsupported = () => ({ ok: false, error: { code: 'UNSUPPORTED' } });
  let ui = createInterfaceSettings({ defaultThemeId: theme });
  const providers = [];
  const grants = {};
  if (['server','account-menu','selector','create','empty','history'].includes(view)) {
    ui = createAccountAccess({ allowLocal: true, art });
    providers.push(sampleProvider('sample.server', [AccountSession, AccountSessionChanged, AccountVaults, FilesystemSources], ctx => {
      const server = 'https://notes.example';
      ctx.provide(AccountSession, {
        current: () => ({ server, account: { id: 'sample', login: 'anna' }, epoch: '1' }),
        connect: async () => ok({ protocol: 1, buildId: 'sample', registration: 'invitation', name: 'Архив команды' }),
        register: unsupported, login: unsupported, logout: unsupported,
      });
      ctx.provide(AccountVaults, { list: async () => ok([{
        id: 'shared', name: 'Рабочие материалы', state: 'active', location: { reference: 'shared', label: 'Архив команды' }, deletedAt: null, expiresAt: null,
      }]), create: unsupported, trash: unsupported, restore: unsupported });
      ctx.provide(FilesystemSources, { list: () => ['remote'], location: (_source, value) => ok(value),
        capabilitiesFor: unsupported, remoteIdentity: unsupported, locationVisible: () => true });
    }));
    grants['lunaris.vault-selector'] = ['ui.dom', 'vault.access', 'account.access'];
  } else if (view === 'package' || view.startsWith('buttons')) {
    ui = limeSettings;
    providers.push(sampleProvider('sample.packages', [Lime, LimeChanged], ctx => {
      ctx.provide(Lime, {
        snapshot: () => ({ vaultId: 'vault-1', busy: view === 'buttons-disabled', safeMode: false, error: null, installations: view.startsWith('buttons') ? [{ id: sampleManifest.id, version: sampleManifest.version, manifest: sampleManifest, enabled: true, recoveryRequired: false, removalPending: false, state: 'active' }] : [] }),
        composition: unsupported, plan: unsupported, selectProvider: unsupported, applyComposition: unsupported,
        cancelPreview: unsupported, install: unsupported, update: unsupported, enable: unsupported, disable: unsupported,
        retry: unsupported, remove: unsupported, restore: unsupported,
        preview: async () => ok({ ticket: 1, manifest: sampleManifest, digest: 'a'.repeat(64), platformWarning: false }),
      });
    }));
  }
  grants[ui.manifest.id] = ui.manifest.permissions;
  return { plugins: [...providers, ui], entrypoints: [ui.manifest.id], grants };
}

// Runs only in a fresh file-backed rendering fixture. Set its initial state
// before painting; there is no remote debugging connection or native UI.
async function renderScene({ view, theme }) {
  const recentVaults = [
    { name: 'Рабочие заметки', location: { reference: 'work', label: 'C:/Documents/Рабочие заметки' } },
    { name: 'Личное', location: { reference: 'journal', label: 'D:/Заметки/Личное' } },
    { name: 'Команда', location: { reference: 'team', label: 'https://notes.example · Команда' } },
  ];
  if (view === 'history') {
    for (let i = 1; i <= 20; i++) recentVaults.push({ name: 'Архив ' + i, location: { reference: 'archive-' + i, label: '/Documents/Архивы/' + i } });
  }
  const s = await setupWorkspace({
    recentVaults: view === 'empty' ? [] : recentVaults,
    surface: document.querySelector('#application-root'), art, settings: true, mobileMenu: true,
    ...scenePlugins(view, theme),
    preferences: new Map([['locale', 'ru'], ['theme', theme]]),
  });
  if (s.session.snapshot().phase !== 'running') throw new Error(JSON.stringify(s.session.snapshot().incidents));
  s.tools.localization.setLocale('ru');
  s.tools.themes.select(theme);
  await flush();
  const required = selector => {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Missing fixture element ' + selector);
    return element;
  };
  if (view === 'account-menu') {
    required('.ln-vault-action:last-child .ln-vault-toggle').click();
    await flush();
    required('.lm-account-identity').click();
    await flush();
    await new Promise(resolve => setTimeout(resolve, 250));
    const menu = required('.lm-dropdown [role=menuitem]').closest('.lm-dropdown').getBoundingClientRect();
    if (!menu.height || menu.top < 0 || menu.bottom > innerHeight) throw new Error('Account menu outside the viewport.');
  } else if (view === 'server') {
    required('.ln-vault-action:last-child .ln-vault-toggle').click();
    await flush();
    const list = required('.ln-vault-form .lm-account-access[data-embedded] .lm-account-list');
    const create = required('.lm-account-toolbar [aria-expanded]');
    create.click();
    await flush();
    await new Promise(resolve => setTimeout(resolve, 250));
    const form = document.getElementById(create.getAttribute('aria-controls'));
    const panel = required('.ln-vault');
    panel.scrollTop = panel.scrollHeight;
    const region = panel.getBoundingClientRect();
    const trash = required('.lm-account-toolbar > button:last-child').getBoundingClientRect();
    const bounds = form.getBoundingClientRect();
    const parent = form.closest('.ln-vault-disclosure').getBoundingClientRect();
    if (!list.childElementCount || create.getAttribute('aria-expanded') !== 'true' || bounds.height <= 0
      || bounds.left < region.left || bounds.right > region.right || bounds.top < create.getBoundingClientRect().bottom - 1
      || bounds.bottom > trash.top + 1 || trash.bottom > parent.bottom + 1 || trash.bottom > region.bottom + 1) {
      throw new Error(`Embedded catalog form y=${bounds.top}..${bounds.bottom}, trash y=${trash.top}..${trash.bottom}, disclosure bottom=${parent.bottom}, available bottom=${region.bottom}.`);
    }
    panel.scrollTop = 0;
  } else if (['selector','create','history','empty'].includes(view)) {
    const panel = required('.ln-vault');
    const recent = required('.ln-vault-recents');
    const actions = required('.ln-vault-main');
    if (panel.scrollWidth > panel.clientWidth + 1) throw new Error('Vault home overflows horizontally.');
    if (view === 'history') {
      panel.scrollTop = panel.scrollHeight;
      if (recent.querySelector('li:last-child').getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom + 1) throw new Error('History end is unreachable.');
      panel.scrollTop = 0;
    }
    if (innerWidth < 500 && actions.getBoundingClientRect().bottom > recent.getBoundingClientRect().top + 1) throw new Error('Narrow home columns overlap.');
    if (view === 'create') required('.ln-vault-toggle').click();
  } else if (view === 'editor' || view === 'files') {
    await s.open();
    await documentScene(s, view === 'files');
  } else {
    await s.open();
    s.tools.sidebar.select('lunaris.settings.navigation');
    await flush();
    required('.lm-settings-category').click();
    await flush();
    if (view === 'package') {
      required('.lm-lime-toolbar button[data-accent]').click();
      await flush();
      await new Promise(resolve => setTimeout(resolve, 250));
      const dialog = required('.lm-lime-overlay [role=dialog]');
      const bounds = dialog.getBoundingClientRect();
      const header = required('.lm-lime-dialog-header').getBoundingClientRect();
      required('.lm-lime-tabs [role=tab][aria-selected=true]');
      dialog.scrollTop = dialog.scrollHeight;
      const footer = required('.lm-lime-dialog-footer').getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > innerHeight + 1 || bounds.left < 0 || bounds.right > innerWidth + 1
        || header.top < bounds.top - 1 || header.bottom > bounds.bottom + 1
        || footer.height <= 0 || footer.bottom > bounds.bottom + 1 || footer.top < bounds.top - 1) {
        throw new Error('The package dialog or its actions are unreachable in the short viewport.');
      }
      dialog.scrollTop = 0;
    }
    const fields = document.querySelectorAll('.lm-settings-items [role=combobox]');
    if (view.startsWith('buttons')) {
      const actions = [...document.querySelectorAll('.lm-lime-settings .lm-button')].filter(button => button.getBoundingClientRect().height);
      const accent = required('.lm-lime-toolbar [data-accent]');
      const normal = required('.lm-lime-package-header .lm-button');
      if (actions.length < 4 || actions.some(button => {
        const style = getComputedStyle(button);
        return button.disabled !== (view === 'buttons-disabled') || style.backgroundColor !== 'rgba(0, 0, 0, 0)'
          || style.backgroundImage !== 'none' || style.borderTopStyle !== 'solid' || Math.abs(button.getBoundingClientRect().height - 30) > 1;
      })) throw new Error('Unexpected package button surface or size: ' + actions.map(b => [b.textContent,b.disabled,b.offsetHeight,getComputedStyle(b).backgroundColor,getComputedStyle(b).borderTopStyle].join('/')).join(', '));
      if (view === 'buttons') {
        const primary = getComputedStyle(accent), secondary = getComputedStyle(normal);
        if (primary.borderColor === secondary.borderColor || primary.color === secondary.color || Number(primary.fontWeight) <= Number(secondary.fontWeight)) {
          throw new Error('Primary actions must have a distinct outline, label color and weight.');
        }
      }
    }
    if (!view.startsWith('buttons') && view !== 'package' && fields.length !== 2) throw new Error('Missing interface preferences.');
    if (view === 'menu') {
      fields[1].click();
      await flush();
      await document.fonts.ready;
      // Floating UI positions the portal and the combobox reveals the active
      // option after layout. Wait for both conditions in the actual viewport.
      const list = document.getElementById(fields[1].getAttribute('aria-controls'));
      const dropdown = list?.closest('.lm-setting-dropdown');
      if (!dropdown) throw new Error('The theme field did not open its popup.');
      const selected = dropdown.querySelector('[role=option][data-checked]');
      if (!selected) throw new Error('The active theme is missing from its menu.');
      let fits = false;
      for (let frame = 0; frame < 40 && !fits; frame++) {
        await new Promise(resolve => setTimeout(resolve, 16));
        const menu = dropdown.getBoundingClientRect();
        const row = selected.getBoundingClientRect();
        fits = menu.height > 0 && menu.width > 0 && menu.top >= -1 && menu.bottom <= innerHeight + 1
          && menu.left >= -1 && menu.right <= innerWidth + 1 && row.height > 0
          && row.top >= menu.top - 1 && row.bottom <= menu.bottom + 1;
      }
      if (!fits) {
        const { top, bottom } = dropdown.getBoundingClientRect();
        const row = selected.getBoundingClientRect();
        throw new Error(`Menu y=${top}..${bottom}, selected y=${row.top}..${row.bottom}, viewport height=${innerHeight}.`);
      }
    }
  }
  const workspace = document.querySelector('.lm-workspace-layout[data-panel]:not([data-compact])');
  if (workspace) {
    const main = workspace.querySelector('.lm-workspace-main');
    const panel = workspace.querySelector('.lm-workspace-panel');
    if (Math.abs(main.getBoundingClientRect().top - panel.getBoundingClientRect().top) > 1
      || getComputedStyle(main).borderStartStartRadius !== getComputedStyle(panel).borderStartStartRadius) {
      throw new Error('The desktop content and sidebar must share their top edge and corner radius.');
    }
  }
  document.documentElement.dataset.sample = 'ready';
}

try {
  await mkdir(output, { recursive: true });
  const source = `
    import { setupWorkspace, flush } from './tools/test/workspace-surface.mjs';
    import { createInterfaceSettings } from '@lunaris/interface-settings';
    import { definePlugin } from '@lunaris/sdk';
    import { AccountSession, AccountSessionChanged, AccountVaults } from '@lunaris/remote';
    import { FilesystemSources } from '@lunaris/filesystem';
    import { createAccountAccess } from '@lunaris/account-access';
    import { Lime, LimeChanged } from '@lunaris/lime';
    import limeSettings from '@lunaris/lime-settings';
    import sampleManifest from './examples/pong-notification/manifest.json';
    import { catalogs as filesText } from './plugins/UI/file-explorer/src/catalog.ts';
    import { russian as editorText } from './plugins/UI/text-editor/src/locales/ru.ts';
    import { russian as statusText } from './plugins/UI/status-bar/src/locales/ru.ts';
    import { countDocument } from './plugins/UI/text-editor/src/statistics.ts';
    import { mountEditor } from './plugins/UI/text-editor/src/codemirror.ts';
    import '@lunaris/application-host/shell.css';
    import '@lunaris/mantine-components/styles.css';
    import art from './resources/ascii_art.txt';
    ${documentScene.toString()}
    ${sampleProvider.toString()}
    ${scenePlugins.toString()}
    (${renderScene.toString()})(window.sample).catch(error => {
      document.documentElement.dataset.sample = String(error);
    });`;
  await build({
    stdin: { contents: source, resolveDir: root }, outfile: path.join(temp, 'sample.js'),
    bundle: true, platform: 'browser', format: 'iife', logLevel: 'silent', minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.txt': 'text' },
    external: ['jsdom', './browser.mjs'],
  });
  const titleBounds = [];
  for (const [view, slug, width, height] of scenes) {
    const name = `${view}-${slug}-${width}x${height}`;
    const page = path.join(temp, name + '.html');
    const state = JSON.stringify({ view, theme: 'lunaris.base-theme-engine.' + slug });
    await writeFile(page, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./sample.css"></head><body><div id="application-root"></div><script>window.sample=${state}</script><script src="./sample.js"></script></body></html>`);
    const png = path.join(output, name + '.png');
    const result = spawnSync(binary, [
      '--disable-background-networking', '--disable-gpu', '--disable-extensions',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=1500',
      `--window-size=${width},${height}`, `--screenshot=${png}`, '--dump-dom', pathToFileURL(page).href,
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000, windowsHide: true });
    const stateMarker = result.stdout?.match(/<html[^>]*data-sample="([^"]+)"/)?.[1];
    const bounds = result.stdout?.match(/<html[^>]*data-title-bounds="([^"]+)"/)?.[1];
    if (bounds) titleBounds.push(bounds);
    if (result.error || result.status !== 0 || stateMarker !== 'ready') {
      throw new Error(`${name}: ${result.error?.message ?? stateMarker ?? result.stderr?.slice(-400) ?? 'Renderer unavailable'}`);
    }
    const image = await readFile(png);
    if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) throw new Error('Unexpected image size for ' + name);
  }
  const menus = scenes.filter(([view]) => view === 'menu').length;
  console.log(`Rendered ${scenes.length} UI samples. Verified the embedded catalog, package dialog, and ${menus} menu viewports. Title client/scroll heights (${titleBounds.join(' / ')}). Output: ${output}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
