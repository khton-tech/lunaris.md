import test from 'node:test';
import assert from 'node:assert/strict';
import { Sidebar, SidebarChanged } from '@lunaris/sidebar';
test('sidebar contracts are portable SDK API/event tokens', () => {
  assert.equal(Sidebar.id, 'lunaris.sidebar'); assert.equal(Sidebar.kind, 'api'); assert.equal(Sidebar.version, '1.0.0');
  assert.equal(SidebarChanged.id, 'lunaris.sidebar-changed'); assert.equal(SidebarChanged.kind, 'event');
});
