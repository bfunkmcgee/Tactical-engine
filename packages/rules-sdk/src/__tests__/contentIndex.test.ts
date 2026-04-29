import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import abilities from '../../../../games/example-skirmish/content/abilities.json';
import factions from '../../../../games/example-skirmish/content/factions.json';
import maps from '../../../../games/example-skirmish/content/maps.json';
import tiles from '../../../../games/example-skirmish/content/tiles.json';
import units from '../../../../games/example-skirmish/content/units.json';
import type { AbilityDefinition, ContentPack, FactionDefinition, MapDefinition, TileDefinition, UnitDefinition } from '../ContentPack';
import { createContentIndex } from '../contentIndex';
import { ERROR_CATEGORIES, ERROR_CODES, RulesSdkError } from '../errors';

function createPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: 'content-index-pack',
    version: '1.0.0',
    units: units as UnitDefinition[],
    abilities: abilities as AbilityDefinition[],
    tiles: tiles as TileDefinition[],
    maps: maps as MapDefinition[],
    factions: factions as FactionDefinition[],
    ...overrides,
  };
}

test('createContentIndex throws typed duplicate-id errors with stable code/category/metadata', () => {
  const duplicateUnit = units[0] as UnitDefinition;
  let error: unknown;
  try {
    createContentIndex(createPack({ units: [duplicateUnit, duplicateUnit] }));
  } catch (caught) {
    error = caught;
  }

  if (!(error instanceof RulesSdkError)) {
    throw error instanceof Error ? error : new Error('Expected RulesSdkError');
  }

  assert.equal(error.code, ERROR_CODES.CONTENT_INDEX_DUPLICATE_ID);
  assert.equal(error.category, ERROR_CATEGORIES.VALIDATION);
  assert.equal(error.metadata?.kind, 'unit');
  assert.equal(error.metadata?.id, duplicateUnit.id);
  assert.match(error.message, /Duplicate unit id detected in content pack/u);
});
