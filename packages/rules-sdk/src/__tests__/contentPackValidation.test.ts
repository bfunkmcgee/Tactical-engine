import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import abilities from '../../../../games/example-skirmish/content/abilities.json';
import factions from '../../../../games/example-skirmish/content/factions.json';
import maps from '../../../../games/example-skirmish/content/maps.json';
import badMaps from '../../../../games/example-skirmish/content/malformed/maps.bad-tiles.json';
import badUnits from '../../../../games/example-skirmish/content/malformed/units.missing-ability.json';
import tiles from '../../../../games/example-skirmish/content/tiles.json';
import units from '../../../../games/example-skirmish/content/units.json';
import type { AbilityDefinition, ContentPack, FactionDefinition, MapDefinition, TileDefinition, UnitDefinition } from '../ContentPack';
import { ContentPackValidationError, validateContentPack } from '../contentPackValidation';

function createPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: 'validation-pack',
    version: '1.0.0',
    units: units as UnitDefinition[],
    abilities: abilities as AbilityDefinition[],
    tiles: tiles as TileDefinition[],
    maps: maps as MapDefinition[],
    factions: factions as FactionDefinition[],
    ...overrides,
  };
}

test('validateContentPack accepts well-formed content', () => {
  validateContentPack(createPack(), 'games/example-skirmish/content/*.json');
});

test('validateContentPack reports unknown ability ids from malformed unit content', () => {
  const error = assert.throws(
    () => {
      validateContentPack(
        createPack({ units: badUnits as UnitDefinition[] }),
        'games/example-skirmish/content/malformed/units.missing-ability.json',
      );
    },
    ContentPackValidationError,
  );

  assert.match(error.message, /units\[0\]\.abilityIds\[1\]/u);
  assert.match(error.message, /missing_ability/u);
  assert.match(error.message, /alliance_infantry/u);
});

test('validateContentPack reports malformed map tile references and dimensions', () => {
  const error = assert.throws(
    () => {
      validateContentPack(
        createPack({ maps: badMaps as MapDefinition[] }),
        'games/example-skirmish/content/malformed/maps.bad-tiles.json',
      );
    },
    ContentPackValidationError,
  );

  assert.match(error.message, /maps\[0\]\.tiles\[2\]/u);
  assert.match(error.message, /unknown_tile/u);
  assert.match(error.message, /width\*height/u);
});
