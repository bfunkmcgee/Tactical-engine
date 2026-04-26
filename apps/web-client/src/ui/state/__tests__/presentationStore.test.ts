import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { createInitialState, type Engine, type GameState } from 'engine-core';
import {
  DEFAULT_SCENARIO_ID,
  createPresentationStoreScenarioAdapter,
} from '../presentationStore';
import {
  createScenarioRuntime,
  createScenarioRuntimeRegistry,
  SCENARIO_RUNTIME_ERROR_CODES,
  type ScenarioRuntime,
} from 'rules-sdk';

test('adapter resolves default scenario runtime from package registry', () => {
  const adapter = createPresentationStoreScenarioAdapter();

  assert.ok(adapter.scenarioRuntime);
  if (!adapter.scenarioRuntime) {
    throw new Error('Expected scenario runtime to be initialized');
  }
  assert.equal(adapter.scenarioRuntime.metadata.id, DEFAULT_SCENARIO_ID);
  assert.ok(adapter.scenarioRuntime.players.length > 0);
});

test('adapter creates scenario runtime by scenario id via registry abstraction', () => {
  const fakeRuntime = createScenarioRuntime({
    metadata: {
      id: 'custom-scenario',
      name: 'Custom Scenario',
    },
    mapId: 'test-map',
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
    'custom-scenario': (): ScenarioRuntime => fakeRuntime,
  });

  const adapter = createPresentationStoreScenarioAdapter({
    scenarioId: 'custom-scenario',
    registry,
  });

  assert.ok(adapter.scenarioRuntime);
  if (!adapter.scenarioRuntime) {
    throw new Error('Expected scenario runtime to be initialized');
  }
  assert.equal(adapter.scenarioRuntime.metadata.name, 'Custom Scenario');
  assert.equal(adapter.scenarioRuntime.mapId, 'test-map');
});


test('adapter surfaces machine-readable code and scenarioId for unknown scenario ids', () => {
  const registry = createScenarioRuntimeRegistry({});

  const adapter = createPresentationStoreScenarioAdapter({
    scenarioId: 'missing-scenario',
    registry,
  });

  assert.equal(adapter.scenarioRuntime, undefined);
  assert.equal(
    adapter.initializationError?.message,
    "Unable to initialize scenario 'missing-scenario'. Unknown scenario runtime: missing-scenario",
  );
  assert.equal(adapter.initializationError?.code, SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID);
  assert.equal(adapter.initializationError?.scenarioId, 'missing-scenario');
  assert.equal(adapter.initializationError?.cause, undefined);
});

test('adapter surfaces scenario initialization diagnostics from runtime factory errors', () => {
  const registry = createScenarioRuntimeRegistry({
    [DEFAULT_SCENARIO_ID]: () => {
      const error = new Error('bad scenario');
      (error as Error & { diagnostics?: unknown }).diagnostics = [
        {
          source: 'games/example-skirmish/content/units.json',
          field: 'units[0].abilityIds[1]',
          reason: "references missing ability 'missing_ability' for unit 'alliance_infantry'",
        },
      ];
      throw error;
    },
  });

  const adapter = createPresentationStoreScenarioAdapter({
    scenarioId: DEFAULT_SCENARIO_ID,
    registry,
  });

  assert.equal(adapter.scenarioRuntime, undefined);
  assert.equal(
    adapter.initializationError?.message,
    `Unable to initialize scenario '${DEFAULT_SCENARIO_ID}'. bad scenario`,
  );
  assert.equal(adapter.initializationError?.diagnostics?.[0]?.source, 'games/example-skirmish/content/units.json');
  assert.match(adapter.initializationError?.diagnostics?.[0]?.reason ?? '', /missing_ability/u);
  assert.equal(adapter.initializationError?.code, SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE);
  assert.equal(adapter.initializationError?.scenarioId, DEFAULT_SCENARIO_ID);
  assert.equal(adapter.initializationError?.cause, 'bad scenario');
  assert.equal(adapter.initializationError?.errorName, 'ScenarioRuntimeFactoryError');
  assert.match(adapter.initializationError?.stackSnippet ?? '', /ScenarioRuntimeFactoryError: Scenario runtime factory failed/u);
});

test('adapter preserves non-diagnostic error details from runtime factory errors', () => {
  const registry = createScenarioRuntimeRegistry({
    [DEFAULT_SCENARIO_ID]: () => {
      throw new TypeError('runtime exploded');
    },
  });

  const adapter = createPresentationStoreScenarioAdapter({
    scenarioId: DEFAULT_SCENARIO_ID,
    registry,
  });

  assert.equal(adapter.scenarioRuntime, undefined);
  assert.equal(
    adapter.initializationError?.message,
    `Unable to initialize scenario '${DEFAULT_SCENARIO_ID}'. runtime exploded`,
  );
  assert.equal(adapter.initializationError?.diagnostics, undefined);
  assert.equal(adapter.initializationError?.code, SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE);
  assert.equal(adapter.initializationError?.scenarioId, DEFAULT_SCENARIO_ID);
  assert.equal(adapter.initializationError?.cause, 'runtime exploded');
  assert.equal(adapter.initializationError?.errorName, 'ScenarioRuntimeFactoryError');
  assert.match(adapter.initializationError?.stackSnippet ?? '', /ScenarioRuntimeFactoryError: Scenario runtime factory failed/u);
});


test('adapter keeps backward-compatible messaging for non-Error throws', () => {
  const registry = createScenarioRuntimeRegistry({
    [DEFAULT_SCENARIO_ID]: () => {
      throw 'factory failed hard';
    },
  });

  const adapter = createPresentationStoreScenarioAdapter({
    scenarioId: DEFAULT_SCENARIO_ID,
    registry,
  });

  assert.equal(adapter.scenarioRuntime, undefined);
  assert.equal(
    adapter.initializationError?.message,
    `Unable to initialize scenario '${DEFAULT_SCENARIO_ID}'. Scenario runtime factory failed: ${DEFAULT_SCENARIO_ID}`,
  );
  assert.equal(adapter.initializationError?.code, SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE);
  assert.equal(adapter.initializationError?.scenarioId, DEFAULT_SCENARIO_ID);
  assert.equal(adapter.initializationError?.cause, 'factory failed hard');
});
