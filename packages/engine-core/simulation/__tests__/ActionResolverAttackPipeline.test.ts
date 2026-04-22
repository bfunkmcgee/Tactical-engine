import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActionResolver } from '../ActionResolver';
import { createInitialState, type GameState, type UnitState } from '../../state/GameState';

function createState(units?: UnitState[]): GameState {
  return {
    ...createInitialState(
      ['A', 'B'],
      units ?? [
        { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, actionPoints: 3, maxActionPoints: 3, position: { x: 1, y: 1 } },
        { id: 'u-b', ownerId: 'B', hp: 5, maxHp: 5, position: { x: 2, y: 1 } },
      ],
    ),
    phase: 'COMMAND',
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };
}

const resolver = new ActionResolver();

test('ATTACK pipeline emits damage and action point payment events', () => {
  const state = createState();
  const attack = resolver.getLegalActions(state, 'A').find((action) => action.type === 'ATTACK');
  assert.ok(attack);
  if (!attack) {
    return;
  }

  const result = resolver.applyAction(state, attack);
  assert.deepEqual(result.events.map((event) => event.kind), ['ACTION_APPLIED', 'ACTION_POINTS_CHANGED', 'UNIT_DAMAGED']);

  const apEvent = result.events.find((event) => event.kind === 'ACTION_POINTS_CHANGED');
  assert.ok(apEvent);
  if (apEvent?.kind === 'ACTION_POINTS_CHANGED') {
    assert.equal(apEvent.from, 3);
    assert.equal(apEvent.to, 2);
    assert.equal(apEvent.reason, 'ATTACK');
  }

  assert.equal(result.state.units['u-b']?.hp, 4);
});

test('ATTACK pipeline emits UNIT_DEFEATED when damage reduces hp to zero', () => {
  const state = createState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, actionPoints: 2, maxActionPoints: 3, position: { x: 1, y: 1 } },
    { id: 'u-b', ownerId: 'B', hp: 1, maxHp: 5, position: { x: 2, y: 1 } },
  ]);

  const attack = resolver.getLegalActions(state, 'A').find((action) => action.type === 'ATTACK');
  assert.ok(attack);
  if (!attack) {
    return;
  }

  const result = resolver.applyAction(state, attack);
  assert.deepEqual(result.events.map((event) => event.kind), [
    'ACTION_APPLIED',
    'ACTION_POINTS_CHANGED',
    'UNIT_DAMAGED',
    'UNIT_DEFEATED',
  ]);
  assert.equal(result.state.units['u-b']?.hp, 0);
});
