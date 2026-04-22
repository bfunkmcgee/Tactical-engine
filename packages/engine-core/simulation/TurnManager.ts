import {
  appendEvents,
  reduceEvents,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
} from '../state/GameState';
import type { Phase } from '../state/SimulationContract';

const PHASE_ORDER: readonly Phase[] = ['START_TURN', 'COMMAND', 'RESOLUTION', 'END_TURN'];

export class TurnManager {
  public advancePhase(state: GameState): GameState {
    return this.advancePhaseWithEvents(state).state;
  }

  public advancePhaseWithEvents(state: GameState): StateTransitionResult {
    const events: GameEvent[] = [];

    if (state.players.length === 0) {
      const integrityEvent = this.createIntegrityViolationEvent(
        state,
        'players_non_empty',
        'Cannot advance phase because the players list is empty.',
      );

      return {
        state: appendEvents(state, [integrityEvent]),
        events: [integrityEvent],
      };
    }

    const normalizedState = this.ensureActiveActor(state, events);
    const nextPhase = this.getNextPhase(normalizedState.phase);
    events.push({
      kind: 'PHASE_ADVANCED',
      from: normalizedState.phase,
      to: nextPhase,
      turn: normalizedState.turn,
      round: normalizedState.round,
    });

    let nextState = reduceEvents(normalizedState, [
      {
        kind: 'PHASE_ADVANCED',
        from: normalizedState.phase,
        to: nextPhase,
        turn: normalizedState.turn,
        round: normalizedState.round,
      },
    ]);

    if (normalizedState.phase === 'END_TURN') {
      const nextTurn = normalizedState.turn + 1;
      const currentIdx = normalizedState.players.indexOf(normalizedState.activeActorId);
      const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % normalizedState.players.length;
      const wrapped = nextIdx === 0;
      const nextRound = wrapped ? normalizedState.round + 1 : normalizedState.round;
      const actorId = normalizedState.players[nextIdx] ?? normalizedState.activeActorId;

      const turnStartEvent: GameEvent = {
        kind: 'TURN_STARTED',
        actorId,
        turn: nextTurn,
        round: nextRound,
      };
      events.push(turnStartEvent);
      nextState = reduceEvents(nextState, [turnStartEvent]);
    }

    return {
      state: appendEvents(nextState, events),
      events,
    };
  }

  public getNextPhase(current: Phase): Phase {
    const index = PHASE_ORDER.indexOf(current);
    if (index === -1) {
      return 'START_TURN';
    }

    return PHASE_ORDER[(index + 1) % PHASE_ORDER.length] ?? 'START_TURN';
  }

  private ensureActiveActor(state: GameState, events: GameEvent[]): GameState {
    if (state.players.includes(state.activeActorId)) {
      return state;
    }

    const recoveredActorId = state.players[0] ?? state.activeActorId;
    events.push(
      this.createIntegrityViolationEvent(
        state,
        'active_actor_in_players',
        `Recovered active actor from "${state.activeActorId}" to "${recoveredActorId}".`,
      ),
    );

    return {
      ...state,
      activeActorId: recoveredActorId,
    };
  }

  private createIntegrityViolationEvent(state: GameState, invariant: string, detail: string): GameEvent {
    return {
      kind: 'INTEGRITY_VIOLATION',
      invariant,
      detail,
      turn: state.turn,
      round: state.round,
    };
  }
}
