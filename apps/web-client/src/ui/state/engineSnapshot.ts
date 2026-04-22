import type { Action, GameEvent, GameState } from '../../../../../packages/engine-core/state/GameState';

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
  id: string;
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

const GRID_COLUMNS = 16;
const TILE_SIZE = 56;

function toActionLabel(action: Action): string {
  switch (action.type) {
    case 'ATTACK': {
      const targetId = action.payload && 'targetId' in action.payload ? action.payload.targetId : 'target';
      return `Attack ${targetId}`;
    }
    case 'END_COMMAND':
      return 'End Command';
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
    .map((unit, index) => ({
      id: unit.id,
      x: (index % GRID_COLUMNS) * TILE_SIZE,
      y: Math.floor(index / GRID_COLUMNS) * TILE_SIZE,
      color: TEAM_COLORS[unit.ownerId] ?? '#38bdf8',
      hp: unit.hp,
      maxHp: unit.maxHp,
    }));

  const selectedUnit = selection ? state.units[selection] : undefined;
  const selectedLegalActions =
    selectedUnit && selectedUnit.ownerId === state.activeActorId
      ? getLegalActions(state, state.activeActorId).map((action) => ({
          id: action.id,
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
    activeActorId: state.activeActorId,
  };
}
