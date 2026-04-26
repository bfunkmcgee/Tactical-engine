import { LineOfSight, SquareGridAdapter, Targeting } from 'engine-spatial';
import type { Action, GameState, UnitState } from '../../state/GameState';

const DEFAULT_ATTACK_RANGE = 3;

const grid = new SquareGridAdapter();
const targeting = new Targeting(grid);

export function findActorUnit(state: GameState, actorId: string): UnitState | undefined {
  return state.units[actorId] ?? Object.values(state.units).find((unit) => unit.ownerId === actorId && unit.hp > 0);
}

export function hasSpatialPosition(unit: UnitState): boolean {
  return toCell(unit) !== undefined;
}

export function isOutOfRange(actorUnit: UnitState, targetUnit: UnitState, action: Action): boolean {
  const payload = action.payload as Record<string, unknown> | undefined;
  const actorPosition = toCell(actorUnit);
  const targetPosition = toCell(targetUnit);

  if (!actorPosition || !targetPosition) {
    return false;
  }

  const configuredRange = payload?.range;
  const maxRange = typeof configuredRange === 'number' && configuredRange >= 0 ? configuredRange : DEFAULT_ATTACK_RANGE;
  const attackableCells = targeting.getTargetCells({
    origin: actorPosition,
    minRange: 1,
    maxRange,
    aoePattern: [{ q: 0, r: 0 }],
  });
  const inRange = attackableCells.some((cell) => cell.target.q === targetPosition.q && cell.target.r === targetPosition.r);

  return !inRange;
}

export function hasLineOfSight(state: GameState, actorUnit: UnitState, targetUnit: UnitState): boolean {
  const actorPosition = toCell(actorUnit);
  const targetPosition = toCell(targetUnit);
  if (!actorPosition || !targetPosition) {
    return true;
  }

  const occupiedCells = new Set<string>();
  for (const unit of Object.values(state.units)) {
    const cell = toCell(unit);
    if (!cell || unit.hp <= 0) {
      continue;
    }
    if ((cell.q === actorPosition.q && cell.r === actorPosition.r) || (cell.q === targetPosition.q && cell.r === targetPosition.r)) {
      continue;
    }

    occupiedCells.add(toCellKey(cell.q, cell.r));
  }

  const los = new LineOfSight({
    getObstacle: (cell) => (occupiedCells.has(toCellKey(cell.q, cell.r)) ? 'hard' : 'none'),
    getCoverValue: () => 0,
  });
  los.setTurn(state.turn);
  return los.query(actorPosition, targetPosition).visible;
}

function toCell(unit: UnitState): { q: number; r: number } | undefined {
  if (unit.spatialRef) {
    return { q: unit.spatialRef.q, r: unit.spatialRef.r };
  }
  if (unit.position) {
    return { q: unit.position.x, r: unit.position.y };
  }
  return undefined;
}

function toCellKey(q: number, r: number): string {
  return `${q},${r}`;
}
