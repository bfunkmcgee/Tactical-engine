import abilities from '../content/abilities.json';
import factions from '../content/factions.json';
import maps from '../content/maps.json';
import tiles from '../content/tiles.json';
import units from '../content/units.json';

import {
  AbilityDefinition,
  BattleState,
  ContentIndex,
  ContentPack,
  FactionDefinition,
  TileDefinition,
  UnitDefinition,
  createContentIndex,
  DamageResolution,
  Position,
  RuleSet,
  UnitId,
  VictoryResult,
  SimulationEvent,
} from 'rules-sdk';
import { type DamageEvent, type TurnStartEvent, type UnitDefeatedEvent } from 'rules-sdk/hooks';

const examplePack: ContentPack = {
  id: 'example-skirmish-pack',
  version: '1.1.0',
  units: units as UnitDefinition[],
  abilities: abilities as AbilityDefinition[],
  tiles: tiles as TileDefinition[],
  maps: maps as ContentPack['maps'],
  factions: factions as FactionDefinition[],
};

export const exampleContent = createContentIndex(examplePack);

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function interpolateLine(a: Position, b: Position): Position[] {
  const points: Position[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  if (steps <= 1) {
    return points;
  }

  for (let i = 1; i < steps; i += 1) {
    points.push({
      x: Math.round(a.x + (dx * i) / steps),
      y: Math.round(a.y + (dy * i) / steps),
    });
  }

  return points;
}

function deterministicProc(turn: number, sourceUnitId: string, targetUnitId: string, seed: string, chance: number): boolean {
  if (chance >= 1) return true;
  if (chance <= 0) return false;

  const input = `${turn}:${sourceUnitId}:${targetUnitId}:${seed}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 10000;
  }

  return hash / 10000 < chance;
}

export class ExampleRuleSet implements RuleSet {
  readonly id = 'example-skirmish-rules';

  canMove(state: BattleState, unitId: UnitId, to: Position, content: ContentIndex): boolean {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit?.position || !unit.definitionId) return false;

    const definition = content.units[unit.definitionId];
    if (!definition) return false;

    const map = content.maps[state.mapId];
    if (!map || to.x < 0 || to.x >= map.width || to.y < 0 || to.y >= map.height) return false;

    const destinationTile = this.getTileAtPosition(to, state, content);
    const distance = manhattanDistance(unit.position, to);
    const travelCost = Math.max(0, distance - 1) + (destinationTile?.movementCost ?? 1);

    return travelCost <= definition.movement;
  }

  canTarget(
    state: BattleState,
    sourceUnitId: UnitId,
    targetUnitId: UnitId,
    abilityId: string,
    content: ContentIndex,
  ): boolean {
    const source = state.units.find((unit) => unit.id === sourceUnitId);
    const target = state.units.find((unit) => unit.id === targetUnitId);
    const ability = content.abilities[abilityId];

    if (!source?.position || !target?.position || !ability) return false;
    if (this.violatesTargetRule(source.teamId, target.teamId, source.id, target.id, ability.target)) return false;

    if ((source.cooldowns?.[abilityId] ?? 0) > 0) {
      return false;
    }

    const actionPointCost = ability.cost?.actionPoints ?? 0;
    if ((source.actionPoints ?? Number.POSITIVE_INFINITY) < actionPointCost) {
      return false;
    }

    const healthCost = ability.cost?.health ?? 0;
    if (source.health <= healthCost) {
      return false;
    }

    const radius = Math.max(0, ability.areaOfEffect?.radius ?? 0);
    const effectiveRange = ability.range + radius;

    return (
      manhattanDistance(source.position, target.position) <= effectiveRange &&
      this.hasLineOfSight(source.position, target.position, state, content)
    );
  }

  resolveDamage(
    state: BattleState,
    sourceUnitId: UnitId,
    targetUnitId: UnitId,
    abilityId: string,
    content: ContentIndex,
  ): DamageResolution {
    const source = state.units.find((unit) => unit.id === sourceUnitId);
    const target = state.units.find((unit) => unit.id === targetUnitId);
    const ability = content.abilities[abilityId];

    if (!target || !source || !ability?.damage) {
      return { amount: 0, defeated: false };
    }

    const scalingBonus = this.resolveScalingBonus(ability, source, target);
    const aoeMultiplier = this.resolveAreaMultiplier(ability, source.position, target.position);
    const defenseBonus = this.getTileAtPosition(target.position, state, content)?.defenseBonus ?? 0;

    const mitigated = Math.max(0, Math.round((ability.damage + scalingBonus) * aoeMultiplier) - defenseBonus);
    const amount = mitigated;
    const defeated = target.health - amount <= 0;

    return {
      amount,
      defeated,
      appliedStatusEffectIds: this.rollStatusApplications(state, source.id, target.id, ability),
      appliedCooldownTurns: ability.cooldownTurns,
    };
  }

  applyStatusEffects(state: BattleState, _content: ContentIndex): BattleState {
    return {
      ...state,
      units: state.units.map((unit) => {
        const nextCooldowns = Object.entries(unit.cooldowns ?? {}).reduce<Record<string, number>>((acc, [abilityId, turns]) => {
          const nextTurns = Math.max(0, turns - 1);
          if (nextTurns > 0) {
            acc[abilityId] = nextTurns;
          }
          return acc;
        }, {});

        let healthDelta = 0;
        const nextEffects = (unit.activeEffects ?? []).flatMap((effect) => {
          const dot = /^dot:(\d+)$/u.exec(effect.effectId);
          if (dot) {
            healthDelta -= Number(dot[1]);
            return effect.duration > 1
              ? [
                  {
                    ...effect,
                    duration: effect.duration - 1,
                  },
                ]
              : [];
          }

          const regen = /^regen:(\d+)$/u.exec(effect.effectId);
          if (regen) {
            healthDelta += Number(regen[1]);
            return effect.duration > 1
              ? [
                  {
                    ...effect,
                    duration: effect.duration - 1,
                  },
                ]
              : [];
          }

          return effect.duration > 1
            ? [
                {
                  ...effect,
                  duration: effect.duration - 1,
                },
              ]
            : [];
        });

        const maxHealth = unit.maxHealth ?? unit.health;
        const nextHealth = Math.max(0, Math.min(maxHealth, unit.health + healthDelta));

        return {
          ...unit,
          health: nextHealth,
          cooldowns: Object.keys(nextCooldowns).length > 0 ? nextCooldowns : undefined,
          activeEffects: nextEffects.length > 0 ? nextEffects : undefined,
        };
      }),
    };
  }

  checkVictory(state: BattleState, _content: ContentIndex): VictoryResult | null {
    const teamsWithUnits = new Set(state.units.filter((unit) => unit.health > 0).map((unit) => unit.teamId));

    if (teamsWithUnits.size > 1) return null;

    const [winnerTeamId] = [...teamsWithUnits];
    return winnerTeamId ? { winnerTeamId } : { isDraw: true };
  }


  toEngineEvents(event: TurnStartEvent | DamageEvent | UnitDefeatedEvent): SimulationEvent[] {
    if ('unitIds' in event) {
      return [
        {
          kind: 'TURN_STARTED',
          actorId: event.activeTeamId,
          turn: event.turn,
          round: 1,
        },
      ];
    }

    if ('amount' in event) {
      return [
        {
          kind: 'UNIT_DAMAGED',
          sourceId: event.activeTeamId,
          sourceUnitId: event.sourceUnitId,
          targetId: event.targetUnitId,
          amount: event.amount,
          abilityId: event.abilityId,
          turn: event.turn,
          round: 1,
        },
      ];
    }

    return [
      {
        kind: 'UNIT_DEFEATED',
        sourceId: event.activeTeamId,
        sourceUnitId: event.sourceUnitId,
        targetId: event.unitId,
        turn: event.turn,
        round: 1,
      },
    ];
  }

  onTurnStart(event: TurnStartEvent): void {
    void event;
  }

  onDamage(event: DamageEvent): void {
    void event;
  }

  onUnitDefeated(event: UnitDefeatedEvent): void {
    void event;
  }

  private getTileAtPosition(position: Position | undefined, state: BattleState, content: ContentIndex): TileDefinition | undefined {
    if (!position) return undefined;
    const map = content.maps[state.mapId];
    if (!map) return undefined;

    const index = position.y * map.width + position.x;
    const tileId = map.tiles[index];

    if (!tileId) return undefined;
    return content.tiles[tileId];
  }

  private hasLineOfSight(from: Position, to: Position, state: BattleState, content: ContentIndex): boolean {
    const map = content.maps[state.mapId];
    if (!map) return false;

    return interpolateLine(from, to).every((point) => {
      const tile = this.getTileAtPosition(point, state, content);
      return !tile?.blocksLineOfSight;
    });
  }

  private resolveScalingBonus(
    ability: AbilityDefinition,
    source: BattleState['units'][number],
    target: BattleState['units'][number],
  ): number {
    if (!ability.scaling) {
      return 0;
    }

    let base = 0;
    if (ability.scaling.basedOn === 'missingHealth') {
      base = Math.max(0, (source.maxHealth ?? source.health) - source.health);
    } else if (ability.scaling.basedOn === 'currentHealth') {
      base = source.health;
    } else if (ability.scaling.basedOn === 'targetMaxHealth') {
      base = target.maxHealth ?? target.health;
    }

    const unbounded = Math.floor(base * ability.scaling.ratio);
    if (ability.scaling.maxBonus === undefined) {
      return unbounded;
    }

    return Math.min(ability.scaling.maxBonus, unbounded);
  }

  private resolveAreaMultiplier(ability: AbilityDefinition, source?: Position, target?: Position): number {
    const radius = ability.areaOfEffect?.radius ?? 0;
    if (radius <= 0 || !source || !target || ability.areaOfEffect?.pattern === 'single') {
      return 1;
    }

    const distance = manhattanDistance(source, target);
    if (distance <= ability.range) {
      return 1;
    }

    const overflow = distance - ability.range;
    return Math.max(0.25, 1 - overflow / (radius + 1));
  }

  private rollStatusApplications(
    state: BattleState,
    sourceUnitId: string,
    targetUnitId: string,
    ability: AbilityDefinition,
  ): string[] {
    const applications = ability.statusApplications ?? [];
    return applications.flatMap((application) => {
      const chance = application.chance ?? 1;
      const turns = Math.max(1, application.durationTurns ?? 1);
      const stacks = Math.max(1, application.stacks ?? 1);
      const didProc = deterministicProc(state.turn, sourceUnitId, targetUnitId, `${ability.id}:${application.statusId}`, chance);

      if (!didProc) {
        return [];
      }

      return Array.from({ length: stacks }, () => `${application.statusId}:${turns}`);
    });
  }

  private violatesTargetRule(
    sourceTeamId: string,
    targetTeamId: string,
    sourceUnitId: string,
    targetUnitId: string,
    targetRule: AbilityDefinition['target'],
  ): boolean {
    if (targetRule === 'self') {
      return sourceUnitId !== targetUnitId;
    }

    if (targetRule === 'ally') {
      return sourceTeamId !== targetTeamId;
    }

    if (targetRule === 'enemy') {
      return sourceTeamId === targetTeamId;
    }

    return false;
  }
}
