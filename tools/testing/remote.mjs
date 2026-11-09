import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
export function testHost(grants = {}) {
  const host = createTestKernel({ initialGrants: grants });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  return host;
}
export function consumer(tokens, activate, permissions) {
  return definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: tokens.map(token => ({ kind: token.kind, id: token.id, range: `^${token.version}` })), permissions, optionalPermissions: [] }, activate });
}
