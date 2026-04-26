import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActionResolver } from '../ActionResolver';
import { createInitialState, type Action, type GameState, type UnitState } from '../../state/GameState';

function createState(partial?: Partial<GameState>): GameState {
  const units: UnitState[] = [
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 1, y: 1 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 3, y: 1 } },
  ];

  return {
    ...createInitialState(['A', 'B'], units),
    phase: 'COMMAND',
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
    ...partial,
  };
}

const resolver = new ActionResolver();

test('ActionResolver rejects payload with extra keys', () => {
  const state = createState();
  const invalidAttack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1, rogue: true } as unknown as Action['payload'],
  };

  const result = resolver.validateActionWithReason(state, invalidAttack);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'PAYLOAD_KEYS_NOT_ALLOWED');
});

test('ActionResolver rejects attack against dead target', () => {
  const state = createState({
    units: {
      'u-a': { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8 },
      'u-b': { id: 'u-b', ownerId: 'B', hp: 0, maxHp: 8 },
    },
  });

  const invalidAttack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.validateActionWithReason(state, invalidAttack);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'ATTACK_NOT_LEGAL_IN_PHASE');
});

test('ActionResolver does not mutate state for invalid actions', () => {
  const state = createState();
  const invalidAction: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: -5 },
  };

  const result = resolver.applyAction(state, invalidAction);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.kind, 'ACTION_REJECTED');
  assert.equal(result.state.eventLog.at(-1)?.kind, 'ACTION_REJECTED');
  assert.ok(result.state !== state);
});

test('ActionResolver emits rejection reason/details for invalid actions', () => {
  const state = createState();
  const invalidAction: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: -5 },
  };

  const result = resolver.applyAction(state, invalidAction);
  assert.deepEqual(result.events[0], {
    kind: 'ACTION_REJECTED',
    actorId: 'A',
    actionType: 'ATTACK',
    reason: 'ATTACK_AMOUNT_INVALID',
    details: { amount: '-5' },
    turn: 1,
    round: 1,
  });
});

test('ActionResolver includes actor and action metadata in rejection events', () => {
  const state = createState();
  const invalidMove: Action = {
    id: 'move:A:u-a:occupied',
    actorId: 'A',
    type: 'MOVE',
    payload: { unitId: 'u-a', to: { x: 3, y: 1 } },
  };

  const result = resolver.applyAction(state, invalidMove);
  assert.deepEqual(result.events[0], {
    kind: 'ACTION_REJECTED',
    actorId: 'A',
    actionType: 'MOVE',
    reason: 'MOVE_DESTINATION_OCCUPIED',
    details: { actorId: 'A', unitId: 'u-a', x: 3, y: 1 },
    turn: 1,
    round: 1,
  });
});

test('ActionResolver emits exactly one stable rejection event per invalid command', () => {
  const state = createState();
  const invalidAction: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: -5 },
  };

  const first = resolver.applyAction(state, invalidAction);
  const second = resolver.applyAction(state, invalidAction);

  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 1);
  assert.deepEqual(first.events[0], second.events[0]);
  assert.deepEqual(first.events[0], {
    kind: 'ACTION_REJECTED',
    actorId: 'A',
    actionType: 'ATTACK',
    reason: 'ATTACK_AMOUNT_INVALID',
    details: { amount: '-5' },
    turn: 1,
    round: 1,
  });
});

test('ActionResolver emits canonical action event for valid actions', () => {
  const state = createState();
  const action: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.applyAction(state, action);
  assert.deepEqual(result.events.map((event) => event.kind), ['ACTION_APPLIED', 'UNIT_DAMAGED']);
  assert.equal(result.state.units['u-b']?.hp, 7);
  assert.equal(result.state.pendingActions.length, 1);
});

test('ActionResolver generates legal MOVE actions and emits UNIT_MOVED', () => {
  const state = createState();
  const moveAction = resolver.getLegalActions(state, 'A').find((action) => action.type === 'MOVE');
  assert.ok(moveAction);
  if (!moveAction) {
    return;
  }

  const result = resolver.applyAction(state, moveAction);
  assert.deepEqual(
    result.events.map((event) => event.kind),
    ['ACTION_APPLIED', 'UNIT_MOVED'],
  );
});

test('ActionResolver generates legal USE_ABILITY actions and emits ABILITY_USED', () => {
  const state = createState();
  const useAbilityAction = resolver.getLegalActions(state, 'A').find((action) => action.type === 'USE_ABILITY');
  assert.ok(useAbilityAction);
  if (!useAbilityAction) {
    return;
  }

  const result = resolver.applyAction(state, useAbilityAction);
  assert.deepEqual(
    result.events.map((event) => event.kind),
    ['ACTION_APPLIED', 'ABILITY_USED'],
  );
});

test('ActionResolver generates legal USE_ITEM actions and emits ITEM_USED', () => {
  const state = createState();
  const useItemAction = resolver.getLegalActions(state, 'A').find((action) => action.type === 'USE_ITEM');
  assert.ok(useItemAction);
  if (!useItemAction) {
    return;
  }

  const result = resolver.applyAction(state, useItemAction);
  assert.deepEqual(
    result.events.map((event) => event.kind),
    ['ACTION_APPLIED', 'ITEM_USED'],
  );
});

test('ActionResolver generates legal APPLY_STATUS actions and emits STATUS_APPLIED', () => {
  const state = createState();
  const applyStatusAction = resolver.getLegalActions(state, 'A').find((action) => action.type === 'APPLY_STATUS');
  assert.ok(applyStatusAction);
  if (!applyStatusAction) {
    return;
  }

  const result = resolver.applyAction(state, applyStatusAction);
  assert.deepEqual(
    result.events.map((event) => event.kind),
    ['ACTION_APPLIED', 'STATUS_APPLIED'],
  );
});

test('ActionResolver rejects APPLY_STATUS payload not present in legal actions', () => {
  const state = createState();
  const invalidApplyStatusAction: Action = {
    id: 'apply-status:A:u-a:u-b:marked',
    actorId: 'A',
    type: 'APPLY_STATUS',
    payload: { sourceUnitId: 'u-a', targetId: 'u-b', statusId: 'burning', duration: 1 },
  };

  const result = resolver.validateActionWithReason(state, invalidApplyStatusAction);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'APPLY_STATUS_NOT_FOUND_IN_LEGAL_ACTIONS');
});

test('ActionResolver rejects APPLY_STATUS payload with invalid duration', () => {
  const state = createState();
  const invalidApplyStatusAction: Action = {
    id: 'apply-status:A:u-a:u-b:marked',
    actorId: 'A',
    type: 'APPLY_STATUS',
    payload: { sourceUnitId: 'u-a', targetId: 'u-b', statusId: 'marked', duration: 0 },
  };

  const result = resolver.validateActionWithReason(state, invalidApplyStatusAction);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'APPLY_STATUS_PAYLOAD_INVALID');
});

test('ActionResolver preserves resource/effect ordering around ACTION_APPLIED', () => {
  const state = {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, actionPoints: 2, maxActionPoints: 2, position: { x: 0, y: 0 } },
        { id: 'u-b', ownerId: 'B', hp: 10, maxHp: 10, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const action: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.applyAction(state, action);
  assert.deepEqual(result.events.map((event) => event.kind), ['ACTION_APPLIED', 'ACTION_POINTS_CHANGED', 'UNIT_DAMAGED']);
});
