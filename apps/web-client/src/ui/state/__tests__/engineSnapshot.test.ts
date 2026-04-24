import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Engine, createInitialState, type Action, type GameState } from 'engine-core';
import { getDeterministicTeamColor, projectEngineSnapshot, resolveTeamColor } from '../engineSnapshot';

function createState(): GameState {
  return createInitialState(
    ['alliance', 'raiders'],
    [
      { id: 'u-alliance', ownerId: 'alliance', hp: 10, maxHp: 10, position: { x: 0, y: 0 } },
      { id: 'u-raider', ownerId: 'raiders', hp: 9, maxHp: 9, position: { x: 1, y: 0 } },
    ],
  );
}

test('resolveTeamColor prefers scenario-provided team color map', () => {
  const customColors = {
    alliance: '#111111',
    raiders: '#222222',
  };

  assert.equal(resolveTeamColor('alliance', customColors), '#111111');
  assert.equal(resolveTeamColor('raiders', customColors), '#222222');
});

test('resolveTeamColor falls back to deterministic team-id colors', () => {
  const allianceColor = getDeterministicTeamColor('alliance');
  const raidersColor = getDeterministicTeamColor('raiders');

  assert.match(allianceColor, /^#[0-9a-f]{6}$/i);
  assert.equal(getDeterministicTeamColor('alliance'), allianceColor);
  assert.equal(allianceColor === raidersColor, false);
});

test('projectEngineSnapshot applies mapped team colors and deterministic fallback', () => {
  const state = createState();
  const snapshot = projectEngineSnapshot({
    state,
    events: [],
    selection: undefined,
    tick: 7,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    teamColors: {
      alliance: '#445566',
    },
    getLegalActions: () => [],
  });

  const allianceEntity = snapshot.entities.find((entity) => entity.id === 'u-alliance');
  const raiderEntity = snapshot.entities.find((entity) => entity.id === 'u-raider');

  assert.equal(allianceEntity?.color, '#445566');
  assert.equal(raiderEntity?.color, getDeterministicTeamColor('raiders'));
});

test('projectEngineSnapshot exposes ACTION_REJECTED feedback details', () => {
  const state = createState();
  const snapshot = projectEngineSnapshot({
    state,
    events: [
      {
        kind: 'ACTION_REJECTED',
        actorId: 'alliance',
        actionType: 'MOVE',
        reason: 'MOVE_BLOCKED',
        details: { tile: '1,0', occupied: true },
        turn: 1,
        round: 1,
      },
    ],
    selection: undefined,
    tick: 8,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    getLegalActions: () => [],
  });

  assert.equal(
    snapshot.feedback[0],
    'Action rejected (MOVE) for alliance: MOVE_BLOCKED (tile: 1,0, occupied: true)',
  );
});

test('projectEngineSnapshot surfaces Engine.step rejection feedback for invalid actions', () => {
  const engine = new Engine();
  const initialState = {
    ...createInitialState(
      ['alliance', 'raiders'],
      [
        { id: 'u-alliance', ownerId: 'alliance', hp: 10, maxHp: 10, position: { x: 0, y: 0 } },
        { id: 'u-raider', ownerId: 'raiders', hp: 9, maxHp: 9, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:alliance', entityId: 'alliance', teamId: 'alliance' },
  };
  const invalidAction: Action = {
    id: 'attack:alliance:u-raider',
    actorId: 'alliance',
    type: 'ATTACK',
    payload: { targetId: 'u-raider', amount: -2 },
  };

  const result = engine.step(initialState, invalidAction);
  const snapshot = projectEngineSnapshot({
    state: result.state,
    events: result.events,
    selection: undefined,
    tick: 9,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    getLegalActions: engine.getLegalActions.bind(engine),
  });

  assert.equal(result.events[0]?.kind, 'ACTION_REJECTED');
  assert.equal(snapshot.feedback[0], 'Action rejected (ATTACK) for alliance: ATTACK_AMOUNT_INVALID (amount: -2)');
});
