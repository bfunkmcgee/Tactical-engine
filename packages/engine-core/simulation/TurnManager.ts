import { appendEvents, reduceEvents, type GameEvent, type GameState, type Phase } from '../state/GameState';

const PHASE_ORDER: readonly Phase[] = ['START_TURN', 'COMMAND', 'RESOLUTION', 'END_TURN'];

export class TurnManager {
  public advancePhase(state: GameState): GameState {
    const nextPhase = this.getNextPhase(state.phase);
    const events: GameEvent[] = [
      {
        kind: 'PHASE_ADVANCED',
        from: state.phase,
        to: nextPhase,
        turn: state.turn,
        round: state.round,
      },
    ];

    let nextState = reduceEvents(state, events);

    if (state.phase === 'END_TURN') {
      const nextTurn = state.turn + 1;
      const currentIdx = state.players.indexOf(state.activeActorId);
      const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % state.players.length;
      const wrapped = nextIdx === 0;
      const nextRound = wrapped ? state.round + 1 : state.round;
      const actorId = state.players[nextIdx] ?? state.activeActorId;

      const turnStartEvent: GameEvent = {
        kind: 'TURN_STARTED',
        actorId,
        turn: nextTurn,
        round: nextRound,
      };
      events.push(turnStartEvent);
      nextState = reduceEvents(nextState, [turnStartEvent]);
    }

    return appendEvents(nextState, events);
  }

  public getNextPhase(current: Phase): Phase {
    const index = PHASE_ORDER.indexOf(current);
    if (index === -1) {
      return 'START_TURN';
    }

    return PHASE_ORDER[(index + 1) % PHASE_ORDER.length] ?? 'START_TURN';
  }
}
