import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SOURCE_ROOTS = [
  { root: 'apps', extensions: new Set(['.ts', '.tsx']) },
  { root: 'games', extensions: new Set(['.ts']) },
  { root: 'packages', extensions: new Set(['.ts', '.tsx']) }
];
const IGNORED_DIR_NAMES = new Set(['node_modules', '.tmp-test-dist', '__tests__']);
const IMPORT_PATTERN = /from\s+['\"]([^'\"]+)['\"]/g;
const VIOLATIONS = [];

function shouldSkipDirectory(dirName) {
  return IGNORED_DIR_NAMES.has(dirName) || dirName.startsWith('.');
}

function collectSourceFiles(rootDir, extensions) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const directoriesToVisit = [rootDir];

  while (directoriesToVisit.length > 0) {
    const currentDir = directoriesToVisit.pop();

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }

        directoriesToVisit.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (extensions.has(path.extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

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
