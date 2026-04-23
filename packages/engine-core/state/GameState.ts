import type {
  ActiveEffect,
  ActivationSlot,
  Phase,
  Position,
  RuleEvaluationState,
  SchedulerStateSnapshot,
  MatchStatus,
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
  readonly definitionId?: string;
  readonly position?: Position;
  readonly spatialRef?: Readonly<{ q: number; r: number }>;
  readonly actionPoints?: number;
  readonly maxActionPoints?: number;
  readonly cooldowns?: Readonly<Record<string, number>>;
  readonly activeEffects?: readonly ActiveEffect[];
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
  readonly matchStatus: MatchStatus;
  readonly winnerTeamId?: TeamId;
  readonly isDraw: boolean;
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

    case 'UNIT_DEFEATED': {
      const target = state.units[event.targetId];
      if (!target) {
        return state;
      }

      return {
        ...state,
        units: {
          ...state.units,
          [target.id]: {
            ...target,
            hp: 0,
          },
        },
      };
    }

    case 'STATUS_APPLIED': {
      const target = state.units[event.targetId];
      if (!target) {
        return state;
      }

      const normalizedExistingEffects = normalizeActiveEffects(target.activeEffects);
      const effectKey = getEffectKey(event.statusId, event.sourceUnitId);
      const nextEffectsByKey = normalizedExistingEffects.reduce<Map<string, ActiveEffect>>((acc, effect) => {
        acc.set(getEffectKey(effect.effectId, effect.sourceUnitId), effect);
        return acc;
      }, new Map());
      const existingEffect =
        nextEffectsByKey.get(effectKey) ??
        (event.sourceUnitId ? nextEffectsByKey.get(getEffectKey(event.statusId, undefined)) : undefined);
      if (existingEffect && event.sourceUnitId && !nextEffectsByKey.has(effectKey)) {
        nextEffectsByKey.delete(getEffectKey(event.statusId, undefined));
      }

      nextEffectsByKey.set(
        effectKey,
        createActiveEffect(
          event.statusId,
          existingEffect ? Math.max(existingEffect.duration, event.duration) : event.duration,
          event.sourceUnitId,
          (existingEffect?.stacks ?? 1) + (existingEffect ? 1 : 0),
        ),
      );

      const activeEffects = Array.from(nextEffectsByKey.values()).sort(compareActiveEffects);

      return {
        ...state,
        units: {
          ...state.units,
          [target.id]: {
            ...target,
            activeEffects,
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

    case 'MATCH_ENDED': {
      return {
        ...state,
        matchStatus: 'ENDED',
        winnerTeamId: event.winnerTeamId,
        isDraw: event.isDraw,
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
    matchStatus: 'IN_PROGRESS',
    winnerTeamId: undefined,
    isDraw: false,
  };
}

export function toRuleEvaluationState(state: GameState, mapId: string): RuleEvaluationState {
  const units: SimulationUnit[] = Object.values(state.units).map((unit) => ({
    id: unit.id,
    teamId: unit.ownerId,
    definitionId: unit.definitionId,
    health: unit.hp,
    maxHealth: unit.maxHp,
    actionPoints: unit.actionPoints,
    maxActionPoints: unit.maxActionPoints,
    cooldowns: unit.cooldowns,
    position: unit.position ?? (unit.spatialRef ? { x: unit.spatialRef.q, y: unit.spatialRef.r } : undefined),
    activeEffects: unit.activeEffects,
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
      definitionId: unit.definitionId,
      health: unit.hp,
      maxHealth: unit.maxHp,
      actionPoints: unit.actionPoints,
      maxActionPoints: unit.maxActionPoints,
      cooldowns: unit.cooldowns,
      position: unit.position ?? (unit.spatialRef ? { x: unit.spatialRef.q, y: unit.spatialRef.r } : undefined),
      activeEffects: unit.activeEffects,
    })),
    turn: state.turn,
    round: state.round,
    phase: state.phase,
  };
}

function getEffectKey(effectId: string, sourceUnitId?: string): string {
  return `${effectId}::${sourceUnitId ?? ''}`;
}

function compareActiveEffects(left: ActiveEffect, right: ActiveEffect): number {
  if (left.effectId !== right.effectId) {
    return left.effectId.localeCompare(right.effectId);
  }

  return (left.sourceUnitId ?? '').localeCompare(right.sourceUnitId ?? '');
}

function normalizeActiveEffects(activeEffects: readonly ActiveEffect[] | undefined): ActiveEffect[] {
  return (activeEffects ?? [])
    .map((effect) => createActiveEffect(effect.effectId, Math.max(0, effect.duration), effect.sourceUnitId, Math.max(1, effect.stacks ?? 1)))
    .sort(compareActiveEffects);
}

export interface LegacyUnitStateWithStatusEffectIds extends Omit<UnitState, 'activeEffects'> {
  readonly statusEffectIds?: readonly string[];
}

export interface LegacyGameStateWithStatusEffectIds extends Omit<GameState, 'units'> {
  readonly units: Readonly<Record<UnitId, LegacyUnitStateWithStatusEffectIds>>;
}

export function migrateLegacyStatusEffectIdsState(
  state: LegacyGameStateWithStatusEffectIds | GameState,
): GameState {
  const migratedUnits = Object.fromEntries(
    Object.entries(state.units).map(([unitId, unit]) => {
      const maybeLegacyUnit = unit as LegacyUnitStateWithStatusEffectIds;
      const activeEffects =
        'activeEffects' in unit && unit.activeEffects
          ? normalizeActiveEffects(unit.activeEffects)
          : parseLegacyStatusEffectIds(maybeLegacyUnit.statusEffectIds);

      return [
        unitId,
        {
          ...unit,
          activeEffects: activeEffects.length > 0 ? activeEffects : undefined,
        },
      ];
    }),
  ) as Readonly<Record<UnitId, UnitState>>;

  return {
    ...state,
    units: migratedUnits,
  };
}

function parseLegacyStatusEffectIds(statusEffectIds: readonly string[] | undefined): ActiveEffect[] {
  const effectMap = (statusEffectIds ?? []).reduce<Map<string, ActiveEffect>>((acc, entry) => {
    const separatorIndex = entry.indexOf(':');
    const effectId = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);
    const durationValue = separatorIndex === -1 ? Number.NaN : Number.parseInt(entry.slice(separatorIndex + 1), 10);
    const duration = Number.isFinite(durationValue) ? Math.max(0, durationValue) : 0;
    const key = getEffectKey(effectId, undefined);
    const existing = acc.get(key);
    acc.set(key, createActiveEffect(effectId, existing ? Math.max(existing.duration, duration) : duration, undefined, (existing?.stacks ?? 1) + (existing ? 1 : 0)));
    return acc;
  }, new Map());

  return Array.from(effectMap.values()).sort(compareActiveEffects);
}

function createActiveEffect(effectId: string, duration: number, sourceUnitId?: UnitId, stacks = 1): ActiveEffect {
  return {
    effectId,
    duration,
    stacks,
    ...(sourceUnitId ? { sourceUnitId } : {}),
  };
}
