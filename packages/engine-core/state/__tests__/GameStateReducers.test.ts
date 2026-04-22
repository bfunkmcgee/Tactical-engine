import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, getActiveActorId, reduceEvents, reduceState, type GameEvent } from '../GameState';

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
    { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, statusEffectIds: ['burn:1'] },
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

  assert.deepEqual(next.units['u-a']?.statusEffectIds, ['burn:4']);
});

test('reduceState refreshes status duration and keeps deterministic ordering', () => {
  const state = createInitialState(['A', 'B'], [
    { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, statusEffectIds: ['regen:2', 'burn:1'] },
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

  assert.deepEqual(next.units['u-a']?.statusEffectIds, ['burn:1', 'regen:6']);
});

test('reduceState removes duplicate status ids when applying status', () => {
  const state = createInitialState(['A', 'B'], [
    { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, statusEffectIds: ['burn:1', 'burn:3', 'poison:2'] },
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

  assert.deepEqual(next.units['u-a']?.statusEffectIds, ['burn:5', 'poison:2']);
});
