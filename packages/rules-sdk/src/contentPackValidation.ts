import type {
  AbilityDefinition,
  ContentPack,
  FactionDefinition,
  MapDefinition,
  TileDefinition,
  UnitDefinition,
} from './ContentPack';
import {
  ERROR_CATEGORIES,
  ERROR_CODES,
  RulesSdkError,
  type DiagnosticPayload,
} from './errors';

const ABILITY_TARGETS = new Set<AbilityDefinition['target']>(['enemy', 'ally', 'self', 'tile']);
const AREA_PATTERNS = new Set<NonNullable<AbilityDefinition['areaOfEffect']>['pattern']>([
  'single',
  'line',
  'cross',
  'diamond',
  'square',
]);
const SCALING_BASES = new Set<NonNullable<AbilityDefinition['scaling']>['basedOn']>([
  'missingHealth',
  'currentHealth',
  'targetMaxHealth',
]);

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ContentPackValidationError extends RulesSdkError {
  readonly issues: ValidationIssue[];
  readonly diagnostics: readonly DiagnosticPayload[];

  constructor(sourceLabel: string, issues: ValidationIssue[]) {
    super(
      `Invalid content pack at ${sourceLabel} (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`,
      {
        category: ERROR_CATEGORIES.VALIDATION,
        code: ERROR_CODES.CONTENT_PACK_INVALID,
        metadata: {
          sourceLabel,
          issueCount: issues.length,
        },
      },
    );
    this.issues = issues;
    this.diagnostics = issues.map((issue) => ({
      category: ERROR_CATEGORIES.VALIDATION,
      code: ERROR_CODES.CONTENT_PACK_INVALID,
      message: issue.message,
      metadata: {
        sourceLabel,
        path: issue.path,
      },
    }));
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ path, message: 'must be a non-empty string' });
    return false;
  }

  return true;
}

function validateNumber(value: unknown, path: string, issues: ValidationIssue[], minimum = 0): value is number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < minimum) {
    issues.push({ path, message: `must be a number >= ${minimum}` });
    return false;
  }

  return true;
}

function validateInteger(value: unknown, path: string, issues: ValidationIssue[], minimum = 0): value is number {
  if (!validateNumber(value, path, issues, minimum)) {
    return false;
  }

  if (!Number.isInteger(value)) {
    issues.push({ path, message: `must be an integer >= ${minimum}` });
    return false;
  }

  return true;
}

function validateCollectionIds<T extends { id: string }>(
  items: T[],
  collectionPath: string,
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>();

  items.forEach((item, index) => {
    const idPath = `${collectionPath}[${index}].id`;
    if (!validateNonEmptyString(item.id, idPath, issues)) {
      return;
    }

    if (ids.has(item.id)) {
      issues.push({ path: idPath, message: `duplicate id '${item.id}'` });
      return;
    }

    ids.add(item.id);
  });

  return ids;
}

export function validateContentPack(content: unknown, sourceLabel = 'content pack'): asserts content is ContentPack {
  const issues: ValidationIssue[] = [];

  if (!isObject(content)) {
    throw new ContentPackValidationError(sourceLabel, [{ path: '$', message: 'must be an object' }]);
  }

  validateNonEmptyString(content.id, 'id', issues);
  validateNonEmptyString(content.version, 'version', issues);

  const unitsRaw = content.units;
  const abilitiesRaw = content.abilities;
  const tilesRaw = content.tiles;
  const mapsRaw = content.maps;
  const factionsRaw = content.factions;

  const units: UnitDefinition[] = Array.isArray(unitsRaw) ? (unitsRaw as UnitDefinition[]) : [];
  const abilities: AbilityDefinition[] = Array.isArray(abilitiesRaw) ? (abilitiesRaw as AbilityDefinition[]) : [];
  const tiles: TileDefinition[] = Array.isArray(tilesRaw) ? (tilesRaw as TileDefinition[]) : [];
  const maps: MapDefinition[] = Array.isArray(mapsRaw) ? (mapsRaw as MapDefinition[]) : [];
  const factions: FactionDefinition[] = Array.isArray(factionsRaw) ? (factionsRaw as FactionDefinition[]) : [];

  if (!Array.isArray(unitsRaw)) issues.push({ path: 'units', message: 'must be an array' });
  if (!Array.isArray(abilitiesRaw)) issues.push({ path: 'abilities', message: 'must be an array' });
  if (!Array.isArray(tilesRaw)) issues.push({ path: 'tiles', message: 'must be an array' });
  if (!Array.isArray(mapsRaw)) issues.push({ path: 'maps', message: 'must be an array' });
  if (!Array.isArray(factionsRaw)) issues.push({ path: 'factions', message: 'must be an array' });

  const unitIds = validateCollectionIds(units, 'units', issues);
  const abilityIds = validateCollectionIds(abilities, 'abilities', issues);
  const tileIds = validateCollectionIds(tiles, 'tiles', issues);
  validateCollectionIds(maps, 'maps', issues);
  const factionIds = validateCollectionIds(factions, 'factions', issues);

  units.forEach((unit, index) => {
    const path = `units[${index}]`;
    if (!isObject(unit)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }

    validateNonEmptyString(unit.name, `${path}.name`, issues);
    validateNonEmptyString(unit.factionId, `${path}.factionId`, issues);
    validateNumber(unit.maxHealth, `${path}.maxHealth`, issues, 1);
    validateNumber(unit.movement, `${path}.movement`, issues, 0);
    validateNumber(unit.attackRange, `${path}.attackRange`, issues, 0);

    if (!Array.isArray(unit.abilityIds)) {
      issues.push({ path: `${path}.abilityIds`, message: 'must be an array of ability ids' });
      return;
    }

    unit.abilityIds.forEach((abilityId, abilityIndex) => {
      const abilityPath = `${path}.abilityIds[${abilityIndex}]`;
      if (!validateNonEmptyString(abilityId, abilityPath, issues)) {
        return;
      }

      if (!abilityIds.has(abilityId)) {
        issues.push({
          path: abilityPath,
          message: `references missing ability '${abilityId}' for unit '${unit.id}'`,
        });
      }
    });

    if (typeof unit.factionId === 'string' && !factionIds.has(unit.factionId)) {
      issues.push({
        path: `${path}.factionId`,
        message: `references missing faction '${unit.factionId}' for unit '${unit.id}'`,
      });
    }
  });

  abilities.forEach((ability, index) => {
    const path = `abilities[${index}]`;
    if (!isObject(ability)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }

    validateNonEmptyString(ability.name, `${path}.name`, issues);
    validateNonEmptyString(ability.description, `${path}.description`, issues);
    validateNumber(ability.range, `${path}.range`, issues, 0);

    if (!ABILITY_TARGETS.has(ability.target)) {
      issues.push({
        path: `${path}.target`,
        message: `must be one of ${Array.from(ABILITY_TARGETS).join(', ')}`,
      });
    }

    if (ability.areaOfEffect) {
      if (!AREA_PATTERNS.has(ability.areaOfEffect.pattern)) {
        issues.push({
          path: `${path}.areaOfEffect.pattern`,
          message: `must be one of ${Array.from(AREA_PATTERNS).join(', ')}`,
        });
      }

      if (ability.areaOfEffect.radius !== undefined) {
        validateNumber(ability.areaOfEffect.radius, `${path}.areaOfEffect.radius`, issues, 0);
      }
    }

    if (ability.cost !== undefined) {
      if (!isObject(ability.cost)) {
        issues.push({ path: `${path}.cost`, message: 'must be an object' });
      } else {
        if (ability.cost.actionPoints !== undefined) {
          validateNumber(ability.cost.actionPoints, `${path}.cost.actionPoints`, issues, 0);
        }
        if (ability.cost.health !== undefined) {
          validateNumber(ability.cost.health, `${path}.cost.health`, issues, 0);
        }
      }
    }

    if (ability.cooldownTurns !== undefined) {
      validateInteger(ability.cooldownTurns, `${path}.cooldownTurns`, issues, 0);
    }

    if (ability.statusApplications !== undefined) {
      if (!Array.isArray(ability.statusApplications)) {
        issues.push({ path: `${path}.statusApplications`, message: 'must be an array' });
      } else {
        ability.statusApplications.forEach((statusApplication, statusIndex) => {
          const statusPath = `${path}.statusApplications[${statusIndex}]`;
          if (!isObject(statusApplication)) {
            issues.push({ path: statusPath, message: 'must be an object' });
            return;
          }

          validateNonEmptyString(statusApplication.statusId, `${statusPath}.statusId`, issues);

          if (statusApplication.chance !== undefined) {
            const chancePath = `${statusPath}.chance`;
            if (validateNumber(statusApplication.chance, chancePath, issues, 0) && statusApplication.chance > 1) {
              issues.push({ path: chancePath, message: 'must be a number <= 1' });
            }
          }

          if (statusApplication.durationTurns !== undefined) {
            validateInteger(statusApplication.durationTurns, `${statusPath}.durationTurns`, issues, 1);
          }

          if (statusApplication.stacks !== undefined) {
            validateInteger(statusApplication.stacks, `${statusPath}.stacks`, issues, 1);
          }
        });
      }
    }

    if (ability.scaling) {
      if (!SCALING_BASES.has(ability.scaling.basedOn)) {
        issues.push({
          path: `${path}.scaling.basedOn`,
          message: `must be one of ${Array.from(SCALING_BASES).join(', ')}`,
        });
      }
      validateNumber(ability.scaling.ratio, `${path}.scaling.ratio`, issues, 0);
      if (ability.scaling.maxBonus !== undefined) {
        validateNumber(ability.scaling.maxBonus, `${path}.scaling.maxBonus`, issues, 0);
      }
    }
  });

  tiles.forEach((tile, index) => {
    const path = `tiles[${index}]`;
    if (!isObject(tile)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }

    validateNonEmptyString(tile.name, `${path}.name`, issues);
    validateNumber(tile.movementCost, `${path}.movementCost`, issues, 0);
    if (tile.defenseBonus !== undefined) {
      validateNumber(tile.defenseBonus, `${path}.defenseBonus`, issues, 0);
    }
  });

  maps.forEach((map, index) => {
    const path = `maps[${index}]`;
    if (!isObject(map)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }

    validateNonEmptyString(map.name, `${path}.name`, issues);
    const widthOk = validateNumber(map.width, `${path}.width`, issues, 1);
    const heightOk = validateNumber(map.height, `${path}.height`, issues, 1);

    if (!Array.isArray(map.tiles)) {
      issues.push({ path: `${path}.tiles`, message: 'must be an array of tile ids' });
    } else {
      map.tiles.forEach((tileId, tileIndex) => {
        const tilePath = `${path}.tiles[${tileIndex}]`;
        if (!validateNonEmptyString(tileId, tilePath, issues)) {
          return;
        }

        if (!tileIds.has(tileId)) {
          issues.push({ path: tilePath, message: `references missing tile '${tileId}' in map '${map.id}'` });
        }
      });

      if (widthOk && heightOk && map.tiles.length !== map.width * map.height) {
        issues.push({
          path: `${path}.tiles`,
          message: `must have exactly width*height entries (${map.width * map.height}), got ${map.tiles.length} in map '${map.id}'`,
        });
      }
    }
  });

  factions.forEach((faction, index) => {
    const path = `factions[${index}]`;
    if (!isObject(faction)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }

    validateNonEmptyString(faction.name, `${path}.name`, issues);

    if (!Array.isArray(faction.unitIds)) {
      issues.push({ path: `${path}.unitIds`, message: 'must be an array of unit ids' });
      return;
    }

    faction.unitIds.forEach((unitId, unitIndex) => {
      const unitPath = `${path}.unitIds[${unitIndex}]`;
      if (!validateNonEmptyString(unitId, unitPath, issues)) {
        return;
      }

      if (!unitIds.has(unitId)) {
        issues.push({ path: unitPath, message: `references missing unit '${unitId}' in faction '${faction.id}'` });
        return;
      }

      const unit = units.find((candidate) => candidate.id === unitId);
      if (unit && unit.factionId !== faction.id) {
        issues.push({
          path: unitPath,
          message: `unit '${unitId}' declares factionId '${unit.factionId}', expected '${faction.id}'`,
        });
      }
    });
  });


  if (issues.length > 0) {
    throw new ContentPackValidationError(sourceLabel, issues);
  }
}
