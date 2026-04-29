import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_FILES = ['apps/**/*.ts', 'apps/**/*.tsx', 'games/**/*.ts', 'packages/**/*.ts', 'packages/**/*.tsx'];
const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.tmp-test-dist/**', '**/__tests__/**', 'packages/**/fixtures/**'];
const IMPORT_PATTERN = /from\s+['\"]([^'\"]+)['\"]/g;
const VIOLATIONS = [];

for (const pattern of DEFAULT_SOURCE_FILES) {
  for (const filePath of globSync(pattern, { cwd: REPO_ROOT, exclude: DEFAULT_EXCLUDES })) {
    if (filePath.startsWith('packages/rules-sdk/')) {
      continue;
    }
    const source = readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8');
    let match;
    while ((match = IMPORT_PATTERN.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier.includes('rules-sdk/src/')) {
        VIOLATIONS.push(`${filePath}: ${specifier}`);
      }
    }
  }
}

if (VIOLATIONS.length > 0) {
  console.error('Detected imports from rules-sdk internal src paths. Use public package exports instead:');
  for (const violation of VIOLATIONS) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('No rules-sdk internal src import violations found.');
