import abilities from "../content/abilities.json";
import tiles from "../content/tiles.json";
import units from "../content/units.json";

import {
  BattleState,
  ContentIndex,
  ContentPack,
  createContentIndex,
  DamageResolution,
  Position,
  RuleSet,
  VictoryResult,
} from "../../../packages/rules-sdk/src";
import { DamageEvent, TurnStartEvent, UnitDefeatedEvent } from "../../../packages/rules-sdk/src/hooks";

const examplePack: ContentPack = {
  id: "example-skirmish-pack",
  version: "1.0.0",
  units,
  abilities,
  tiles,
  maps: [
    {
      id: "example_arena",
      name: "Example Arena",
      width: 8,
      height: 8,
      tiles: Array(64).fill("plains"),
    },
  ],
  factions: [
    { id: "alliance", name: "Alliance", unitIds: ["infantry", "sniper"] },
    { id: "raiders", name: "Raiders", unitIds: ["infantry"] },
  ],
};

export const exampleContent = createContentIndex(examplePack);

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export class ExampleRuleSet implements RuleSet {
  readonly id = "example-skirmish-rules";

  canMove(state: BattleState, unitId: string, to: Position, content: ContentIndex): boolean {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return false;

    const definition = content.units[unit.definitionId];
    if (!definition) return false;

    const distance = manhattanDistance(unit.position, to);
    return distance <= definition.movement;
  }

  canTarget(
    state: BattleState,
    sourceUnitId: string,
    targetUnitId: string,
    abilityId: string,
    content: ContentIndex,
  ): boolean {
    const source = state.units.find((u) => u.id === sourceUnitId);
    const target = state.units.find((u) => u.id === targetUnitId);
    const ability = content.abilities[abilityId];

    if (!source || !target || !ability) return false;
    if (source.teamId === target.teamId && ability.target === "enemy") return false;

    return manhattanDistance(source.position, target.position) <= ability.range;
  }

  resolveDamage(
    state: BattleState,
    _sourceUnitId: string,
    targetUnitId: string,
    abilityId: string,
    content: ContentIndex,
  ): DamageResolution {
    const target = state.units.find((u) => u.id === targetUnitId);
    const ability = content.abilities[abilityId];

    if (!target || !ability?.damage) {
      return { amount: 0, defeated: false };
    }

    const amount = ability.damage;
    const defeated = target.health - amount <= 0;

    return { amount, defeated };
  }

  applyStatusEffects(state: BattleState, _content: ContentIndex): BattleState {
    return {
      ...state,
      units: state.units.map((unit) => ({
        ...unit,
        statusEffectIds: unit.statusEffectIds.filter((status) => status !== "expired"),
      })),
    };
  }

  checkVictory(state: BattleState, _content: ContentIndex): VictoryResult | null {
    const teamsWithUnits = new Set(
      state.units.filter((unit) => unit.health > 0).map((unit) => unit.teamId),
    );

    if (teamsWithUnits.size > 1) return null;

    const [winnerTeamId] = [...teamsWithUnits];
    return winnerTeamId ? { winnerTeamId } : { isDraw: true };
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
}
