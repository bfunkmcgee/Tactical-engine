import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import abilities from '../content/abilities.json';
import factions from '../content/factions.json';
import badMaps from '../content/malformed/maps.bad-tiles.json';
import badUnits from '../content/malformed/units.missing-ability.json';
import maps from '../content/maps.json';
import tiles from '../content/tiles.json';
import units from '../content/units.json';
import type { AbilityDefinition, ContentPack, FactionDefinition, MapDefinition, TileDefinition, UnitDefinition } from 'rules-sdk';
import { ERROR_CATEGORIES, ERROR_CODES } from 'rules-sdk';
import { createExampleScenarioRuntime, ExampleScenarioInitializationError } from './runtime';

function createPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: 'example-skirmish-pack',
    version: '1.1.0',
    units: units as UnitDefinition[],
    abilities: abilities as AbilityDefinition[],
    tiles: tiles as TileDefinition[],
    maps: maps as MapDefinition[],
    factions: factions as FactionDefinition[],
    ...overrides,
  };
}

test('createExampleScenarioRuntime returns diagnostics for malformed unit ability references', () => {
  let error: ExampleScenarioInitializationError | undefined;
  try {
    createExampleScenarioRuntime({
      contentPack: createPack({ units: badUnits as UnitDefinition[] }),
    });
  } catch (caught) {
    if (caught instanceof ExampleScenarioInitializationError) {
      error = caught;
    } else {
      throw caught;
    }
  }

  assert.ok(error);
  if (!error) {
    throw new Error('Expected initialization error');
  }

  const diagnostics = error.diagnostics;
  assert.ok(diagnostics.length > 0);
  assert.equal(diagnostics[0].source, 'games/example-skirmish/content/units.json');
  assert.equal(diagnostics[0].category, ERROR_CATEGORIES.VALIDATION);
  assert.equal(diagnostics[0].code, ERROR_CODES.EXAMPLE_SCENARIO_INVALID);
  assert.ok(diagnostics.some((diagnostic: { field: string }) => diagnostic.field.includes('units[0].abilityIds[1]')));
  assert.ok(
    diagnostics.some((diagnostic: { reason: string }) => diagnostic.reason.includes("missing ability 'missing_ability'")),
  );
});

test('createExampleScenarioRuntime returns diagnostics for malformed map content', () => {
  let error: ExampleScenarioInitializationError | undefined;
  try {
    createExampleScenarioRuntime({
      contentPack: createPack({ maps: badMaps as MapDefinition[] }),
    });
  } catch (caught) {
    if (caught instanceof ExampleScenarioInitializationError) {
      error = caught;
    } else {
      throw caught;
    }
  }

  assert.ok(error);
  if (!error) {
    throw new Error('Expected initialization error');
  }

  const diagnostics = error.diagnostics;
  assert.ok(diagnostics.some((diagnostic: { source: string }) => diagnostic.source.endsWith('maps.json')));
  assert.ok(diagnostics.every((diagnostic) => diagnostic.code === ERROR_CODES.EXAMPLE_SCENARIO_INVALID));
  assert.ok(diagnostics.some((diagnostic: { field: string }) => diagnostic.field.includes('maps[0].tiles[2]')));
  assert.ok(diagnostics.some((diagnostic: { reason: string }) => diagnostic.reason.includes("missing tile 'unknown_tile'")));
  assert.ok(diagnostics.some((diagnostic: { reason: string }) => diagnostic.reason.includes('width*height entries')));
});

test('createExampleScenarioRuntime protects runtime players and units from external mutation', () => {
  const runtime = createExampleScenarioRuntime();
  const baseline = runtime.createInitialState();

  const mutablePlayers = runtime.players as string[];
  const mutableUnits = runtime.units as unknown as Array<{
    hp: number;
    position?: { x: number; y: number };
  }>;

  assert.throws(() => {
    mutablePlayers.push('hijacked-team');
  });
  assert.throws(() => {
    mutableUnits[0].hp = 1;
  });
  assert.throws(() => {
    if (mutableUnits[0].position) {
      mutableUnits[0].position.x = 99;
    }
  });

  const nextState = runtime.createInitialState();
  assert.deepEqual(nextState.players, baseline.players);
  assert.deepEqual(nextState.units, baseline.units);
});

test('createExampleScenarioRuntime isolates future initializations from mutations to returned state', () => {
  const runtime = createExampleScenarioRuntime();
  const baseline = runtime.createInitialState();
  const mutated = runtime.createInitialState() as unknown as {
    players: string[];
    units: Record<string, { hp: number; position?: { x: number; y: number } }>;
  };

  mutated.players.push('injected-team');
  mutated.units['alliance-1'].hp = 1;
  if (mutated.units['alliance-1'].position) {
    mutated.units['alliance-1'].position.x = 99;
  }

  const nextState = runtime.createInitialState();
  const started = runtime.engine.initialize(nextState).state;

  assert.deepEqual(nextState.players, baseline.players);
  assert.deepEqual(nextState.units, baseline.units);
  assert.deepEqual(started.players, baseline.players);
  assert.deepEqual(started.units, baseline.units);
});
