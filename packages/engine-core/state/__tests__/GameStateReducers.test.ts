import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createInitialState,
  getActiveActorId,
  migrateLegacyStatusEffectIdsState,
  reduceEvents,
  reduceState,
  type GameEvent,
} from '../GameState';

test('reduceState ignores damage for unknown target', () => {
  const state = createInitialState(['A', 'B'], [{ id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10 }]);
  const next = reduceState(state, {
    kind: 'UNIT_DAMAGED',
    sourceId: 'A',
    targetId: 'missing',
    amount: 5,
    turn: 1,
    round: 1,
  });

  assert.equal(next, state);
});

test('reduceEvents applies order and clamps hp floor to 0', () => {
  const state = createInitialState(
    ['A', 'B'],
    [
      { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10 },
      { id: 'u-b', ownerId: 'B', hp: 3, maxHp: 3 },
    ],
  );

  const events: GameEvent[] = [
    {
      kind: 'ACTION_APPLIED',
      action: {
        id: 'attack:A:u-b',
        actorId: 'A',
        type: 'ATTACK',
        payload: { targetId: 'u-b', amount: 5 },
      },
      turn: 1,
      round: 1,
    },
    {
      kind: 'UNIT_DAMAGED',
      sourceId: 'A',
      targetId: 'u-b',
      amount: 5,
      turn: 1,
      round: 1,
    },
    {
      kind: 'TURN_STARTED',
      actorId: 'B',
      turn: 2,
      round: 1,
    },
  ];

  const next = reduceEvents(state, events);
  assert.equal(next.units['u-b']?.hp, 0);
  assert.deepEqual(next.pendingActions, []);
  assert.equal(getActiveActorId(next), 'B');
  assert.equal(next.turn, 2);
});

test('reduceState upserts statuses when same status is applied multiple times', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [{ effectId: 'burn', duration: 1, stacks: 1 }],
    },
  ]);

  const next = reduceState(state, {
    kind: 'STATUS_APPLIED',
    sourceUnitId: 'u-a',
    targetId: 'u-a',
    statusId: 'burn',
    duration: 4,
    turn: 1,
    round: 1,
  });

  assert.deepEqual(next.units['u-a']?.activeEffects, [{ effectId: 'burn', sourceUnitId: 'u-a', duration: 4, stacks: 2 }]);
});

test('reduceState refreshes status duration and keeps deterministic ordering', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [{ effectId: 'regen', duration: 2 }, { effectId: 'burn', duration: 1 }],
    },
  ]);

  const next = reduceState(state, {
    kind: 'STATUS_APPLIED',
    sourceUnitId: 'u-a',
    targetId: 'u-a',
    statusId: 'regen',
    duration: 6,
    turn: 1,
    round: 1,
  });

  assert.deepEqual(next.units['u-a']?.activeEffects, [
    { effectId: 'burn', duration: 1, stacks: 1 },
    { effectId: 'regen', sourceUnitId: 'u-a', duration: 6, stacks: 2 },
  ]);
});

test('reduceState keeps same effect from different sources and refreshes matching source', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [
        { effectId: 'burn', sourceUnitId: 'u-a', duration: 1, stacks: 1 },
        { effectId: 'burn', sourceUnitId: 'u-b', duration: 3, stacks: 1 },
        { effectId: 'poison', duration: 2, stacks: 1 },
      ],
    },
  ]);

  const next = reduceState(state, {
    kind: 'STATUS_APPLIED',
    sourceUnitId: 'u-a',
    targetId: 'u-a',
    statusId: 'burn',
    duration: 5,
    turn: 1,
    round: 1,
  });

  assert.deepEqual(next.units['u-a']?.activeEffects, [
    { effectId: 'burn', sourceUnitId: 'u-a', duration: 5, stacks: 2 },
    { effectId: 'burn', sourceUnitId: 'u-b', duration: 3, stacks: 1 },
    { effectId: 'poison', duration: 2, stacks: 1 },
  ]);
});

test('reduceState ticks status duration without increasing stacks', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [{ effectId: 'burn', sourceUnitId: 'u-b', duration: 3, stacks: 2 }],
    },
  ]);

  const next = reduceState(state, {
    kind: 'STATUS_TICKED',
    sourceUnitId: 'u-b',
    targetId: 'u-a',
    statusId: 'burn',
    duration: 2,
    turn: 2,
    round: 1,
  });

  assert.deepEqual(next.units['u-a']?.activeEffects, [{ effectId: 'burn', sourceUnitId: 'u-b', duration: 2, stacks: 2 }]);
});

test('reduceState removes expired status effect', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [
        { effectId: 'burn', sourceUnitId: 'u-b', duration: 1, stacks: 2 },
        { effectId: 'regen', duration: 2, stacks: 1 },
      ],
    },
  ]);

  const next = reduceState(state, {
    kind: 'STATUS_REMOVED',
    sourceUnitId: 'u-b',
    targetId: 'u-a',
    statusId: 'burn',
    turn: 2,
    round: 1,
  });

  assert.deepEqual(next.units['u-a']?.activeEffects, [{ effectId: 'regen', duration: 2, stacks: 1 }]);
});

test('reduceEvents applies status decay lifecycle across multiple turns', () => {
  const state = createInitialState(['A', 'B'], [
    {
      id: 'u-a',
      ownerId: 'A',
      hp: 10,
      maxHp: 10,
      activeEffects: [{ effectId: 'burn', duration: 2, stacks: 1 }],
    },
  ]);

  const next = reduceEvents(state, [
    {
      kind: 'STATUS_TICKED',
      targetId: 'u-a',
      statusId: 'burn',
      duration: 1,
      turn: 1,
      round: 1,
    },
    {
      kind: 'STATUS_REMOVED',
      targetId: 'u-a',
      statusId: 'burn',
      turn: 2,
      round: 1,
    },
  ]);

  assert.deepEqual(next.units['u-a']?.activeEffects, []);
});

test('migrateLegacyStatusEffectIdsState converts string status entries into active effects', () => {
  const state = createInitialState(['A', 'B'], [{ id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10 }]) as ReturnType<
    typeof createInitialState
  > & {
    units: Record<string, { id: string; ownerId: string; hp: number; maxHp: number; statusEffectIds?: string[] }>;
  };
  state.units['u-a'] = {
    ...state.units['u-a'],
    statusEffectIds: ['burn:1', 'burn:3', 'poison:not-a-number'],
  };

  const next = migrateLegacyStatusEffectIdsState(state);
  assert.deepEqual(next.units['u-a']?.activeEffects, [
    { effectId: 'burn', duration: 3, stacks: 2 },
    { effectId: 'poison', duration: 0, stacks: 1 },
  ]);
});

test('reduceState sets hp to zero when UNIT_DEFEATED is received', () => {
  const state = createInitialState(['A', 'B'], [
    { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10 },
    { id: 'u-b', ownerId: 'B', hp: 4, maxHp: 4 },
  ]);

  const next = reduceState(state, {
    kind: 'UNIT_DEFEATED',
    sourceId: 'A',
    sourceUnitId: 'u-a',
    targetId: 'u-b',
    turn: 1,
    round: 1,
  });

  assert.equal(next.units['u-b']?.hp, 0);
});

test('reduceEvents accepts ACTION_REJECTED and preserves state fields', () => {
  const state = createInitialState(['A', 'B'], [{ id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10 }]);
  const next = reduceEvents(state, [
    {
      kind: 'ACTION_REJECTED',
      actorId: 'A',
      actionType: 'MOVE',
      reason: 'MOVE_BLOCKED',
      details: { blockedBy: 'u-a' },
      turn: 1,
      round: 1,
    },
  ]);

  assert.equal(next, state);
});

test('createInitialState defensively clones nested unit fields from input units', () => {
  const unit = {
    id: 'u-a',
    ownerId: 'A',
    hp: 10,
    maxHp: 10,
    position: { x: 1, y: 2 },
    cooldowns: { dash: 2 },
    activeEffects: [{ effectId: 'burn', duration: 3, stacks: 1 }],
  };
  const state = createInitialState(['A', 'B'], [unit]);

  unit.position.x = 9;
  unit.cooldowns.dash = 0;
  unit.activeEffects[0].duration = 0;

  assert.deepEqual(state.units['u-a']?.position, { x: 1, y: 2 });
  assert.deepEqual(state.units['u-a']?.cooldowns, { dash: 2 });
  assert.deepEqual(state.units['u-a']?.activeEffects, [{ effectId: 'burn', duration: 3, stacks: 1 }]);
});
