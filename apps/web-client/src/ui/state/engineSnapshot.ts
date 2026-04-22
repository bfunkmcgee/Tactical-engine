import type { Action, GameEvent, GameState } from '../../../../../packages/engine-core/state/GameState';
import { getActiveActorId } from '../../../../../packages/engine-core/state/GameState';

export type Entity = {
  id: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  maxHp: number;
};

export type ViewState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type EngineActionView = {
  command: Action;
  label: string;
};

export type EngineSnapshot = {
  tick: number;
  entities: Entity[];
  selection?: string;
  selectedLegalActions: EngineActionView[];
  feedback: string[];
  view: ViewState;
  phase: GameState['phase'];
  turn: number;
  round: number;
  activeActorId: string;
};

const TEAM_COLORS: Record<string, string> = {
  'player-1': '#22c55e',
  'player-2': '#eab308',
};

const TILE_SIZE = 56;

function toActionLabel(action: Action): string {
  switch (action.type) {
    case 'ATTACK': {
      const targetId = action.payload && 'targetId' in action.payload ? action.payload.targetId : 'target';
      return `Attack ${targetId}`;
    }
    case 'END_COMMAND':
      return 'End Command';
    case 'MOVE': {
      const unitId = action.payload && 'unitId' in action.payload ? action.payload.unitId : 'unit';
      return `Move ${unitId}`;
    }
    case 'USE_ABILITY': {
      const abilityId = action.payload && 'abilityId' in action.payload ? action.payload.abilityId : 'ability';
      return `Use Ability ${abilityId}`;
    }
    case 'USE_ITEM': {
      const itemId = action.payload && 'itemId' in action.payload ? action.payload.itemId : 'item';
      return `Use Item ${itemId}`;
    }
    case 'PASS':
      return 'Pass';
    default:
      return action.type;
  }
}

function toEventFeedback(event: GameEvent): string | null {
  switch (event.kind) {
    case 'UNIT_DAMAGED':
      return `${event.targetId} took ${event.amount} damage from ${event.sourceId}`;
    case 'PHASE_ADVANCED':
      return `Phase: ${event.from} → ${event.to}`;
    case 'TURN_STARTED':
      return `Turn ${event.turn}, Round ${event.round}: ${event.actorId}`;
    case 'INTEGRITY_VIOLATION':
      return `Integrity warning: ${event.invariant}`;
    default:
      return null;
  }
}

export function projectEngineSnapshot(params: {
  state: GameState;
  events: readonly GameEvent[];
  selection?: string;
  tick: number;
  view: ViewState;
  getLegalActions: (state: GameState, actorId: string) => readonly Action[];
}): EngineSnapshot {
  const { state, events, selection, tick, view, getLegalActions } = params;

  const entities = Object.values(state.units)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((unit) => {
      const logicalX = unit.position?.x ?? unit.spatialRef?.q ?? 0;
      const logicalY = unit.position?.y ?? unit.spatialRef?.r ?? 0;
      return {
        id: unit.id,
        x: logicalX * TILE_SIZE,
        y: logicalY * TILE_SIZE,
        color: TEAM_COLORS[unit.ownerId] ?? '#38bdf8',
        hp: unit.hp,
        maxHp: unit.maxHp,
      };
    });

  const selectedUnit = selection ? state.units[selection] : undefined;
  const activeActorId = getActiveActorId(state);
  const selectedLegalActions =
    selectedUnit && selectedUnit.ownerId === activeActorId
      ? getLegalActions(state, activeActorId).map((action) => ({
          command: action,
          label: toActionLabel(action),
        }))
      : [];

  const feedback = events
    .map((event) => toEventFeedback(event))
    .filter((entry): entry is string => Boolean(entry))
    .slice(-4);

  return {
    tick,
    entities,
    selection,
    selectedLegalActions,
    feedback,
    view,
    phase: state.phase,
    turn: state.turn,
    round: state.round,
    activeActorId,
  };
}
