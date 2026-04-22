import type {
  Phase,
  RuleEvaluationState,
  SimulationAction,
  SimulationEvent,
  SimulationUnit,
  TeamId,
  UnitId,
} from './SimulationContract';

export interface UnitState {
  readonly id: UnitId;
  readonly ownerId: TeamId;
  readonly hp: number;
  readonly maxHp: number;
}

export type Action = SimulationAction;
export type GameEvent = SimulationEvent;

export interface GameState {
  readonly round: number;
  readonly turn: number;
  readonly activeActorId: TeamId;
  readonly phase: Phase;
  readonly players: readonly TeamId[];
  readonly units: Readonly<Record<UnitId, UnitState>>;
  readonly pendingActions: readonly Action[];
  readonly eventLog: readonly GameEvent[];
}

export interface StateTransitionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function appendEvents(state: GameState, events: readonly GameEvent[]): GameState {
  if (events.length === 0) {
    return state;
  }

  return {
    ...state,
    eventLog: [...state.eventLog, ...events],
  };
}

export function reduceState(state: GameState, event: GameEvent): GameState {
  switch (event.kind) {
    case 'PHASE_ADVANCED': {
      return {
        ...state,
        phase: event.to,
      };
    }

    case 'TURN_STARTED': {
      return {
        ...state,
        activeActorId: event.actorId,
        turn: event.turn,
        round: event.round,
        phase: 'START_TURN',
        pendingActions: [],
      };
    }

    case 'ACTION_APPLIED': {
      if (event.action.type === 'ATTACK' || event.action.type === 'PASS') {
        return {
          ...state,
          pendingActions: [...state.pendingActions, event.action],
        };
      }

      return state;
    }

    case 'UNIT_DAMAGED': {
      const target = state.units[event.targetId];
      if (!target) {
        return state;
      }

      const updatedTarget: UnitState = {
        ...target,
        hp: Math.max(0, target.hp - event.amount),
      };

      return {
        ...state,
        units: {
          ...state.units,
          [target.id]: updatedTarget,
        },
      };
    }

    default:
      return state;
  }
}

export function reduceEvents(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce((acc, event) => reduceState(acc, event), state);
}

export function createInitialState(players: readonly TeamId[], units: readonly UnitState[]): GameState {
  const firstActor = players[0];
  if (!firstActor) {
    throw new Error('Cannot create initial state with no players.');
  }

  const unitMap = units.reduce<Record<UnitId, UnitState>>((acc, unit) => {
    acc[unit.id] = unit;
    return acc;
  }, {});

  return {
    round: 1,
    turn: 1,
    activeActorId: firstActor,
    phase: 'START_TURN',
    players: [...players],
    units: unitMap,
    pendingActions: [],
    eventLog: [],
  };
}

export function toRuleEvaluationState(state: GameState, mapId: string): RuleEvaluationState {
  const units: SimulationUnit[] = Object.values(state.units).map((unit) => ({
    id: unit.id,
    teamId: unit.ownerId,
    health: unit.hp,
    maxHealth: unit.maxHp,
  }));

  return {
    turn: state.turn,
    round: state.round,
    activeTeamId: state.activeActorId,
    phase: state.phase,
    mapId,
    units,
  };
}
