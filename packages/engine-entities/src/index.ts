import type { GridPoint } from "@tactical/engine-spatial";

export type EntityId = string;

export interface TacticalEntity {
  readonly id: EntityId;
  readonly archetype: string;
  readonly position: GridPoint;
}

export const createEntity = (
  id: EntityId,
  archetype: string,
  position: GridPoint
): TacticalEntity => ({
  id,
  archetype,
  position
});
