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
  ['selector', 'monochrome', 1120, 740],
  ['create', 'windows-xp', 1120, 740],
  ['create', 'everforest-dark', 390, 680],
  ['settings', 'monochrome', 1120, 740],
  ['menu', 'windows-xp', 1120, 740],
  ['menu', 'everforest-dark', 390, 680],
  ['menu', 'windows-xp-dark', 844, 390],
  ['editor', 'everforest-dark', 1120, 740],
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

// Runs only in a fresh file-backed rendering fixture. Set its initial state
// before painting; there is no remote debugging connection or native UI.
async function renderScene({ view, theme }) {
  const plugin = createInterfaceSettings({ defaultThemeId: theme });
  const s = await setupWorkspace({
    surface: document.querySelector('#application-root'), art, settings: true, mobileMenu: true,
    plugins: [plugin], entrypoints: [plugin.manifest.id], grants: { [plugin.manifest.id]: ['vault.access', 'config.access'] },
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
  if (view === 'selector' || view === 'create') {
    required('.ln-vault');
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
    const fields = document.querySelectorAll('.lm-settings-items [role=combobox]');
    if (fields.length !== 2) throw new Error('Missing interface preferences.');
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
  document.documentElement.dataset.sample = 'ready';
}

try {
  await mkdir(output, { recursive: true });
  const source = `
    import { setupWorkspace, flush } from './tools/test/workspace.mjs';
    import { createInterfaceSettings } from '@lunaris/interface-settings';
    import { catalogs as filesText } from './plugins/UI/file-explorer/src/catalog.ts';
    import { russian as editorText } from './plugins/UI/text-editor/src/locales/ru.ts';
    import { russian as statusText } from './plugins/UI/status-bar/src/locales/ru.ts';
    import { countDocument } from './plugins/UI/text-editor/src/statistics.ts';
    import { mountEditor } from './plugins/UI/text-editor/src/codemirror.ts';
    import '@lunaris/application-host/shell.css';
    import '@lunaris/mantine-components/styles.css';
    import art from './resources/ascii_art.txt';
    ${documentScene.toString()}
    (${renderScene.toString()})(window.sample).catch(error => {
      document.documentElement.dataset.sample = String(error);
    });`;
  await build({
    stdin: { contents: source, resolveDir: root }, outfile: path.join(temp, 'sample.js'),
    bundle: true, platform: 'browser', format: 'iife', logLevel: 'silent', minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.txt': 'text' },
    external: ['jsdom', './browser.mjs'],
  });
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
    if (result.error || result.status !== 0 || stateMarker !== 'ready') {
      throw new Error(`${name}: ${result.error?.message ?? stateMarker ?? result.stderr?.slice(-400) ?? 'Renderer unavailable'}`);
    }
    const image = await readFile(png);
    if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) throw new Error('Unexpected image size for ' + name);
  }
  const menus = scenes.filter(([view]) => view === 'menu').length;
  console.log(`Rendered ${scenes.length} UI samples. Verified viewport and selected-option bounds in ${menus} menus. Output: ${output}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
