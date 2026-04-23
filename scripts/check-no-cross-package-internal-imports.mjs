import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SOURCE_ROOTS = [
  { root: 'apps', extensions: new Set(['.ts', '.tsx']) },
  { root: 'games', extensions: new Set(['.ts']) },
  { root: 'packages', extensions: new Set(['.ts', '.tsx']) }
];
const IGNORED_DIR_NAMES = new Set(['node_modules', '.tmp-test-dist', '__tests__']);
const IMPORT_PATTERN = /from\s+['\"]([^'\"]+)['\"]/g;
const VIOLATIONS = [];

function collectSourceFiles(rootDir, extensions) {
  const files = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) {
          continue;
        }

        walk(path.join(currentDir, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name);
      if (extensions.has(extension)) {
        files.push(path.join(currentDir, entry.name));
      }
    }
  }

  walk(rootDir);
  return files;
}

for (const { root, extensions } of SOURCE_ROOTS) {
  for (const filePath of collectSourceFiles(root, extensions)) {
    const source = readFileSync(filePath, 'utf8');
    let match;
    while ((match = IMPORT_PATTERN.exec(source)) !== null) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        continue;
      }

      if (/^(\.\.\/)+packages\/[^/]+\//u.test(specifier)) {
        VIOLATIONS.push(`${filePath}: ${specifier}`);
      }
    }
  }
}

if (VIOLATIONS.length > 0) {
  console.error('Detected cross-package internal imports via relative paths. Use public package exports instead:');
  for (const violation of VIOLATIONS) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('No cross-package internal imports found.');
