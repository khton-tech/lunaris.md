import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';

export const deferred = () => Promise.withResolvers();

export class ManualScheduler {
  tasks = new Map();
  nextId = 0;
  schedule = (delayMs, callback) => {
    const id = ++this.nextId;
    this.tasks.set(id, { callback, delayMs });
    return () => this.tasks.delete(id);
  };
  fire() {
    assert.equal(this.tasks.size, 1, 'exactly one deadline should be pending');
    const [id, task] = this.tasks.entries().next().value;
    this.tasks.delete(id);
    task.callback();
  }
}

export function host(options = {}) {
  const clock = new ManualScheduler();
  return { kernel: createKernel({ scheduler: clock, ...options }), clock };
}

export function plugin(id, activate = () => {}, additions = {}) {
  return definePlugin({ manifest: {
    manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0',
    entry: './dist/plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...additions,
  }, activate });
}

export function snapshot(kernel, id = 'example.plugin') {
  return kernel.inspect().plugins.find(entry => entry.manifest.id === id);
}
