import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = process.cwd();
const CHECKER_PATH = path.join(REPO_ROOT, 'scripts/check-no-cross-package-internal-imports.mjs');

function runImportBoundaryCheck(glob: string): { success: boolean; output: string } {
  try {
    const output = execFileSync('node', [CHECKER_PATH, '--glob', glob], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (error) {
    const stdout = error instanceof Error && 'stdout' in error ? String(error.stdout ?? '') : '';
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '') : '';
    return { success: false, output: `${stdout}\n${stderr}` };
  }
}

test('check:imports rejects cross-package internal deep imports', () => {
  const result = runImportBoundaryCheck('scripts/fixtures/cross-package-imports/bad-imports.ts');
  assert.equal(result.success, false, 'expected checker to fail for cross-package deep import fixture');
  assert.match(result.output, /bad-imports\.ts/u);
});


test('check:imports rejects cross-package deep imports without explicit packages segment', () => {
  const result = runImportBoundaryCheck('packages/engine-core/simulation/fixtures/bad-import-no-packages-segment.ts');
  assert.equal(result.success, false, 'expected checker to fail for sibling-package deep relative import fixture');
  assert.match(result.output, /bad-import-no-packages-segment\.ts/u);
});

test('check:imports accepts package-level imports', () => {
  const result = runImportBoundaryCheck('scripts/fixtures/cross-package-imports/good-imports.ts');
  assert.equal(result.success, true, 'expected checker to pass for package-level import fixture');
});
