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
  type ScenarioRuntime,
} from 'rules-sdk';

test('adapter resolves default scenario runtime from package registry', () => {
  const adapter = createPresentationStoreScenarioAdapter();

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

  assert.equal(adapter.scenarioRuntime.metadata.name, 'Custom Scenario');
  assert.equal(adapter.scenarioRuntime.mapId, 'test-map');
});
