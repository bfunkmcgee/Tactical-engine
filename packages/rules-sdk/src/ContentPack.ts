export interface UnitDefinition {
  id: string;
  name: string;
  factionId: string;
  maxHealth: number;
  movement: number;
  attackRange: number;
  abilityIds: string[];
}

export interface AbilityCost {
  actionPoints?: number;
  health?: number;
}

export type AreaPattern = "single" | "line" | "cross" | "diamond" | "square";

export interface AreaOfEffectDefinition {
  pattern: AreaPattern;
  radius?: number;
}

export interface StatusApplicationDefinition {
  statusId: string;
  chance?: number;
  durationTurns?: number;
  stacks?: number;
}

export interface AbilityScalingDefinition {
  basedOn: "missingHealth" | "currentHealth" | "targetMaxHealth";
  ratio: number;
  maxBonus?: number;
}

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  damage?: number;
  range: number;
  target: "enemy" | "ally" | "self" | "tile";
  cost?: AbilityCost;
  cooldownTurns?: number;
  areaOfEffect?: AreaOfEffectDefinition;
  statusApplications?: StatusApplicationDefinition[];
  scaling?: AbilityScalingDefinition;
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
