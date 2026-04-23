import type { Position, RuleEvaluationState, TeamId, UnitId } from 'engine-core';
import type { ContentIndex } from './contentIndex';
import type { RuleHooks } from './hooks';

export type BattleState = RuleEvaluationState;

export interface DamageResolution {
  amount: number;
  defeated: boolean;
  appliedStatusEffectIds?: string[];
  appliedCooldownTurns?: number;
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
