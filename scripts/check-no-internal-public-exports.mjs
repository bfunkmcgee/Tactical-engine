import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_INDEX_FILES = [
  'packages/engine-core/index.ts',
  'packages/engine-spatial/index.ts',
  'packages/engine-entities/index.ts',
  'packages/rules-sdk/index.ts',
];

const EXPORT_PATTERN = /^export(?:\s+type)?\s+.+?\s+from\s+['\"]([^'\"]+)['\"];?$/gm;
const DISALLOWED_PATH_SEGMENTS = ['/src/', '/internal/', '__tests__', 'fixtures'];
const violations = [];

for (const relativePath of PACKAGE_INDEX_FILES) {
  const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  let match;
  while ((match = EXPORT_PATTERN.exec(source)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      continue;
    }

    const hasDisallowedSegment = DISALLOWED_PATH_SEGMENTS.some((segment) => specifier.includes(segment));
    if (hasDisallowedSegment) {
      violations.push(`${relativePath}: ${specifier}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Public package indexes must not re-export internal paths:');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('No internal path re-exports found in package public indexes.');
