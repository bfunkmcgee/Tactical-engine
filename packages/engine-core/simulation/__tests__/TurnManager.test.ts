import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TurnManager } from '../TurnManager';
import { createInitialState, type GameState } from '../../state/GameState';

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

const manager = new TurnManager();

test('TurnManager emits integrity violation for empty players', () => {
  const state = createState({ players: [], activeActorId: 'ghost' });
  const result = manager.advancePhaseWithEvents(state);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.kind, 'INTEGRITY_VIOLATION');
  assert.equal(result.state.phase, state.phase);
});

test('TurnManager recovers invalid active actor before advancing', () => {
  const state = createState({ phase: 'COMMAND', activeActorId: 'ghost' });
  const result = manager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['INTEGRITY_VIOLATION', 'PHASE_ADVANCED']);
  assert.equal(result.state.activeActorId, 'A');
  assert.equal(result.state.phase, 'RESOLUTION');
});

test('TurnManager wraps turns and rounds at end of turn', () => {
  const state = createState({ phase: 'END_TURN', activeActorId: 'B', turn: 5, round: 3 });
  const result = manager.advancePhaseWithEvents(state);

  assert.deepEqual(result.events.map((event) => event.kind), ['PHASE_ADVANCED', 'TURN_STARTED']);
  assert.equal(result.state.turn, 6);
  assert.equal(result.state.round, 4);
  assert.equal(result.state.activeActorId, 'A');
  assert.equal(result.state.phase, 'START_TURN');
});
