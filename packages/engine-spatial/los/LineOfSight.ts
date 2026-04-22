import { CellRef } from "../grid/GridAdapter";

export type ObstacleType = "none" | "soft" | "hard";

export interface LineOfSightContext {
  getObstacle(cell: CellRef): ObstacleType;
  getCoverValue(cell: CellRef): number;
}

export interface LineOfSightResult {
  visible: boolean;
  cover: number;
  blockedAt?: CellRef;
  fromCache: boolean;
}

export class LineOfSight {
  private readonly cache = new Map<string, LineOfSightResult>();
  private turnId = 0;
  private movementVersion = 0;
  private terrainVersion = 0;

  public constructor(private readonly context: LineOfSightContext) {}

  public setTurn(turnId: number): void {
    if (this.turnId !== turnId) {
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

  public query(source: CellRef, target: CellRef): LineOfSightResult {
    const cacheKey = this.toCacheKey(source, target);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const samples = this.trace(source, target);
    let cover = 0;

    for (const sample of samples) {
      const obstacle = this.context.getObstacle(sample);
      if (obstacle === "hard") {
        const result: LineOfSightResult = {
          visible: false,
          cover,
          blockedAt: sample,
          fromCache: false,
        };
        this.cache.set(cacheKey, result);
        return result;
      }

      if (obstacle === "soft") {
        cover += this.context.getCoverValue(sample);
      }
    }

    const result: LineOfSightResult = { visible: true, cover, fromCache: false };
    this.cache.set(cacheKey, result);
    return result;
  }

  private trace(source: CellRef, target: CellRef): CellRef[] {
    const line: CellRef[] = [];
    const dq = target.q - source.q;
    const dr = target.r - source.r;
    const steps = Math.max(Math.abs(dq), Math.abs(dr));

    if (steps === 0) {
      return line;
    }

    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      line.push({
        q: Math.round(source.q + dq * t),
        r: Math.round(source.r + dr * t),
      });
    }

    return line;
  }

  private toCacheKey(source: CellRef, target: CellRef): string {
    return [
      this.turnId,
      this.movementVersion,
      this.terrainVersion,
      source.q,
      source.r,
      target.q,
      target.r,
    ].join("|");
  }
}
