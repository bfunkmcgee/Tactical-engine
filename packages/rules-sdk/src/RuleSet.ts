import type { ContentIndex } from "./contentIndex";
import type { RuleHooks, TeamId, UnitId } from "./hooks";

export interface Position {
  x: number;
  y: number;
}

export interface BattleUnit {
  id: UnitId;
  definitionId: string;
  teamId: TeamId;
  health: number;
  position: Position;
  statusEffectIds: string[];
}

export interface BattleState {
  turn: number;
  activeTeamId: TeamId;
  units: BattleUnit[];
  mapId: string;
}

export interface DamageResolution {
  amount: number;
  defeated: boolean;
}

export interface VictoryResult {
  winnerTeamId?: TeamId;
  isDraw?: boolean;
}

export interface RuleSet extends RuleHooks {
  readonly id: string;

  canMove(state: BattleState, unitId: UnitId, to: Position, content: ContentIndex): boolean;

  canTarget(
    state: BattleState,
    sourceUnitId: UnitId,
    targetUnitId: UnitId,
    abilityId: string,
    content: ContentIndex,
  ): boolean;

  resolveDamage(
    state: BattleState,
    sourceUnitId: UnitId,
    targetUnitId: UnitId,
    abilityId: string,
    content: ContentIndex,
  ): DamageResolution;

  applyStatusEffects(state: BattleState, content: ContentIndex): BattleState;

  checkVictory(state: BattleState, content: ContentIndex): VictoryResult | null;
}
