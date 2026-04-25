import {
  appendEvents,
  reduceEvents,
  toSchedulerStateSnapshot,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
} from '../state/GameState';
import type { ActionType, ActivationSlot, Phase, SchedulerStateSnapshot, TurnScheduler } from '../state/SimulationContract';

const DEFAULT_PHASE_ORDER: readonly Phase[] = ['START_TURN', 'COMMAND', 'RESOLUTION', 'END_TURN'];

export type PhaseFlowStep = { readonly kind: 'ADVANCE_PHASE' } | { readonly kind: 'TURN_START_BOUNDARY' };

interface ActionPhasePolicy {
  readonly targetPhase: Phase;
  readonly boundaryPhase?: Phase;
}

const ACTION_PHASE_POLICIES: Readonly<Partial<Record<ActionType, Partial<Record<Phase, ActionPhasePolicy>>>>> = {
  END_COMMAND: {
    COMMAND: { targetPhase: 'COMMAND', boundaryPhase: 'START_TURN' },
  },
  PASS: {
    START_TURN: { targetPhase: 'COMMAND' },
    RESOLUTION: { targetPhase: 'END_TURN' },
    END_TURN: { targetPhase: 'START_TURN' },
  },
};

const NO_ALIVE_UNIT_SLOT: ActivationSlot = {
  id: 'unit:none-alive',
  entityId: 'none-alive',
  label: 'No alive units',
};

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
    if (aliveUnits.length === 0) {
      return NO_ALIVE_UNIT_SLOT;
    }

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
  public constructor(
    private readonly scheduler: TurnScheduler = new TeamTurnScheduler(),
    private readonly phaseOrder: readonly Phase[] = DEFAULT_PHASE_ORDER,
  ) {}

  public advancePhase(state: GameState): GameState {
    return this.advancePhaseWithEvents(state).state;
  }

  public startTurnWithEvents(state: GameState): StateTransitionResult {
    const events: GameEvent[] = [];

    if (state.players.length === 0) {
      const integrityEvent = this.createIntegrityViolationEvent(
        state,
        'players_non_empty',
        'Cannot start turn because the players list is empty.',
      );

      return {
        state: appendEvents(state, [integrityEvent]),
        events: [integrityEvent],
      };
    }

    const normalizedState = this.ensureActiveSlot(state, events);
    if (normalizedState.phase !== 'START_TURN') {
      return {
        state: appendEvents(normalizedState, events),
        events,
      };
    }

    const turnStartEvent: GameEvent = {
      kind: 'TURN_STARTED',
      actorId: normalizedState.activeActivationSlot.entityId,
      activationSlot: normalizedState.activeActivationSlot,
      turn: normalizedState.turn,
      round: normalizedState.round,
    };
    events.push(turnStartEvent);

    return {
      state: appendEvents(reduceEvents(normalizedState, [turnStartEvent]), events),
      events,
    };
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
      if (!this.scheduler.isSlotValid(evalState, nextSlot)) {
        const integrityEvent = this.createIntegrityViolationEvent(
          normalizedState,
          'next_slot_valid',
          `Cannot start next turn because scheduler returned an invalid slot "${nextSlot.entityId}".`,
        );
        const terminalEvent: GameEvent = {
          kind: 'MATCH_ENDED',
          isDraw: true,
          turn: normalizedState.turn,
          round: normalizedState.round,
        };

        events.push(integrityEvent, terminalEvent);
        nextState = reduceEvents(nextState, [integrityEvent, terminalEvent]);

        return {
          state: appendEvents(nextState, events),
          events,
        };
      }

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
    const index = this.phaseOrder.indexOf(current);
    if (index === -1) {
      return 'START_TURN';
    }

    return this.phaseOrder[(index + 1) % this.phaseOrder.length] ?? 'START_TURN';
  }

  public getActionPhaseFlow(actionType: ActionType, currentPhase: Phase): readonly PhaseFlowStep[] {
    const policy = ACTION_PHASE_POLICIES[actionType]?.[currentPhase];
    if (!policy) {
      return [];
    }

    const steps: PhaseFlowStep[] = [];
    let phase = currentPhase;
    let guard = this.phaseOrder.length + 1;

    while (guard > 0) {
      guard -= 1;
      phase = this.getNextPhase(phase);
      steps.push({ kind: 'ADVANCE_PHASE' });

      if (policy.boundaryPhase && phase === policy.boundaryPhase) {
        steps.push({ kind: 'TURN_START_BOUNDARY' });
      }

      if (phase === policy.targetPhase) {
        break;
      }
    }

    return steps;
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
