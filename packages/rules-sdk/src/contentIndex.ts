import type {
  AbilityDefinition,
  ContentPack,
  FactionDefinition,
  MapDefinition,
  TileDefinition,
  UnitDefinition,
} from "./ContentPack";

type ById<T extends { id: string }> = Record<string, T>;

function toById<T extends { id: string }>(items: T[]): ById<T> {
  return items.reduce<ById<T>>((acc, item) => {
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
    units: toById(pack.units),
    abilities: toById(pack.abilities),
    tiles: toById(pack.tiles),
    maps: toById(pack.maps),
    factions: toById(pack.factions),
  };
}
