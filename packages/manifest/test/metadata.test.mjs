import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '@lunaris/manifest';

const metadata = () => ({ name: 'Example', author: 'Author', description: 'A plugin', platforms: 'universal', languages: ['en', 'ru'], repository: 'https://github.com/example/plugin', translations: { ru: { name: 'Пример' } }, fields: [{ label: 'License', value: 'MIT' }] });
const manifest = data => ({ manifestVersion: 1, id: 'example.plugin', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...(data === undefined ? {} : { metadata: data }) });

test('legacy manifests remain valid; metadata is copied deeply without execution', () => {
  assert.equal(validateManifest(manifest()).ok, true);
  const input = metadata();
  const result = validateManifest(manifest(input));
  assert.equal(result.ok, true);
  input.fields[0].value = 'changed'; input.translations.ru.name = 'changed'; input.languages.push('fr');
  assert.equal(result.manifest.metadata.fields[0].value, 'MIT');
  assert.equal(result.manifest.metadata.translations.ru.name, 'Пример');
  assert.deepEqual(result.manifest.metadata.languages, ['en', 'ru']);
  assert.ok(Object.isFrozen(result.manifest.metadata.translations.ru));
  assert.equal(validateManifest(manifest({ ...metadata(), platforms: ['desktop', 'web'] })).ok, true);
});

test('invalid metadata produces field diagnostics and does not invoke accessors', () => {
  for (const override of [
    { name: '' }, { author: 'a\n' }, { description: 'x'.repeat(2001) },
    { platforms: [] }, { platforms: ['desktop', 'desktop'] }, { platforms: ['windows'] },
    { languages: [] }, { languages: ['en', 'EN'] }, { languages: ['not a tag'] },
    { repository: 'javascript:alert(1)' }, { repository: 'https://user:secret@example.com/repo' },
    { repository: 'https://example.com/repo#code' }, { translations: { fr: { name: 'Example' } } },
    { fields: [{ label: 'x', value: 'y', command: 'run' }] }, { extra: true },
  ]) {
    const result = validateManifest(manifest({ ...metadata(), ...override }));
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.ok(result.diagnostics.some(item => item.path.startsWith('$.metadata')));
  }
  let executed = false;
  const input = metadata(); Object.defineProperty(input, 'name', { enumerable: true, get() { executed = true; return 'unsafe'; } });
  assert.equal(validateManifest(manifest(input)).ok, false);
  assert.equal(executed, false);
});
