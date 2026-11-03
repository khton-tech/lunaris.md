import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const dependencies = {
  manifest: [],
  sdk: ['manifest'],
  kernel: ['manifest', 'sdk'],
  test: ['sdk', 'kernel'],
  development: ['manifest', 'sdk', 'kernel'],
  cli: ['manifest', 'sdk', 'kernel', 'test', 'development'],
};

export const packagePath = scope => scope === "development" ? "hosts/development" : `packages/${scope}`;

export function checkSource(source, filename, scope) {
  const errors = [];
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const allowed = new Set(dependencies[scope].map(name => `@lunaris/${name}`));
  // The shared validator owns the reviewed, platform-neutral SemVer dependency.
  if (scope === 'manifest') allowed.add('semver');
  function specifier(node) {
    if (!ts.isStringLiteral(node)) {
      errors.push(`${filename}: nonliteral imports are forbidden in core packages`);
      return;
    }
    const value = node.text;
    if (value.startsWith('./') || value.startsWith('../')) {
      const root = path.resolve(packagePath(scope), 'src');
      const resolved = path.resolve(path.dirname(filename), value);
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        errors.push(`${filename}: relative import escapes source root: ${value}`);
      }
    } else if (!allowed.has(value) && !(['development', 'cli'].includes(scope) && value.startsWith('node:'))) {
      errors.push(`${filename}: forbidden dependency: ${value}`);
    }
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifier(node.moduleSpecifier);
    }
    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) specifier(node.argument.literal);
      else errors.push(`${filename}: nonliteral import type`);
    }
    if (ts.isImportEqualsDeclaration(node)) errors.push(`${filename}: import assignments are forbidden`);
    if (ts.isCallExpression(node) && (scope !== 'development' || node.expression.kind !== ts.SyntaxKind.ImportKeyword) && (
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
      if (!filename.endsWith('.ts')) {
        errors.push(`${filename}: core sources must be TypeScript`);
        continue;
      }
      errors.push(...checkSource(await readFile(filename, 'utf8'), filename, scope));
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
