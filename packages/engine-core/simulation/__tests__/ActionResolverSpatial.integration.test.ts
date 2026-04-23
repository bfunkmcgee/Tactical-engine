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

test('spatial attack legality: target without position is rejected with explicit reason', () => {
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
  assert.equal(result.reason, 'MISSING_TARGET_POSITION');
});

test('spatial attack legality: source without position is rejected with explicit reason', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8 },
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
  assert.equal(result.reason, 'MISSING_SOURCE_POSITION');
});

test('spatial move legality: source without position is rejected deterministically', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8 },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 2, y: 0 }, spatialRef: { q: 2, r: 0 } },
  ]);

  const move: Action = {
    id: 'move:A:u-a:1:0',
    actorId: 'A',
    type: 'MOVE',
    payload: { unitId: 'u-a', to: { x: 1, y: 0 } },
  };

  const first = resolver.validateActionWithReason(state, move);
  const second = resolver.validateActionWithReason(state, move);
  assert.equal(first.isValid, false);
  assert.equal(second.isValid, false);
  assert.equal(first.reason, 'MISSING_SOURCE_POSITION');
  assert.equal(second.reason, 'MISSING_SOURCE_POSITION');
});

test('spatial move legality: destination occupied by ally is rejected before legal-action matching', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-ally', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 1, y: 0 }, spatialRef: { q: 1, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 3, y: 0 }, spatialRef: { q: 3, r: 0 } },
  ]);

  const move: Action = {
    id: 'move:A:u-a:1:0',
    actorId: 'A',
    type: 'MOVE',
    payload: { unitId: 'u-a', to: { x: 1, y: 0 } },
  };

  const result = resolver.validateActionWithReason(state, move);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'MOVE_DESTINATION_OCCUPIED');
});

test('spatial move legality: no-op move is rejected explicitly', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, position: { x: 3, y: 0 }, spatialRef: { q: 3, r: 0 } },
  ]);

  const move: Action = {
    id: 'move:A:u-a:0:0',
    actorId: 'A',
    type: 'MOVE',
    payload: { unitId: 'u-a', to: { x: 0, y: 0 } },
  };

  const result = resolver.validateActionWithReason(state, move);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'MOVE_DESTINATION_UNCHANGED');
});

test('spatial targeted ability legality: missing target position is rejected deterministically', () => {
  const state = createSpatialState([
    { id: 'u-a', ownerId: 'A', hp: 8, maxHp: 8, position: { x: 0, y: 0 }, spatialRef: { q: 0, r: 0 } },
    { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8 },
  ]);

  const targetedAbility: Action = {
    id: 'use-ability:A:u-a:basic-strike',
    actorId: 'A',
    type: 'USE_ABILITY',
    payload: { unitId: 'u-a', abilityId: 'basic-strike', targetId: 'u-b' },
  };

  const first = resolver.validateActionWithReason(state, targetedAbility);
  const second = resolver.validateActionWithReason(state, targetedAbility);
  assert.equal(first.isValid, false);
  assert.equal(second.isValid, false);
  assert.equal(first.reason, 'MISSING_TARGET_POSITION');
  assert.equal(second.reason, 'MISSING_TARGET_POSITION');
});
