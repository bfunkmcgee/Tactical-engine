import {
  appendEvents,
  reduceEvents,
  toSchedulerStateSnapshot,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
} from '../state/GameState';
import type { ActivationSlot, Phase, SchedulerStateSnapshot, TurnScheduler } from '../state/SimulationContract';

const PHASE_ORDER: readonly Phase[] = ['START_TURN', 'COMMAND', 'RESOLUTION', 'END_TURN'];

export class TeamTurnScheduler implements TurnScheduler {
  public getInitialSlot(state: { readonly players: readonly string[] }): ActivationSlot {
    const firstActor = state.players[0];
    if (!firstActor) {
      return { id: 'team:missing', entityId: 'missing', label: 'Missing team' };
    }

    return {
      id: `team:${firstActor}`,
      entityId: firstActor,
      teamId: firstActor,
      label: `Team ${firstActor}`,
    };
  }

  public getNextSlot(state: { readonly players: readonly string[] }, currentSlot: ActivationSlot): ActivationSlot {
    const currentTeamId = currentSlot.teamId ?? currentSlot.entityId;
    const currentIdx = state.players.indexOf(currentTeamId);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % state.players.length;
    const nextActor = state.players[nextIdx] ?? currentTeamId;

    return {
      id: `team:${nextActor}`,
      entityId: nextActor,
      teamId: nextActor,
      label: `Team ${nextActor}`,
    };
  }

  public isSlotValid(state: { readonly players: readonly string[] }, slot: ActivationSlot): boolean {
    const teamId = slot.teamId ?? slot.entityId;
    return state.players.includes(teamId);
  }
}

export class UnitTurnScheduler implements TurnScheduler {
  public getInitialSlot(state: SchedulerStateSnapshot): ActivationSlot {
    const firstUnit = [...state.units]
      .filter((unit) => unit.health > 0)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!firstUnit) {
      return { id: 'unit:missing', entityId: 'missing', label: 'Missing unit' };
    }

    return { id: `unit:${firstUnit.id}`, entityId: firstUnit.id, teamId: firstUnit.teamId, label: `Unit ${firstUnit.id}` };
  }

  public getNextSlot(state: SchedulerStateSnapshot, currentSlot: ActivationSlot): ActivationSlot {
    const aliveUnits = [...state.units].filter((unit) => unit.health > 0).sort((left, right) => left.id.localeCompare(right.id));
    const currentIdx = aliveUnits.findIndex((unit) => unit.id === currentSlot.entityId);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % aliveUnits.length;
    const nextUnit = aliveUnits[nextIdx];
    if (!nextUnit) {
      return currentSlot;
    }

    return { id: `unit:${nextUnit.id}`, entityId: nextUnit.id, teamId: nextUnit.teamId, label: `Unit ${nextUnit.id}` };
  }

  public isSlotValid(state: SchedulerStateSnapshot, slot: ActivationSlot): boolean {
    return state.units.some((unit) => unit.id === slot.entityId && unit.health > 0);
  }
}

export class TurnManager {
  public constructor(private readonly scheduler: TurnScheduler = new TeamTurnScheduler()) {}

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

    const normalizedState = this.ensureActiveSlot(state, events);
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
      const evalState = toSchedulerStateSnapshot(normalizedState);
      const nextSlot = this.scheduler.getNextSlot(evalState, normalizedState.activeActivationSlot);
      const wrapped = this.hasWrappedTurn(normalizedState.activeActivationSlot, nextSlot, normalizedState);
      const nextRound = wrapped ? normalizedState.round + 1 : normalizedState.round;

      const turnStartEvent: GameEvent = {
        kind: 'TURN_STARTED',
        actorId: nextSlot.entityId,
        activationSlot: nextSlot,
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

  private ensureActiveSlot(state: GameState, events: GameEvent[]): GameState {
    const evalState = toSchedulerStateSnapshot(state);
    if (this.scheduler.isSlotValid(evalState, state.activeActivationSlot)) {
      return state;
    }

    const recoveredSlot = this.scheduler.getInitialSlot(evalState);
    events.push(
      this.createIntegrityViolationEvent(
        state,
        'active_slot_valid',
        `Recovered active slot from "${state.activeActivationSlot.entityId}" to "${recoveredSlot.entityId}".`,
      ),
    );

    return {
      ...state,
      activeActivationSlot: recoveredSlot,
    };
  }

  private hasWrappedTurn(current: ActivationSlot, next: ActivationSlot, state: GameState): boolean {
    const currentTeamId = current.teamId ?? current.entityId;
    const nextTeamId = next.teamId ?? next.entityId;
    const currentIndex = state.players.indexOf(currentTeamId);
    const nextIndex = state.players.indexOf(nextTeamId);
    if (currentIndex === -1 || nextIndex === -1) {
      return next.id === this.scheduler.getInitialSlot(toSchedulerStateSnapshot(state)).id;
    }

    return nextIndex <= currentIndex;
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
