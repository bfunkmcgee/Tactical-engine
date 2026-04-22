import { CellRef, GridAdapter } from "../grid/GridAdapter";

export interface PathfindingQuery {
  start: CellRef;
  goal: CellRef;
  moverId?: string;
}

export interface PathStep {
  cell: CellRef;
  costFromStart: number;
}

export interface PathResult {
  steps: PathStep[];
  totalCost: number;
  fromCache: boolean;
}

export interface PathfindingContext {
  isCellWalkable(cell: CellRef): boolean;
  getTerrainCost(cell: CellRef): number;
  getZoneOfControlPenalty(cell: CellRef, moverId?: string): number;
}

export class AStar {
  private readonly cache = new Map<string, PathResult>();
  private turnId = 0;
  private movementVersion = 0;
  private terrainVersion = 0;

  public constructor(
    private readonly grid: GridAdapter,
    private readonly context: PathfindingContext,
  ) {}

  public setTurn(turnId: number): void {
    if (turnId !== this.turnId) {
      this.turnId = turnId;
      this.cache.clear();
    }
  }

  public invalidateOnMovement(): void {
    this.movementVersion += 1;
    this.cache.clear();
  }

  public invalidateOnTerrainChange(): void {
    this.terrainVersion += 1;
    this.cache.clear();
  }

  public findPath(query: PathfindingQuery): PathResult | null {
    const cacheKey = this.toCacheKey(query);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const open: CellRef[] = [query.start];
    const cameFrom = new Map<string, CellRef>();
    const gScore = new Map<string, number>([[this.toCellKey(query.start), 0]]);
    const fScore = new Map<string, number>([
      [this.toCellKey(query.start), this.grid.manhattanDistance(query.start, query.goal)],
    ]);

    while (open.length > 0) {
      open.sort((a, b) => (fScore.get(this.toCellKey(a)) ?? Infinity) - (fScore.get(this.toCellKey(b)) ?? Infinity));
      const current = open.shift() as CellRef;
      const currentKey = this.toCellKey(current);

      if (current.q === query.goal.q && current.r === query.goal.r) {
        const built = this.buildPath(current, cameFrom, gScore);
        this.cache.set(cacheKey, built);
        return built;
      }

      for (const neighbor of this.grid.neighbors(current)) {
        if (!this.context.isCellWalkable(neighbor)) {
          continue;
        }

        const neighborKey = this.toCellKey(neighbor);
        const tentativeG =
          (gScore.get(currentKey) ?? Infinity) +
          this.context.getTerrainCost(neighbor) +
          this.context.getZoneOfControlPenalty(neighbor, query.moverId);

        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + this.grid.manhattanDistance(neighbor, query.goal));

          if (!open.some((cell) => cell.q === neighbor.q && cell.r === neighbor.r)) {
            open.push(neighbor);
          }
        }
      }
    }

    return null;
  }

  private buildPath(end: CellRef, cameFrom: Map<string, CellRef>, gScore: Map<string, number>): PathResult {
    const path: PathStep[] = [];
    let current: CellRef | undefined = end;

    while (current) {
      const currentKey = this.toCellKey(current);
      path.push({ cell: current, costFromStart: gScore.get(currentKey) ?? 0 });
      current = cameFrom.get(currentKey);
    }

    path.reverse();
    return {
      steps: path,
      totalCost: path[path.length - 1]?.costFromStart ?? 0,
      fromCache: false,
    };
  }

  private toCellKey(cell: CellRef): string {
    return `${cell.q},${cell.r}`;
  }

  private toCacheKey(query: PathfindingQuery): string {
    return [
      this.turnId,
      this.movementVersion,
      this.terrainVersion,
      this.toCellKey(query.start),
      this.toCellKey(query.goal),
      query.moverId ?? "",
    ].join("|");
  }
}
