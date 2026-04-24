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
  assert.ok(diagnostics.some((diagnostic: { field: string }) => diagnostic.field.includes('maps[0].tiles[2]')));
  assert.ok(diagnostics.some((diagnostic: { reason: string }) => diagnostic.reason.includes("missing tile 'unknown_tile'")));
  assert.ok(diagnostics.some((diagnostic: { reason: string }) => diagnostic.reason.includes('width*height entries')));
});
