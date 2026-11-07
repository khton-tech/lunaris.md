import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const dependencies = {
  'interface-settings': ['sdk', 'logging', 'config', 'settings', 'localization', 'themes', 'vault'],
  settings: ['sdk'],
  'settings-provider': ['sdk', 'logging', 'settings'],
  'settings-plugin': ['sdk', 'logging', 'settings', 'sidebar', 'active-screen', 'components', 'localization', 'vault'],
  'active-screen': ['sdk'],
  'active-screen-provider': ['sdk', 'logging', 'active-screen', 'vault'],
  'active-screen-plugin': ['sdk', 'logging', 'active-screen', 'workspace', 'components', 'localization'],
  'active-document': ['sdk', 'filesystem'],
  'active-document-provider': ['sdk', 'logging', 'config', 'vault', 'filesystem', 'active-document'],
  'context-menu': ['sdk'],
  'context-menu-provider': ['sdk', 'logging', 'context-menu', 'components'],
  'file-explorer': ['active-document', 'sdk', 'logging', 'sidebar', 'filesystem', 'vault', 'localization', 'context-menu'],
  sidebar: ['sdk'],
  'sidebar-provider': ['sdk', 'logging', 'sidebar'],
  'sidebar-plugin': ['sdk', 'logging', 'sidebar', 'workspace', 'components', 'localization'],
  workspace: ['sdk'],
  'workspace-provider': ['sdk', 'logging', 'workspace'],
  'workspace-plugin': ['sdk', 'logging', 'localization', 'slots', 'slot-dom', 'components', 'startup', 'vault', 'workspace', 'config'],
  'base-theme-engine': ['sdk', 'logging', 'themes'],
  'theme-settings': ['sdk', 'logging', 'themes', 'config'],
  runner: ['sdk', 'logging', 'config', 'localization', 'slots', 'slot-dom', 'components', 'startup'],
  'vault-selector': ['sdk', 'logging', 'localization', 'slots', 'slot-dom', 'components', 'startup', 'vault', 'filesystem'],
  themes: ['sdk'],
  'theme-provider': ['sdk', 'logging', 'themes'],
  startup: ['sdk'],
  'startup-provider': ['sdk', 'logging', 'startup'],
  'mantine-components': ['settings', 'sdk', 'logging', 'components', 'themes', 'context-menu'],
  'components-kit': ['sdk', 'logging', 'components', 'themes'],
  components: ['sdk'],
  'component-provider': ['sdk', 'logging', 'components'],
  slots: ['sdk'],
  'slot-dom': ['sdk'],
  'slot-provider': ['sdk', 'logging', 'slots'],
  'web-slot-driver': ['sdk', 'logging', 'slots', 'slot-dom'],
  manifest: [],
  sdk: ['manifest'],
  logging: ['sdk'],
  localization: ['sdk'],
  'localization-manager': ['sdk', 'logging', 'localization'],
  logger: ['sdk', 'logging'],
  'dev-tools-logger': ['sdk', 'logging'],
  filesystem: ['sdk'],
  'filesystem-provider': ['sdk', 'filesystem', 'logging'],
  'tauri-filesystem': ['sdk', 'filesystem', 'logging'],
  vault: ['sdk', 'filesystem'],
  'vault-manager': ['sdk', 'filesystem', 'vault', 'logging'],
  'vault-history': ['sdk', 'logging', 'config', 'vault'],
  config: ['sdk', 'filesystem'],
  'config-manager': ['sdk', 'filesystem', 'vault', 'logging', 'config'],
  kernel: ['manifest', 'sdk'],
  test: ['sdk', 'kernel'],
  development: ['manifest', 'sdk', 'kernel'],
  cli: ['manifest', 'sdk', 'kernel', 'test', 'development'],
  tauri: ['interface-settings', 'settings-provider', 'settings-plugin', 'active-screen-provider', 'active-screen-plugin', 'active-document', 'active-document-provider', 'context-menu-provider', 'file-explorer', 'sidebar-plugin', 'sidebar-provider', 'workspace-provider', 'workspace-plugin', 'runner', 'vault-selector', 'theme-settings', 'mantine-components', 'startup', 'startup-provider', 'base-theme-engine', 'theme-provider', 'component-provider', 'slot-provider', 'web-slot-driver', 'sdk', 'kernel', 'logger', 'dev-tools-logger', 'filesystem-provider', 'tauri-filesystem', 'vault-manager', 'vault-history', 'config-manager', 'localization-manager'],
};

export const packagePath = scope => {
  if (scope === 'interface-settings') return 'plugins/UI/interface-settings';
  if (scope === 'settings-provider') return 'plugins/UI/settings-provider';
  if (scope === 'settings-plugin') return 'plugins/UI/settings';
  if (scope === 'active-screen-provider') return 'plugins/UI/active-screen-provider';
  if (scope === 'active-screen-plugin') return 'plugins/UI/active-screen';
  if (scope === 'active-document-provider') return 'plugins/systems/active-document';
  if (scope === 'context-menu-provider') return 'plugins/UI/context-menu';
  if (scope === 'file-explorer') return 'plugins/UI/file-explorer';
  if (scope === 'sidebar-plugin') return 'plugins/UI/sidebar';
  if (scope === 'sidebar-provider') return 'plugins/UI/sidebar-tabs';
  if (scope === 'workspace-provider') return 'plugins/UI/workspace-content';
  if (scope === 'workspace-plugin') return 'plugins/UI/workspace';
  if (scope === 'startup-provider') return 'plugins/systems/startup';
  if (scope === 'base-theme-engine') return 'plugins/UI/base-theme';
  if (scope === 'theme-settings') return 'plugins/UI/theme-settings';
  if (scope === 'runner') return 'plugins/UI/lunaris-runner';
  if (scope === 'vault-selector') return 'plugins/UI/vault-selector';
  if (scope === 'theme-provider') return 'plugins/UI/themes';
  if (scope === 'mantine-components') return 'plugins/UI/mantine-components';
  if (scope === 'components-kit') return 'plugins/UI/components-kit';
  if (scope === 'component-provider') return 'plugins/UI/components';
  if (scope === 'slot-provider') return 'plugins/UI/layout';
  if (scope === 'web-slot-driver') return 'plugins/systems/driver/web-slots';
  if (scope === 'localization-manager') return 'plugins/systems/localization';
  if (scope === 'logger') return 'plugins/systems/logger';
  if (scope === 'filesystem-provider') return 'plugins/systems/filesystem';
  if (scope === 'vault-manager') return 'plugins/systems/vault';
  if (scope === 'vault-history') return 'plugins/systems/vault-history';
  if (scope === 'config-manager') return 'plugins/systems/config';
  if (scope === 'tauri-filesystem') return 'plugins/systems/driver/tauri-filesystem';
  if (scope === 'dev-tools-logger') return 'plugins/systems/driver/dev-tools-logger';
  return ['development', 'tauri'].includes(scope) ? `hosts/${scope}` : `packages/${scope}`;
};

export function checkSource(source, filename, scope) {
  const errors = [];
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const allowed = new Set(dependencies[scope].map(name => `@lunaris/${name}`));
  if (scope === 'tauri-filesystem' && path.resolve(filename) === path.resolve('plugins/systems/driver/tauri-filesystem/src/native.ts')) allowed.add('@tauri-apps/api/core');
  if (scope === 'tauri' && path.resolve(filename) === path.resolve('hosts/tauri/src/desktop.ts')) {
    allowed.add('@tauri-apps/api/core');
    allowed.add('@tauri-apps/api/window');
  }
  // The shared validator owns the reviewed, platform-neutral SemVer dependency.
  if (scope === 'manifest') allowed.add('semver');
  if (scope === 'config-manager' && path.resolve(filename) === path.resolve('plugins/systems/config/src/codec.ts')) allowed.add('smol-toml');
  if (scope === 'components-kit' && path.resolve(filename) === path.resolve('plugins/UI/components-kit/src/controls.ts')) allowed.add('lucide');
  if (scope === 'mantine-components') {
    for (const name of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@mantine/core', 'lucide', 'react-arborist']) allowed.add(name);
  }
  if (scope === 'tauri' && path.resolve(filename) === path.resolve('hosts/tauri/src/application.ts')) allowed.add('@lunaris/mantine-components/styles.css');
  function specifier(node) {
    if (!ts.isStringLiteral(node)) {
      errors.push(`${filename}: nonliteral imports are forbidden in core packages`);
      return;
    }
    const value = node.text;
    if (['interface-settings', 'settings-provider', 'settings-plugin', 'active-screen-provider', 'active-screen-plugin', 'active-document-provider', 'context-menu-provider', 'file-explorer', 'sidebar-provider', 'sidebar-plugin', 'workspace-provider', 'workspace-plugin', 'runner', 'vault-selector', 'theme-settings', 'components-kit', 'mantine-components', 'startup-provider', 'base-theme-engine', 'theme-provider', 'component-provider', 'slot-provider', 'web-slot-driver', 'logger', 'dev-tools-logger', 'filesystem-provider', 'tauri-filesystem', 'vault-manager', 'vault-history', 'config-manager', 'localization-manager'].includes(scope) &&
        path.resolve(filename) === path.resolve(packagePath(scope), 'src/index.ts') &&
        value === '../manifest.json') return;
    // The host owns startup artwork; plugins cannot reach outside their source roots.
    if (scope === 'tauri' && path.resolve(filename) === path.resolve('hosts/tauri/src/application.ts') &&
        value === '../../../resources/ascii_art.txt?raw') return;
    if (value.startsWith('./') || value.startsWith('../')) {
      const root = path.resolve(packagePath(scope), 'src');
      const resolved = path.resolve(path.dirname(filename), value);
      const relative = path.relative(root, resolved);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(`${filename}: relative import escapes source root: ${value}`);
      }
    } else if (!allowed.has(value) && !(['development', 'cli'].includes(scope) && value.startsWith('node:'))) {
      errors.push(`${filename}: forbidden dependency: ${value}`);
    }
  }
  function visit(node) {
    const applicationLoader = scope === 'tauri' && path.resolve(filename) === path.resolve('hosts/tauri/src/bootstrap.ts') &&
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === './application.js';
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifier(node.moduleSpecifier);
    }
    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) specifier(node.argument.literal);
      else errors.push(`${filename}: nonliteral import type`);
    }
    if (ts.isImportEqualsDeclaration(node)) errors.push(`${filename}: import assignments are forbidden`);
    if (!applicationLoader && ts.isCallExpression(node) && (scope !== 'development' || node.expression.kind !== ts.SyntaxKind.ImportKeyword) && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    )) errors.push(`${filename}: dynamic module loading is forbidden`);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return errors;
}

export async function checkBoundaries(scopes) {
  const errors = [];
  for (const scope of scopes) {
    const root = path.resolve(packagePath(scope), 'src');
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filename = path.join(entry.parentPath, entry.name);
      if (!filename.endsWith('.ts') && !(scope === 'mantine-components' && filename.endsWith('.tsx'))) {
        errors.push(`${filename}: core sources must be TypeScript`);
        continue;
      }
      errors.push(...checkSource(await readFile(filename, 'utf8'), filename, scope));
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
