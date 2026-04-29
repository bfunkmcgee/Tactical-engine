import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInitialState, type Engine, type GameState } from 'engine-core';
import {
  ERROR_CATEGORIES,
  SCENARIO_RUNTIME_ERROR_CODES,
  ScenarioRuntimeFactoryError,
  UnknownScenarioRuntimeError,
  createScenarioRuntime,
  createScenarioRuntimeRegistry,
} from '../scenarioRuntime';

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

test('registry throws typed unknown scenario error with machine-readable fields', () => {
  const registry = createScenarioRuntimeRegistry({});
  const error = captureThrown(() => registry.create('missing-scenario'));

  if (!(error instanceof UnknownScenarioRuntimeError)) {
    throw error instanceof Error ? error : new Error('Unexpected error type');
  }
  assert.equal(error.code, SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID);
  assert.equal(error.category, ERROR_CATEGORIES.LEGALITY);
  assert.equal(error.scenarioId, 'missing-scenario');
  assert.equal(error.cause, undefined);
  assert.match(error.message, /Unknown scenario runtime: missing-scenario/u);
});

test('registry wraps factory failures with typed runtime error and preserves cause', () => {
  const rootCause = new TypeError('boom');
  const registry = createScenarioRuntimeRegistry({
    scenarioA: {
      metadata: { id: 'scenarioA', version: '1.0.0', name: 'Scenario A' },
      create: () => {
        throw rootCause;
      },
    },
  });
  const error = captureThrown(() => registry.create('scenarioA'));

  if (!(error instanceof ScenarioRuntimeFactoryError)) {
    throw error instanceof Error ? error : new Error('Unexpected error type');
  }
  assert.equal(error.code, SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE);
  assert.equal(error.category, ERROR_CATEGORIES.RUNTIME_INIT);
  assert.equal(error.scenarioId, 'scenarioA');
  assert.equal(error.cause, rootCause);
  assert.equal(error.metadata?.wrappedErrorType, 'object');
  assert.equal(error.metadata?.wrappedErrorSummary, 'boom');
  assert.match(error.message, /Scenario runtime factory failed: scenarioA/u);
});

test('registry create remains backward-compatible for successful factories', () => {
  const runtime = createScenarioRuntime({
    metadata: { id: 'ok', version: '1.0.0', name: 'OK' },
    mapId: 'map',
    players: ['alpha', 'beta'],
    units: [],
    engine: {
      advancePhase: (state: GameState) => state,
      getLegalActions: () => [],
      step: (state: GameState) => ({ state, events: [] }),
    } as unknown as Engine,
    createInitialState: () => createInitialState(['alpha', 'beta'], []),
  });
  const registry = createScenarioRuntimeRegistry({
    ok: {
      metadata: { id: 'ok', version: '1.0.0', name: 'OK' },
      create: () => runtime,
    },
  });

  assert.equal(registry.create('ok'), runtime);
  assert.deepEqual(registry.listScenarioIds(), ['ok']);
  assert.deepEqual(registry.listScenarios(), [{ id: 'ok', version: '1.0.0', name: 'OK' }]);
});

test('registry wraps non-Error throws without dropping context metadata', () => {
  const registry = createScenarioRuntimeRegistry({
    scenarioB: {
      metadata: { id: 'scenarioB', version: '1.0.0', name: 'Scenario B' },
      create: () => {
        throw { reason: 'raw object failure' };
      },
    },
  });
  const error = captureThrown(() => registry.create('scenarioB'));

  if (!(error instanceof ScenarioRuntimeFactoryError)) {
    throw error instanceof Error ? error : new Error('Unexpected error type');
  }
  assert.equal(error.code, SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE);
  assert.equal(error.metadata?.wrappedErrorType, 'object');
  assert.equal(error.metadata?.wrappedErrorSummary, '[Object]');
  assert.equal(error.scenarioId, 'scenarioB');
});


test('registry listing APIs use static metadata without invoking factories', () => {
  let invocationCount = 0;
  const registry = createScenarioRuntimeRegistry({
    alpha: {
      metadata: { id: 'alpha', version: '1.0.0', name: 'Alpha' },
      create: () => {
        invocationCount += 1;
        throw new Error('factory should not be called during listing');
      },
    },
  });

  assert.deepEqual(registry.listScenarios(), [{ id: 'alpha', version: '1.0.0', name: 'Alpha' }]);
  assert.deepEqual(registry.listScenarioIds(), ['alpha']);
  assert.equal(invocationCount, 0);
});
