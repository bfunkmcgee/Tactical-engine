import { CellRef, GridAdapter } from "../grid/GridAdapter";

export type ShapeMask = (offset: CellRef) => boolean;

export interface TargetingSpec {
  origin: CellRef;
  minRange: number;
  maxRange: number;
  aoePattern: ReadonlyArray<CellRef>;
  shapeMask?: ShapeMask;
}

export interface TargetCell {
  target: CellRef;
  affectedCells: CellRef[];
}

export class Targeting {
  public constructor(private readonly grid: GridAdapter) {}

  public getTargetCells(spec: TargetingSpec): TargetCell[] {
    const inRange: CellRef[] = [];

    for (let dq = -spec.maxRange; dq <= spec.maxRange; dq += 1) {
      for (let dr = -spec.maxRange; dr <= spec.maxRange; dr += 1) {
        const offset = { q: dq, r: dr };
        const distance = this.grid.manhattanDistance({ q: 0, r: 0 }, offset);
        if (distance < spec.minRange || distance > spec.maxRange) {
          continue;
        }

        if (spec.shapeMask && !spec.shapeMask(offset)) {
          continue;
        }

        inRange.push({ q: spec.origin.q + dq, r: spec.origin.r + dr });
      }
    }

    return inRange.map((target) => ({
      target,
      affectedCells: spec.aoePattern.map((patternOffset) => ({
        q: target.q + patternOffset.q,
        r: target.r + patternOffset.r,
      })),
    }));
  }
}

export const CIRCLE_MASK: ShapeMask = (offset) => {
  const magnitudeSquared = offset.q * offset.q + offset.r * offset.r;
  return magnitudeSquared <= 25;
};

export const CONE_MASK: ShapeMask = (offset) => offset.q >= 0 && Math.abs(offset.r) <= offset.q;

export const DIAMOND_AOE: ReadonlyArray<CellRef> = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
];
