import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { resolveAppearance } from '../../../src/appearance/resolveAppearance';
import { AppearanceRegistry, BodyTypeDef } from '../../../src/appearance/types';

function makeBodyType(overrides: Partial<BodyTypeDef> = {}): BodyTypeDef {
  return {
    id: 'human-body',
    name: 'Human',
    tags: ['human'],
    rigProfileId: 'humanoid-rig',
    defaultVisualLayers: [{ assetId: 'base', zIndex: 0 }],
    defaultSlotBindings: [],
    ...overrides,
  };
}

function makeRegistry(overrides: Partial<AppearanceRegistry> = {}): AppearanceRegistry {
  return {
    bodyTypes: {
      'human-body': makeBodyType(),
    },
    rigProfiles: {
      'humanoid-rig': {
        id: 'humanoid-rig',
        name: 'Humanoid',
        skeletonKey: 'humanoid',
        requiredBones: ['root'],
        slotAnchors: { head: 'head_anchor' },
      },
      'beast-rig': {
        id: 'beast-rig',
        name: 'Beast',
        skeletonKey: 'beast',
        requiredBones: ['root'],
        slotAnchors: { head: 'head_anchor' },
      },
    },
    animationSets: {
      'humanoid-basic': {
        id: 'humanoid-basic',
        name: 'Humanoid Basic',
        rigProfileId: 'humanoid-rig',
        clips: {
          idle: { clipId: 'idle' },
          move: { clipId: 'move' },
          attack: { clipId: 'attack' },
          cast: { clipId: 'cast' },
          hit: { clipId: 'hit' },
          death: { clipId: 'death' },
        },
      },
      'beast-basic': {
        id: 'beast-basic',
        name: 'Beast Basic',
        rigProfileId: 'beast-rig',
        clips: {
          idle: { clipId: 'idle' },
          move: { clipId: 'move' },
          attack: { clipId: 'attack' },
          cast: { clipId: 'cast' },
          hit: { clipId: 'hit' },
          death: { clipId: 'death' },
        },
      },
    },
    gearVisuals: {},
    ...overrides,
  };
}

test('throws when body type references missing rig profile', () => {
  const registry = makeRegistry({
    bodyTypes: {
      'human-body': makeBodyType({ rigProfileId: 'missing-rig' }),
    },
  });

  assert.throws(
    () =>
      resolveAppearance(
        {
          actorId: 'actor-1',
          bodyTypeId: 'human-body',
          animationSetId: 'humanoid-basic',
          equippedItems: [],
        },
        registry,
      ),
    /references unknown rig profile 'missing-rig'/,
  );
});

test('throws when animation set rig does not match body rig', () => {
  const registry = makeRegistry();

  assert.throws(
    () =>
      resolveAppearance(
        {
          actorId: 'actor-1',
          bodyTypeId: 'human-body',
          animationSetId: 'beast-basic',
          equippedItems: [],
        },
        registry,
      ),
    /requires rig 'beast-rig', but body rig is 'humanoid-rig'/,
  );
});

test('resolves successfully when body and animation rigs match', () => {
  const registry = makeRegistry();

  const resolved = resolveAppearance(
    {
      actorId: 'actor-1',
      bodyTypeId: 'human-body',
      animationSetId: 'humanoid-basic',
      equippedItems: [],
    },
    registry,
  );

  assert.equal(resolved.rigProfileId, 'humanoid-rig');
  assert.equal(resolved.animationSetId, 'humanoid-basic');
  assert.deepEqual(resolved.warnings, []);
});
