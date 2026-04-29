import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, type Action, type GameState } from '../../state/GameState';
import { Engine, type SimulationStrategy, type TurnStartStrategy } from '../Engine';
import { ActionResolver } from '../ActionResolver';
import type { LegalActionGenerator } from '../LegalActionGenerator';

const baseState = (): GameState => ({
  ...createInitialState(
    ['A', 'B'],
    [
      { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, actionPoints: 2, maxActionPoints: 2, position: { x: 0, y: 0 } },
      { id: 'u-b', ownerId: 'B', hp: 10, maxHp: 10, actionPoints: 2, maxActionPoints: 2, position: { x: 1, y: 0 } },
    ],
  ),
  phase: 'COMMAND',
  activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
});

const endCommand: Action = {
  id: 'end-command:A',
  actorId: 'A',
  type: 'END_COMMAND',
  payload: { reason: 'manual' },
};

test('EngineOptions: partial dependency wiring uses provided movement and turn economy strategies', () => {
  const movementStrategy: SimulationStrategy = {
    collectEvents: (context) => [
      {
        kind: 'ACTION_POINTS_CHANGED',
        unitId: 'movement-marker',
        from: 0,
        to: 1,
        reason: 'EFFECT',
        turn: context.state.turn,
        round: context.state.round,
      },
    ],
  };

  const turnEconomyStrategy: TurnStartStrategy = {
    collectTurnStartEvents: (state) => [
      {
        kind: 'ACTION_POINTS_CHANGED',
        unitId: 'economy-marker',
        from: 0,
        to: 1,
        reason: 'TURN_START',
        turn: state.turn,
        round: state.round,
      },
    ],
  };

  const engine = new Engine({
    movementStrategy,
    turnEconomyStrategy,
  });

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const moveResult = engine.step(baseState(), attack);
  assert.equal(moveResult.events.some((event) => event.kind === 'ACTION_POINTS_CHANGED' && event.unitId === 'movement-marker'), true);

  const turnBoundaryResult = engine.step(moveResult.state, endCommand);
  assert.equal(turnBoundaryResult.events.some((event) => event.kind === 'ACTION_POINTS_CHANGED' && event.unitId === 'economy-marker'), true);
});

test('EngineOptions: legalActionGenerator is wired into default ActionResolver', () => {
  const legalActionGenerator: LegalActionGenerator = {
    getLegalActions: (state, actorId) => [
      {
        id: `custom-end:${actorId}`,
        actorId,
        type: 'END_COMMAND',
        payload: { reason: 'manual' },
      },
      {
        id: `custom-pass:${actorId}`,
        actorId,
        type: 'PASS',
        payload: { phase: state.phase },
      },
    ],
  };

  const engine = new Engine({ legalActionGenerator });
  const legalActions = engine.getLegalActions(baseState(), 'A');
  assert.deepEqual(
    legalActions.map((action) => action.id),
    ['custom-end:A', 'custom-pass:A'],
  );
});

test('EngineOptions: retention policy is enforced at Engine boundary', () => {
  const engine = new Engine({ maxEventLogLength: 2, emitEventLogCompactionMarker: true });
  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const first = engine.step(baseState(), attack);
  const second = engine.step(first.state, endCommand);

  assert.equal(second.state.eventLog.length, 2);
  assert.equal(second.state.eventLog[0]?.kind, 'EVENT_LOG_COMPACTED');
});

test('EngineOptions: Engine.step does not route through ActionResolver.applyAction', () => {
  class ThrowingApplyActionResolver extends ActionResolver {
    public override applyAction(): never {
      throw new Error('Engine.step should not call ActionResolver.applyAction');
    }
  }

  const engine = new Engine({ actionResolver: new ThrowingApplyActionResolver() });
  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const result = engine.step(baseState(), attack);
  assert.equal(result.events.some((event) => event.kind === 'ACTION_APPLIED'), true);
});
