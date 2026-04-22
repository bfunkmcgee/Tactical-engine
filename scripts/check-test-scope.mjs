import { readFileSync } from 'node:fs';

const tsconfig = JSON.parse(readFileSync(new URL('../tsconfig.tests.json', import.meta.url), 'utf8'));
const include = Array.isArray(tsconfig.include) ? tsconfig.include : [];

const requiredGlobs = [
  'apps/web-client/src/**/*.ts',
  'apps/web-client/src/**/*.tsx'
];

const missing = requiredGlobs.filter((glob) => !include.includes(glob));

if (missing.length > 0) {
  console.error('tsconfig.tests.json is missing required app source include globs:');
  for (const glob of missing) {
    console.error(`- ${glob}`);
  }
  process.exit(1);
}

console.log('Test scope guard passed: app source globs are included in tsconfig.tests.json');
