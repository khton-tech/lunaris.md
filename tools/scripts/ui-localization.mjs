import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Inspect literal catalogs without activating plugins or importing UI runtimes.
function source(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); }
function dictionary(node, file) {
  if (ts.isIdentifier(node)) {
    let result;
    const visit = current => {
      if (ts.isVariableDeclaration(current) && current.name.getText() === node.text && current.initializer) result = dictionary(current.initializer, file);
      if (ts.isImportDeclaration(current) && current.importClause?.namedBindings && ts.isNamedImports(current.importClause.namedBindings)) {
        for (const binding of current.importClause.namedBindings.elements) if (binding.name.text === node.text) {
          const imported = resolve(dirname(file), current.moduleSpecifier.text.replace(/\.js$/, '.ts'));
          result = dictionary(ts.factory.createIdentifier(binding.propertyName?.text ?? binding.name.text), imported);
        }
      }
      ts.forEachChild(current, visit);
    };
    visit(source(file)); return result;
  }
  if (ts.isCallExpression(node) && node.expression.getText().endsWith('.freeze')) return dictionary(node.arguments[0], file);
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  return Object.fromEntries(node.properties.map(item => {
    assert.ok(ts.isPropertyAssignment(item) && ts.isStringLiteral(item.initializer), `${file}: catalogs must contain plain strings`);
    return [item.name.text, item.initializer.text];
  }));
}
const placeholders = text => [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort();
let catalogs = 0; let messages = 0;
function check(en, ru, file) {
  assert.ok(ru, `${file}: missing Russian catalog`);
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort(), `${file}: translation key coverage`);
  for (const key of Object.keys(en)) {
    assert.ok(ru[key].trim(), `${file}:${key}: empty Russian message`);
    assert.deepEqual(placeholders(ru[key]), placeholders(en[key]), `${file}:${key}: interpolation parameters`);
    messages++;
  }
  catalogs++;
}
try {
  for (const plugin of readdirSync('plugins/UI')) for (const entry of readdirSync(`plugins/UI/${plugin}/src`).filter(entry => entry.endsWith('.ts'))) {
    const file = `plugins/UI/${plugin}/src/${entry}`;
    const visit = node => {
      if (ts.isObjectLiteralExpression(node)) {
        const en = node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText() === 'en');
        if (en) {
          const ru = node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText() === 'ru');
          check(dictionary(en.initializer, file), ru && dictionary(ru.initializer, file), file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source(file));
  }
  for (const host of ['application', 'tauri']) {
    const folder = `hosts/${host}/src/locales`;
    check(dictionary(ts.factory.createIdentifier('english'), `${folder}/en.ts`), dictionary(ts.factory.createIdentifier('russian'), `${folder}/ru.ts`), folder);
  }
  assert.ok(catalogs >= 17, 'Product and recovery catalogs must be discovered');
  console.log(`UI localization passed: ${catalogs} bilingual catalogs, ${messages} messages; keys and parameters match.`);
} catch (error) { console.error(`UI localization failed: ${error.message}`); process.exitCode = 1; }
