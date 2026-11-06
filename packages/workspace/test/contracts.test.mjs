import test from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '@lunaris/workspace';

test('workspace exposes a portable versioned SDK API', () => {
  assert.equal(Workspace.id, 'lunaris.workspace');
  assert.equal(Workspace.kind, 'api');
  assert.equal(Workspace.version, '1.1.0');
});
