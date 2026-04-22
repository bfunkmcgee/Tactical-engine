export type CellRef = Readonly<{
  q: number;
  r: number;
}>;

export type DirectionRef = Readonly<{
  dq: number;
  dr: number;
}>;

export interface GridAdapter {
  readonly id: "square" | "hex";
  readonly directions: readonly DirectionRef[];

  neighbors(cell: CellRef): CellRef[];
  manhattanDistance(from: CellRef, to: CellRef): number;
  move(cell: CellRef, direction: DirectionRef): CellRef;
}

const SQUARE_DIRECTIONS: readonly DirectionRef[] = [
  { dq: 1, dr: 0 },
  { dq: -1, dr: 0 },
  { dq: 0, dr: 1 },
  { dq: 0, dr: -1 },
];

const HEX_AXIAL_DIRECTIONS: readonly DirectionRef[] = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

export class SquareGridAdapter implements GridAdapter {
  public readonly id = "square" as const;
  public readonly directions = SQUARE_DIRECTIONS;

  public neighbors(cell: CellRef): CellRef[] {
    return this.directions.map((direction) => this.move(cell, direction));
  }

  public manhattanDistance(from: CellRef, to: CellRef): number {
    return Math.abs(from.q - to.q) + Math.abs(from.r - to.r);
  }

  public move(cell: CellRef, direction: DirectionRef): CellRef {
    return { q: cell.q + direction.dq, r: cell.r + direction.dr };
  }
}

export class HexGridAdapter implements GridAdapter {
  public readonly id = "hex" as const;
  public readonly directions = HEX_AXIAL_DIRECTIONS;

  public neighbors(cell: CellRef): CellRef[] {
    return this.directions.map((direction) => this.move(cell, direction));
  }

  public manhattanDistance(from: CellRef, to: CellRef): number {
    const dq = from.q - to.q;
    const dr = from.r - to.r;
    const ds = -from.q - from.r - (-to.q - to.r);
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }

  public move(cell: CellRef, direction: DirectionRef): CellRef {
    return { q: cell.q + direction.dq, r: cell.r + direction.dr };
  }
}
