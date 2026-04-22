export type GridPoint = {
  readonly x: number;
  readonly y: number;
};

export const manhattanDistance = (origin: GridPoint, destination: GridPoint): number =>
  Math.abs(origin.x - destination.x) + Math.abs(origin.y - destination.y);
