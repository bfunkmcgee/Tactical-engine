import type { TacticalEntity } from "@tactical/engine-entities";

export type SnapshotMessage = {
  readonly tick: number;
  readonly entities: readonly TacticalEntity[];
};

export const serializeSnapshot = (snapshot: SnapshotMessage): string => JSON.stringify(snapshot);
