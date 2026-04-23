import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const SOURCE_FILES = ['apps/**/*.ts', 'apps/**/*.tsx', 'games/**/*.ts', 'packages/**/*.ts', 'packages/**/*.tsx'];
const IMPORT_PATTERN = /from\s+['\"]([^'\"]+)['\"]/g;
const VIOLATIONS = [];

for (const pattern of SOURCE_FILES) {
  for (const filePath of globSync(pattern, { exclude: ['**/node_modules/**', '**/.tmp-test-dist/**', '**/__tests__/**'] })) {
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
