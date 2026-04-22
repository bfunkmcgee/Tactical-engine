import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActionResolver } from '../ActionResolver';
import { createInitialState, type Action, type GameState, type UnitState } from '../../state/GameState';

function createState(partial?: Partial<GameState>): GameState {
  const units: UnitState[] = [
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8 },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8 },
  ];

  return {
    ...createInitialState(['A', 'B'], units),
    phase: 'COMMAND',
    activeActorId: 'A',
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
  assert.equal(result.events.length, 0);
  assert.equal(result.state, state);
});

test('ActionResolver emits attack events for valid actions', () => {
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
