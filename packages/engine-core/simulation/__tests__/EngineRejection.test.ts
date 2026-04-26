import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Engine } from '../Engine';
import { createInitialState, type Action } from '../../state/GameState';

test('Engine.step emits exactly one stable rejection event per invalid command', () => {
  const state = {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, position: { x: 0, y: 0 } },
        { id: 'u-b', ownerId: 'B', hp: 10, maxHp: 10, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const engine = new Engine();
  const invalidAttack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: -1 },
  };

  const first = engine.step(state, invalidAttack);
  const second = engine.step(state, invalidAttack);

  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 1);
  assert.deepEqual(first.events[0], second.events[0]);
  assert.deepEqual(first.events[0], {
    kind: 'ACTION_REJECTED',
    actorId: 'A',
    actionType: 'ATTACK',
    reason: 'ATTACK_AMOUNT_INVALID',
    details: { amount: '-1' },
    turn: 1,
    round: 1,
  });
});
