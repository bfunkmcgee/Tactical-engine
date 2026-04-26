import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_CATEGORIES, ERROR_CODES, RulesSdkError, wrapUnknownError } from '../errors';

test('wrapUnknownError keeps original details for non-Error thrown values', () => {
  const wrapped = wrapUnknownError({ reason: 'explode' }, {
    message: 'wrapped unknown',
    category: ERROR_CATEGORIES.INTEGRITY,
    code: ERROR_CODES.WRAPPED_UNKNOWN_ERROR,
    metadata: {
      scenarioId: 'scenario-1',
    },
  });

  assert.equal(wrapped.code, ERROR_CODES.WRAPPED_UNKNOWN_ERROR);
  assert.equal(wrapped.category, ERROR_CATEGORIES.INTEGRITY);
  assert.equal(wrapped.metadata?.scenarioId, 'scenario-1');
  assert.equal(wrapped.metadata?.wrappedErrorType, 'object');
  assert.equal(wrapped.metadata?.wrappedErrorSummary, '[Object]');
  assert.ok('cause' in wrapped);
});

test('wrapUnknownError preserves nested sdk metadata when wrapping standard errors', () => {
  const source = new RulesSdkError('example init failed', {
    category: ERROR_CATEGORIES.RUNTIME_INIT,
    code: ERROR_CODES.EXAMPLE_SCENARIO_INIT_FAILED,
    metadata: {
      issueCount: 2,
    },
  });

  const caught = wrapUnknownError(source, {
    message: 'factory failed',
    category: ERROR_CATEGORIES.RUNTIME_INIT,
    code: ERROR_CODES.SCENARIO_RUNTIME_FACTORY_FAILURE,
  });

  assert.equal(caught, source);
  assert.equal(caught.code, ERROR_CODES.EXAMPLE_SCENARIO_INIT_FAILED);
  assert.deepEqual(caught.metadata, { issueCount: 2 });
});
