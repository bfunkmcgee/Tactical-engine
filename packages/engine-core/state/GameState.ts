export type Phase = 'START_TURN' | 'COMMAND' | 'RESOLUTION' | 'END_TURN';

export interface UnitState {
  readonly id: string;
  readonly ownerId: string;
  readonly hp: number;
  readonly maxHp: number;
}

export interface Action {
  readonly id: string;
  readonly actorId: string;
  readonly type: 'END_COMMAND' | 'ATTACK' | 'PASS';
  readonly payload?: {
    readonly targetId?: string;
    readonly amount?: number;
  };
}

export type GameEvent =
  | {
      readonly kind: 'PHASE_ADVANCED';
      readonly from: Phase;
      readonly to: Phase;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'TURN_STARTED';
      readonly actorId: string;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'ACTION_APPLIED';
      readonly action: Action;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'UNIT_DAMAGED';
      readonly sourceId: string;
      readonly targetId: string;
      readonly amount: number;
      readonly turn: number;
      readonly round: number;
    };

export interface GameState {
  readonly round: number;
  readonly turn: number;
  readonly activeActorId: string;
  readonly phase: Phase;
  readonly players: readonly string[];
  readonly units: Readonly<Record<string, UnitState>>;
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

export function createInitialState(players: readonly string[], units: readonly UnitState[]): GameState {
  const firstActor = players[0] ?? '';
  const unitMap = units.reduce<Record<string, UnitState>>((acc, unit) => {
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
