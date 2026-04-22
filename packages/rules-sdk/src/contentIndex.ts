import type {
  AbilityDefinition,
  ContentPack,
  FactionDefinition,
  MapDefinition,
  TileDefinition,
  UnitDefinition,
} from "./ContentPack";

type ById<T extends { id: string }> = Record<string, T>;

function toById<T extends { id: string }>(kind: string, items: T[]): ById<T> {
  const seen = new Set<string>();

  return items.reduce<ById<T>>((acc, item) => {
    if (seen.has(item.id)) {
      throw new Error(`Duplicate ${kind} id detected in content pack: ${item.id}`);
    }

    seen.add(item.id);
    acc[item.id] = item;
    return acc;
  }, {});
}

export interface ContentIndex {
  units: ById<UnitDefinition>;
  abilities: ById<AbilityDefinition>;
  tiles: ById<TileDefinition>;
  maps: ById<MapDefinition>;
  factions: ById<FactionDefinition>;
}

export function createContentIndex(pack: ContentPack): ContentIndex {
  return {
    units: toById("unit", pack.units),
    abilities: toById("ability", pack.abilities),
    tiles: toById("tile", pack.tiles),
    maps: toById("map", pack.maps),
    factions: toById("faction", pack.factions),
  };
}
