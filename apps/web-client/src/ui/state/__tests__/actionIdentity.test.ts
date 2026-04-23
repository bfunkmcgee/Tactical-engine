import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import type { Action } from 'engine-core';
import { isSameAction } from '../actionIdentity';

test('matches by action.id even when payload object keys are in different order', () => {
  const first: Action = {
    id: 'move:u-1:1:2:1',
    actorId: 'u-1',
    type: 'MOVE',
    payload: {
      unitId: 'u-1',
      to: { x: 1, y: 2 },
      actionPointCost: 1,
    },
  };

  const second: Action = {
    id: 'move:u-1:1:2:1',
    actorId: 'u-1',
    type: 'MOVE',
    payload: {
      actionPointCost: 1,
      to: { y: 2, x: 1 },
      unitId: 'u-1',
    },
  };

  assert.equal(isSameAction(first, second), true);
});

test('falls back to typed payload comparison when ids differ but typed payload matches', () => {
  const candidate: Action = {
    id: 'legal:attack:1',
    actorId: 'u-1',
    type: 'ATTACK',
    payload: {
      sourceUnitId: 'u-1',
      targetId: 'u-2',
      amount: 2,
      abilityId: 'slash',
      actionPointCost: 1,
    },
  };

  const requested: Action = {
    id: 'requested:manual-1',
    actorId: 'u-1',
    type: 'ATTACK',
    payload: {
      actionPointCost: 1,
      abilityId: 'slash',
      amount: 2,
      targetId: 'u-2',
      sourceUnitId: 'u-1',
    },
  };

  assert.equal(isSameAction(candidate, requested), true);
});

test('rejects actions with same type/actor but different typed payload values', () => {
  const candidate: Action = {
    id: 'legal:move:1',
    actorId: 'u-1',
    type: 'MOVE',
    payload: {
      unitId: 'u-1',
      to: { x: 4, y: 6 },
      actionPointCost: 1,
    },
  };

  const requested: Action = {
    id: 'requested:move:other',
    actorId: 'u-1',
    type: 'MOVE',
    payload: {
      actionPointCost: 1,
      to: { y: 7, x: 4 },
      unitId: 'u-1',
    },
  };

  assert.equal(isSameAction(candidate, requested), false);
});
