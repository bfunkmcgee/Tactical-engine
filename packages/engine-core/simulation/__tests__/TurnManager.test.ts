import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TeamTurnScheduler, TurnManager, UnitTurnScheduler } from '../TurnManager';
import { createInitialState, getActiveActorId, type GameState } from '../../state/GameState';

function createState(partial?: Partial<GameState>): GameState {
  return {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 5, maxHp: 5 },
        { id: 'u-b', ownerId: 'B', hp: 5, maxHp: 5 },
      ],
    ),
    ...partial,
  };
}

const manager = new TurnManager(new TeamTurnScheduler());

test('TurnManager emits integrity violation for empty players', () => {
  const state = createState({ players: [], activeActivationSlot: { id: 'team:ghost', entityId: 'ghost', teamId: 'ghost' } });
  const result = manager.advancePhaseWithEvents(state);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.kind, 'INTEGRITY_VIOLATION');
  assert.equal(result.state.phase, state.phase);
});

test('TurnManager recovers invalid active actor before advancing', () => {
  const state = createState({ phase: 'COMMAND', activeActivationSlot: { id: 'team:ghost', entityId: 'ghost', teamId: 'ghost' } });
  const result = manager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['INTEGRITY_VIOLATION', 'PHASE_ADVANCED']);
  assert.equal(getActiveActorId(result.state), 'A');
  assert.equal(result.state.phase, 'RESOLUTION');
});

test('TurnManager wraps turns and rounds at end of turn', () => {
  const state = createState({ phase: 'END_TURN', activeActivationSlot: { id: 'team:B', entityId: 'B', teamId: 'B' }, turn: 5, round: 3 });
  const result = manager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['PHASE_ADVANCED', 'TURN_STARTED']);
  assert.equal(result.state.turn, 6);
  assert.equal(result.state.round, 4);
  assert.equal(getActiveActorId(result.state), 'A');
  assert.equal(result.state.phase, 'START_TURN');
});

test('TurnManager preserves turn/round consistency across repeated turn rotations', () => {
  let state = createState({
    phase: 'END_TURN',
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
    turn: 1,
    round: 1,
  });

  for (let rotation = 0; rotation < 4; rotation += 1) {
    const expectedTurn = state.turn + 1;
    const expectedRound = state.activeActivationSlot.teamId === 'B' ? state.round + 1 : state.round;
    const result = manager.advancePhaseWithEvents(state);

    const phaseEvent = result.events.find((event) => event.kind === 'PHASE_ADVANCED');
    const turnStarted = result.events.find((event) => event.kind === 'TURN_STARTED');

    assert.ok(phaseEvent);
    assert.equal(phaseEvent?.turn, state.turn);
    assert.equal(phaseEvent?.round, state.round);

    assert.ok(turnStarted);
    if (turnStarted?.kind === 'TURN_STARTED') {
      assert.equal(turnStarted.turn, expectedTurn);
      assert.equal(turnStarted.round, expectedRound);
    }

    assert.equal(result.state.turn, expectedTurn);
    assert.equal(result.state.round, expectedRound);

    state = {
      ...result.state,
      phase: 'END_TURN',
    };
  }
});
test('TurnManager supports unit-turn scheduler variant', () => {
  const state = createState({
    phase: 'END_TURN',
    activeActivationSlot: { id: 'unit:u-a', entityId: 'u-a', teamId: 'A' },
    turn: 2,
    round: 1,
  });
  const unitManager = new TurnManager(new UnitTurnScheduler());
  const result = unitManager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['PHASE_ADVANCED', 'TURN_STARTED']);
  assert.equal(getActiveActorId(result.state), 'u-b');
  assert.equal(result.state.activeActivationSlot.teamId, 'B');
});

test('UnitTurnScheduler transition ends match when no alive units remain', () => {
  const unitManager = new TurnManager(new UnitTurnScheduler());
  const state = createState({
    phase: 'END_TURN',
    turn: 3,
    round: 2,
    activeActivationSlot: { id: 'unit:u-a', entityId: 'u-a', teamId: 'A' },
    units: {
      'u-a': { id: 'u-a', ownerId: 'A', hp: 0, maxHp: 5 },
      'u-b': { id: 'u-b', ownerId: 'B', hp: 0, maxHp: 5 },
    },
  });

  const result = unitManager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['PHASE_ADVANCED', 'INTEGRITY_VIOLATION', 'MATCH_ENDED']);
  assert.equal(result.state.matchStatus, 'ENDED');
  assert.equal(result.state.isDraw, true);
  assert.equal(result.state.turn, 3);
  assert.equal(result.state.round, 2);
});

test('UnitTurnScheduler empty-alive transition is terminal and does not loop turns', () => {
  const unitManager = new TurnManager(new UnitTurnScheduler());
  const state = createState({
    phase: 'END_TURN',
    turn: 7,
    round: 4,
    activeActivationSlot: { id: 'unit:u-a', entityId: 'u-a', teamId: 'A' },
    units: {
      'u-a': { id: 'u-a', ownerId: 'A', hp: 0, maxHp: 5 },
      'u-b': { id: 'u-b', ownerId: 'B', hp: 0, maxHp: 5 },
    },
  });

  const first = unitManager.advancePhaseWithEvents(state);
  const second = unitManager.advancePhaseWithEvents(first.state);

  assert.equal(first.state.matchStatus, 'ENDED');
  assert.equal(first.events.some((event) => event.kind === 'TURN_STARTED'), false);
  assert.equal(second.events.some((event) => event.kind === 'TURN_STARTED'), false);
  assert.equal(second.state.turn, first.state.turn);
  assert.equal(second.state.round, first.state.round);
});

test('TurnManager builds END_COMMAND flow with turn-start boundary', () => {
  const flow = manager.getActionPhaseFlow('END_COMMAND', 'COMMAND');
  assert.deepEqual(
    flow.map((step) => step.kind),
    ['ADVANCE_PHASE', 'ADVANCE_PHASE', 'ADVANCE_PHASE', 'TURN_START_BOUNDARY', 'ADVANCE_PHASE'],
  );
});

test('TurnManager END_COMMAND flow adapts when phase order changes', () => {
  const customManager = new TurnManager(new TeamTurnScheduler(), ['START_TURN', 'RESOLUTION', 'COMMAND', 'END_TURN']);
  const flow = customManager.getActionPhaseFlow('END_COMMAND', 'COMMAND');

  assert.deepEqual(
    flow.map((step) => step.kind),
    ['ADVANCE_PHASE', 'ADVANCE_PHASE', 'TURN_START_BOUNDARY', 'ADVANCE_PHASE', 'ADVANCE_PHASE'],
  );

  let phase: GameState['phase'] = 'COMMAND';
  for (const step of flow) {
    if (step.kind === 'ADVANCE_PHASE') {
      phase = customManager.getNextPhase(phase);
    }
  }

  assert.equal(phase, 'COMMAND');
});
