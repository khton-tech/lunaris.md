import { LunarisError } from '@lunaris/sdk';

/** These contracts acquire ambient roots/accounts instead of using a captured root. */
const ambientContracts = new Set([
  'lunaris.filesystem-roots', 'lunaris.filesystem-roots-driver',
  'lunaris.filesystem-locations', 'lunaris.filesystem-locations-driver',
  'lunaris.directory-locations', 'lunaris.directory-locations-driver',
  'lunaris.application-directory', 'lunaris.application-directory-driver',
  'lunaris.vault-locations', 'lunaris.vault-creation', 'lunaris.vault-history',
  'lunaris.vault-history-changed', 'lunaris.prepare-vault',
]);
export function denyAuthority(): never { throw new LunarisError('PERMISSION_DENIED', 'This operation is outside the captured Vault.'); }
export function assertScopedToken(token: { readonly id: string; readonly providePermission?: string; readonly consumePermission?: string }): void {
  if (ambientContracts.has(token.id) || [token.providePermission, token.consumePermission].some(permission => permission &&
    (permission.endsWith('.native') || ['runtime.manage', 'filesystem.app-config', 'account.network', 'account.access', 'drafts.access', 'drafts.storage'].includes(permission)))) denyAuthority();
}

/** Keep the update journal and its backups outside guest filesystem authority. */
export function assertPackageStoragePath(path: unknown, pluginId: string, structural: boolean): void {
  if (typeof path !== 'string') return;
  const normalized = path.toLowerCase();
  const root = '.lunaris/plugins';
  const ownData = `${root}/data/${pluginId}`;
  if (normalized === ownData || normalized.startsWith(`${ownData}/`)) return;
  if (normalized === root || normalized.startsWith(`${root}/`) ||
      (structural && (normalized === '' || root.startsWith(`${normalized}/`)))) denyAuthority();
}
