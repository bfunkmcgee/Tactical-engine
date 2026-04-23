import { readFileSync } from 'node:fs';

const tsconfigPath = new URL('../tsconfig.tests.json', import.meta.url);
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
const include = Array.isArray(tsconfig.include) ? tsconfig.include : [];

const requiredGlobs = [
  'apps/web-client/src/**/*.ts',
  'apps/web-client/src/**/*.tsx',
  'packages/**/*.ts',
  'games/**/*.ts',
  'games/**/*.json'
];

const missing = requiredGlobs.filter((glob) => !include.includes(glob));

if (missing.length > 0) {
  console.error('tsconfig.tests.json is missing required include globs:');
  for (const glob of missing) {
    console.error(`- ${glob}`);
  }

  console.error('\nSuggested additions to tsconfig.tests.json -> include:');
  for (const glob of missing) {
    console.error(`  "${glob}",`);
  }

  process.exit(1);
}

console.log('Test scope guard passed: required TypeScript and JSON content globs are included in tsconfig.tests.json');
