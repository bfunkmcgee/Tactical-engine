export interface UnitDefinition {
  id: string;
  name: string;
  factionId: string;
  maxHealth: number;
  movement: number;
  attackRange: number;
  abilityIds: string[];
}

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  damage?: number;
  range: number;
  target: "enemy" | "ally" | "self" | "tile";
  statusEffectIds?: string[];
}

export interface TileDefinition {
  id: string;
  name: string;
  movementCost: number;
  blocksLineOfSight?: boolean;
  defenseBonus?: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: string[];
}

export interface FactionDefinition {
  id: string;
  name: string;
  unitIds: string[];
}

export interface ContentPack {
  id: string;
  version: string;
  units: UnitDefinition[];
  abilities: AbilityDefinition[];
  tiles: TileDefinition[];
  maps: MapDefinition[];
  factions: FactionDefinition[];
}

/**
 * JSON schema-like metadata for ContentPack validation in loaders/tools.
 */
export const CONTENT_PACK_SCHEMA = {
  type: "object",
  required: ["id", "version", "units", "abilities", "tiles", "maps", "factions"],
  properties: {
    id: { type: "string" },
    version: { type: "string" },
    units: { type: "array" },
    abilities: { type: "array" },
    tiles: { type: "array" },
    maps: { type: "array" },
    factions: { type: "array" },
  },
} as const;
