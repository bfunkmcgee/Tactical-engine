import type {
  AbilityDefinition,
  ContentPack,
  FactionDefinition,
  MapDefinition,
  TileDefinition,
  UnitDefinition,
} from './ContentPack';
import { ERROR_CATEGORIES, ERROR_CODES, RulesSdkError } from './errors';

export type ById<T extends { id: string }> = Readonly<Record<string, Readonly<T>>>;

function toById<T extends { id: string }>(kind: string, items: readonly T[]): ById<T> {
  const seen = new Set<string>();

  const byId = items.reduce<Record<string, Readonly<T>>>((acc, item) => {
    if (seen.has(item.id)) {
      throw new RulesSdkError(`Duplicate ${kind} id detected in content pack: ${item.id}`, {
        code: ERROR_CODES.CONTENT_INDEX_DUPLICATE_ID,
        category: ERROR_CATEGORIES.VALIDATION,
        metadata: {
          kind,
          id: item.id,
        },
      });
    }

    seen.add(item.id);
    acc[item.id] = Object.freeze({ ...item });
    return acc;
  }, {});

  return Object.freeze(byId);
}

export interface ContentIndex {
  readonly units: ById<UnitDefinition>;
  readonly abilities: ById<AbilityDefinition>;
  readonly tiles: ById<TileDefinition>;
  readonly maps: ById<MapDefinition>;
  readonly factions: ById<FactionDefinition>;
}

export function createContentIndex(pack: ContentPack): ContentIndex {
  return Object.freeze({
    units: toById('unit', pack.units),
    abilities: toById('ability', pack.abilities),
    tiles: toById('tile', pack.tiles),
    maps: toById('map', pack.maps),
    factions: toById('faction', pack.factions),
  });
}
