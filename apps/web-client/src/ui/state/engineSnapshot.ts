import type { Action, GameEvent, GameState } from 'engine-core';
import { getActiveActorId } from 'engine-core';

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
  matchStatus: GameState['matchStatus'];
  winnerTeamId?: string;
  isDraw: boolean;
};

export type TeamColorMap = Readonly<Record<string, string>>;

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
    case 'MATCH_ENDED':
      return event.isDraw ? 'Match ended in a draw.' : `Match ended. Winner: ${event.winnerTeamId ?? 'unknown'}`;
    default:
      return null;
  }
}

function toHexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0');
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = (hue % 360) / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = secondary;
  } else if (huePrime < 2) {
    red = secondary;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondary;
  } else if (huePrime < 4) {
    green = secondary;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const match = lightness - chroma / 2;

  return `#${toHexChannel((red + match) * 255)}${toHexChannel((green + match) * 255)}${toHexChannel((blue + match) * 255)}`;
}

function hashTeamId(teamId: string): number {
  return teamId.split('').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 360, 0);
}

export function getDeterministicTeamColor(teamId: string): string {
  const hue = hashTeamId(teamId);
  return hslToHex(hue, 0.68, 0.52);
}

export function resolveTeamColor(teamId: string, teamColors?: TeamColorMap): string {
  return teamColors?.[teamId] ?? getDeterministicTeamColor(teamId);
}

export function projectEngineSnapshot(params: {
  state: GameState;
  events: readonly GameEvent[];
  selection?: string;
  tick: number;
  view: ViewState;
  getLegalActions: (state: GameState, actorId: string) => readonly Action[];
  teamColors?: TeamColorMap;
}): EngineSnapshot {
  const { state, events, selection, tick, view, getLegalActions, teamColors } = params;

  const entities = Object.values(state.units)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((unit) => {
      const logicalX = unit.position?.x ?? unit.spatialRef?.q ?? 0;
      const logicalY = unit.position?.y ?? unit.spatialRef?.r ?? 0;
      return {
        id: unit.id,
        x: logicalX * TILE_SIZE,
        y: logicalY * TILE_SIZE,
        color: resolveTeamColor(unit.ownerId, teamColors),
        hp: unit.hp,
        maxHp: unit.maxHp,
      };
    });

  const selectedUnit = selection ? state.units[selection] : undefined;
  const activeActorId = getActiveActorId(state);
  const selectedLegalActions =
    state.matchStatus === 'IN_PROGRESS' && selectedUnit && selectedUnit.ownerId === activeActorId
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
    matchStatus: state.matchStatus,
    winnerTeamId: state.winnerTeamId,
    isDraw: state.isDraw,
  };
}
