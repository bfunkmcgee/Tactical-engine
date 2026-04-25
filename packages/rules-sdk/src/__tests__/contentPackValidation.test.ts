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

function captureValidationError(run: () => void): ContentPackValidationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentPackValidationError) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected validateContentPack to throw ContentPackValidationError');
}

test('validateContentPack accepts well-formed content', () => {
  validateContentPack(createPack(), 'games/example-skirmish/content/*.json');
});

test('validateContentPack reports unknown ability ids from malformed unit content', () => {
  const error = captureValidationError(() => {
    validateContentPack(
      createPack({ units: badUnits as UnitDefinition[] }),
      'games/example-skirmish/content/malformed/units.missing-ability.json',
    );
  });

  assert.match(error.message, /units\[0\]\.abilityIds\[1\]/u);
  assert.match(error.message, /missing_ability/u);
  assert.match(error.message, /alliance_infantry/u);
});

test('validateContentPack reports malformed map tile references and dimensions', () => {
  const error = captureValidationError(() => {
    validateContentPack(
      createPack({ maps: badMaps as MapDefinition[] }),
      'games/example-skirmish/content/malformed/maps.bad-tiles.json',
    );
  });

  assert.match(error.message, /maps\[0\]\.tiles\[2\]/u);
  assert.match(error.message, /unknown_tile/u);
  assert.match(error.message, /width\*height/u);
});

test('validateContentPack reports malformed ability cost and cooldown', () => {
  const malformedAbilities: AbilityDefinition[] = [
    {
      ...(abilities[0] as AbilityDefinition),
      cost: {
        actionPoints: -1,
        health: Number.NaN,
      },
      cooldownTurns: 1.5,
    },
  ];

  const error = captureValidationError(() => {
    validateContentPack(createPack({ abilities: malformedAbilities }), 'abilities.invalid-cost-and-cooldown.json');
  });

  assert.match(error.message, /abilities\[0\]\.cost\.actionPoints: must be a number >= 0/u);
  assert.match(error.message, /abilities\[0\]\.cost\.health: must be a number >= 0/u);
  assert.match(error.message, /abilities\[0\]\.cooldownTurns: must be an integer >= 0/u);
});

test('validateContentPack reports malformed statusApplications fields', () => {
  const malformedAbilities: AbilityDefinition[] = [
    {
      ...(abilities[0] as AbilityDefinition),
      statusApplications: [
        {
          statusId: '  ',
          chance: 1.2,
          durationTurns: 0,
          stacks: -2,
        },
      ],
    },
  ];

  const error = captureValidationError(() => {
    validateContentPack(createPack({ abilities: malformedAbilities }), 'abilities.invalid-status-applications.json');
  });

  assert.match(error.message, /abilities\[0\]\.statusApplications\[0\]\.statusId: must be a non-empty string/u);
  assert.match(error.message, /abilities\[0\]\.statusApplications\[0\]\.chance: must be a number <= 1/u);
  assert.match(error.message, /abilities\[0\]\.statusApplications\[0\]\.durationTurns: must be a number >= 1/u);
  assert.match(error.message, /abilities\[0\]\.statusApplications\[0\]\.stacks: must be a number >= 1/u);
});
