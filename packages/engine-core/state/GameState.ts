import type {
  ActivationSlot,
  Phase,
  Position,
  RuleEvaluationState,
  SchedulerStateSnapshot,
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
  readonly position?: Position;
  readonly spatialRef?: Readonly<{ q: number; r: number }>;
  readonly actionPoints?: number;
  readonly maxActionPoints?: number;
  readonly cooldowns?: Readonly<Record<string, number>>;
  readonly statusEffectIds?: readonly string[];
}

export type Action = SimulationAction;
export type GameEvent = SimulationEvent;

export interface GameState {
  readonly round: number;
  readonly turn: number;
  readonly activeActivationSlot: ActivationSlot;
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
      const activationSlot =
        event.activationSlot ??
        (event.actorId
          ? {
              id: `team:${event.actorId}`,
              entityId: event.actorId,
              teamId: event.actorId,
              label: `Team ${event.actorId}`,
            }
          : state.activeActivationSlot);

      return {
        ...state,
        activeActivationSlot: activationSlot,
        turn: event.turn,
        round: event.round,
        phase: 'START_TURN',
        pendingActions: [],
      };
    }

    case 'ACTION_APPLIED': {
      if (
        event.action.type === 'ATTACK' ||
        event.action.type === 'PASS' ||
        event.action.type === 'MOVE' ||
        event.action.type === 'USE_ABILITY' ||
        event.action.type === 'USE_ITEM'
      ) {
        return {
          ...state,
          pendingActions: [...state.pendingActions, event.action],
        };
      }

      return state;
    }

    case 'UNIT_MOVED': {
      const unit = state.units[event.unitId];
      if (!unit) {
        return state;
      }

      return {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            position: event.to,
          },
        },
      };
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

    case 'STATUS_APPLIED': {
      const target = state.units[event.targetId];
      if (!target) {
        return state;
      }

      const statusEffectsById = (target.statusEffectIds ?? []).reduce<Map<string, string>>((acc, entry) => {
        const separatorIndex = entry.indexOf(':');
        if (separatorIndex === -1) {
          acc.set(entry, entry);
          return acc;
        }

        const statusId = entry.slice(0, separatorIndex);
        const duration = entry.slice(separatorIndex + 1);
        acc.set(statusId, duration);
        return acc;
      }, new Map());

      statusEffectsById.set(event.statusId, String(event.duration));
      const statusEffectIds = Array.from(statusEffectsById.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([statusId, duration]) => `${statusId}:${duration}`);

      return {
        ...state,
        units: {
          ...state.units,
          [target.id]: {
            ...target,
            statusEffectIds,
          },
        },
      };
    }

    case 'ACTION_POINTS_CHANGED': {
      const unit = state.units[event.unitId];
      if (!unit) {
        return state;
      }

      return {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            actionPoints: event.to,
          },
        },
      };
    }

    case 'COOLDOWN_TICKED': {
      const unit = state.units[event.unitId];
      if (!unit) {
        return state;
      }

      return {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            cooldowns: {
              ...(unit.cooldowns ?? {}),
              [event.abilityId]: event.to,
            },
          },
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
    activeActivationSlot: {
      id: `team:${firstActor}`,
      entityId: firstActor,
      teamId: firstActor,
      label: `Team ${firstActor}`,
    },
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
    actionPoints: unit.actionPoints,
    maxActionPoints: unit.maxActionPoints,
    cooldowns: unit.cooldowns,
    position: unit.position ?? (unit.spatialRef ? { x: unit.spatialRef.q, y: unit.spatialRef.r } : undefined),
    statusEffectIds: unit.statusEffectIds,
  }));

  const activeTeamId =
    state.activeActivationSlot.teamId ??
    units.find((unit) => unit.id === state.activeActivationSlot.entityId)?.teamId ??
    state.players[0] ??
    '';

  return {
    turn: state.turn,
    round: state.round,
    activeTeamId,
    phase: state.phase,
    mapId,
    units,
  };
}

export function getActiveActorId(state: GameState): string {
  return state.activeActivationSlot.entityId;
}

export function toSchedulerStateSnapshot(state: GameState): SchedulerStateSnapshot {
  return {
    players: [...state.players],
    units: Object.values(state.units).map((unit) => ({
      id: unit.id,
      teamId: unit.ownerId,
      health: unit.hp,
      maxHealth: unit.maxHp,
      actionPoints: unit.actionPoints,
      maxActionPoints: unit.maxActionPoints,
      cooldowns: unit.cooldowns,
      position: unit.position ?? (unit.spatialRef ? { x: unit.spatialRef.q, y: unit.spatialRef.r } : undefined),
      statusEffectIds: unit.statusEffectIds,
    })),
    turn: state.turn,
    round: state.round,
    phase: state.phase,
  };
}
