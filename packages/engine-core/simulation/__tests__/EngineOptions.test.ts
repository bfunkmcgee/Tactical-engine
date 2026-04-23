import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, type Action, type GameState } from '../../state/GameState';
import { Engine, type SimulationStrategy, type TurnStartStrategy } from '../Engine';
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

  const move: Action = {
    id: 'move:A:u-a:1:0',
    actorId: 'A',
    type: 'MOVE',
    payload: { unitId: 'u-a', to: { x: 1, y: 0 } },
  };

  const moveResult = engine.step(baseState(), move);
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
