import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateAllowedKeys, toAttackCandidatePayload } from '../action-pipeline/payloadSchemaValidationStage';
import { matchesAttackLegalAction } from '../action-pipeline/legalActionMatchingStage';
import { hasSpatialPosition } from '../action-pipeline/spatialTargetChecksStage';
import { buildResourcePaymentEvents } from '../action-pipeline/resourcePaymentStage';
import { buildActionEmissionEvents } from '../action-pipeline/eventEmissionStage';
import { createInitialState, type Action } from '../../state/GameState';

test('payload stage validates allowed keys', () => {
  const result = validateAllowedKeys({ targetId: 'u-b', rogue: true }, ['targetId']);
  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'PAYLOAD_KEYS_NOT_ALLOWED');
});

test('legal-action stage matches normalized ATTACK', () => {
  const action: Action = { id: 'attack:A:u-b', actorId: 'A', type: 'ATTACK', payload: { targetId: 'u-b', amount: 1 } };
  const payload = toAttackCandidatePayload(action.payload);
  assert.ok(payload);
  assert.equal(matchesAttackLegalAction(action, [action], payload!), true);
});

test('spatial stage detects unit position', () => {
  assert.equal(hasSpatialPosition({ id: 'u-a', ownerId: 'A', hp: 5, maxHp: 5, position: { x: 0, y: 0 } }), true);
});

test('resource stage emits action point spend for ATTACK', () => {
  const events = buildResourcePaymentEvents({ action: { id: 'a', actorId: 'A', type: 'ATTACK', payload: { targetId: 'u-b', amount: 1 } }, actorUnit: { id: 'u-a', ownerId: 'A', hp: 5, maxHp: 5, actionPoints: 2 }, turn: 1, round: 1 });
  assert.equal(events[0]?.kind, 'ACTION_POINTS_CHANGED');
});

test('event assembly emits ACTION_APPLIED first', () => {
  const state = createInitialState(['A', 'B'], [{ id: 'u-a', ownerId: 'A', hp: 5, maxHp: 5, position: { x: 0, y: 0 } }]);
  const events = buildActionEmissionEvents(state, { id: 'pass:A:COMMAND', actorId: 'A', type: 'PASS', payload: { phase: 'COMMAND' } });
  assert.equal(events[0]?.kind, 'ACTION_APPLIED');
});
