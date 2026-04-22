import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActionResolver } from '../ActionResolver';
import { createInitialState, type Action, type GameState, type UnitState } from '../../state/GameState';

function createSpatialState(units: UnitState[]): GameState {
  return {
    ...createInitialState(['A', 'B'], units),
    phase: 'COMMAND',
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };
}

const resolver = new ActionResolver();

test('spatial attack legality: target in range and visible is valid', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 2, y: 0 }, spatialRef: { q: 2, r: 0 } },
  ]);

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.validateActionWithReason(state, attack);
  assert.equal(result.isValid, true);
});

test('spatial attack legality: target outside range is rejected', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 5, y: 0 }, spatialRef: { q: 5, r: 0 } },
  ]);

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.validateActionWithReason(state, attack);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'ATTACK_TARGET_OUT_OF_RANGE');
});

test('spatial attack legality: blocked line of sight is rejected', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-block', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 1, y: 0 }, spatialRef: { q: 1, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 2, y: 0 }, spatialRef: { q: 2, r: 0 } },
  ]);

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.validateActionWithReason(state, attack);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'ATTACK_TARGET_NO_LINE_OF_SIGHT');
});

test('spatial attack legality: target without occupied position is rejected', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8 },
  ]);

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = resolver.validateActionWithReason(state, attack);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'ATTACK_TARGET_OCCUPANCY_INVALID');
});
