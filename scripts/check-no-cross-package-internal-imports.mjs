import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
const APPS_ROOT = path.join(REPO_ROOT, 'apps');
const GAMES_ROOT = path.join(REPO_ROOT, 'games');
const DEFAULT_SOURCE_FILES = ['apps/**/*.ts', 'apps/**/*.tsx', 'games/**/*.ts', 'packages/**/*.ts', 'packages/**/*.tsx'];
const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.tmp-test-dist/**', '**/__tests__/**', 'packages/**/fixtures/**'];
const IMPORT_PATTERN = /from\s+['\"]([^'\"]+)['\"]/g;
const VIOLATIONS = [];

function parseArgs(argv) {
  const sourceFiles = [];
  const excludes = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--glob') {
      sourceFiles.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === '--exclude') {
      excludes.push(argv[index + 1]);
      index += 1;
    }
  }

  return {
    sourceFiles: sourceFiles.length > 0 ? sourceFiles : DEFAULT_SOURCE_FILES,
    excludes: excludes.length > 0 ? excludes : DEFAULT_EXCLUDES,
  };
}

function getScopedRoot(candidatePath, scopeRoot) {
  const absolutePath = path.resolve(candidatePath);
  const relativeToScope = path.relative(scopeRoot, absolutePath);
  if (relativeToScope.startsWith('..') || path.isAbsolute(relativeToScope)) {
    return null;
  }

  const [scopeName] = relativeToScope.split(path.sep);
  if (!scopeName) {
    return null;
  }

  return path.join(scopeRoot, scopeName);
}

function getPackageRoot(candidatePath) {
  return getScopedRoot(candidatePath, PACKAGES_ROOT);
}

function getAppRoot(candidatePath) {
  return getScopedRoot(candidatePath, APPS_ROOT);
}

function getGameRoot(candidatePath) {
  return getScopedRoot(candidatePath, GAMES_ROOT);
}

function resolveTargetPath(filePath, specifier) {
  return path.resolve(path.dirname(filePath), specifier);
}

const { sourceFiles, excludes } = parseArgs(process.argv.slice(2));

for (const pattern of sourceFiles) {
  for (const filePath of globSync(pattern, { cwd: REPO_ROOT, exclude: excludes })) {
    const absoluteFilePath = path.resolve(REPO_ROOT, filePath);
    const source = readFileSync(filePath, 'utf8');
    const sourcePackageRoot = getPackageRoot(absoluteFilePath);
    const sourceAppRoot = getAppRoot(absoluteFilePath);
    let match;
    while ((match = IMPORT_PATTERN.exec(source)) !== null) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        continue;
      }

      const targetPath = resolveTargetPath(absoluteFilePath, specifier);
      const targetPackageRoot = getPackageRoot(targetPath);
      if (targetPackageRoot && targetPackageRoot !== sourcePackageRoot) {
        VIOLATIONS.push(`${filePath}: ${specifier}`);
        continue;
      }

      const targetGameRoot = getGameRoot(targetPath);
      if (sourceAppRoot && targetGameRoot) {
        VIOLATIONS.push(`${filePath}: ${specifier}`);
      }
    }
  }
}

if (VIOLATIONS.length > 0) {
  console.error('Detected internal boundary violations via relative imports. Use package exports or aliases instead:');
  for (const violation of VIOLATIONS) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('No internal boundary violations found.');
