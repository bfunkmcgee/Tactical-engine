import type { ContentIndex, DamageResolution, RuleSet, VictoryResult } from 'rules-sdk';
import { toRuleEvaluationState, type Action, type GameState, type UnitState } from '../state/GameState';

export interface RuleAttackResolution {
  readonly amount: number;
  readonly defeated: boolean;
  readonly abilityId?: string;
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly appliedStatusEffectIds: readonly string[];
  readonly appliedCooldownTurns?: number;
}

export interface RuleActionAdapter {
  resolveAttack(state: GameState, action: Action, actorUnit: UnitState, targetUnit: UnitState): RuleAttackResolution | undefined;
}

export interface MatchOutcome {
  readonly winnerTeamId?: string;
  readonly isDraw: boolean;
}

export interface MatchOutcomeEvaluator {
  evaluate(state: GameState): MatchOutcome | null;
}

export interface RulesSdkActionAdapterOptions {
  readonly ruleSet: RuleSet;
  readonly content: ContentIndex;
  readonly mapId: string;
  readonly defaultAttackAbilityId?: string;
}

export class RulesSdkActionAdapter implements RuleActionAdapter {
  private readonly options: RulesSdkActionAdapterOptions;

  constructor(options: RulesSdkActionAdapterOptions) {
    this.options = options;
  }

  resolveAttack(state: GameState, action: Action, actorUnit: UnitState, targetUnit: UnitState): RuleAttackResolution | undefined {
    const payload = this.toAttackPayload(action.payload);
    if (!payload?.targetId) {
      return undefined;
    }

    const abilityId = payload.abilityId ?? this.options.defaultAttackAbilityId;
    if (!abilityId) {
      return undefined;
    }

    const battleState = toRuleEvaluationState(state, this.options.mapId);
    if (!this.options.ruleSet.canTarget(battleState, actorUnit.id, targetUnit.id, abilityId, this.options.content)) {
      return undefined;
    }

    const resolution = this.options.ruleSet.resolveDamage(
      battleState,
      actorUnit.id,
      targetUnit.id,
      abilityId,
      this.options.content,
    );

    return this.toRuleAttackResolution(resolution, actorUnit.id, targetUnit.id, abilityId);
  }

  private toAttackPayload(payload: Action['payload']): { targetId: string; abilityId?: string } | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    if (typeof record.targetId !== 'string') {
      return undefined;
    }

    return {
      targetId: record.targetId,
      abilityId: typeof record.abilityId === 'string' ? record.abilityId : undefined,
    };
  }

  private toRuleAttackResolution(
    resolution: DamageResolution,
    sourceUnitId: string,
    targetUnitId: string,
    abilityId: string,
  ): RuleAttackResolution {
    return {
      amount: resolution.amount,
      defeated: resolution.defeated,
      abilityId,
      sourceUnitId,
      targetUnitId,
      appliedStatusEffectIds: resolution.appliedStatusEffectIds ?? [],
      appliedCooldownTurns: resolution.appliedCooldownTurns,
    };
  }
}

export class RulesSdkMatchOutcomeEvaluator implements MatchOutcomeEvaluator {
  private readonly options: RulesSdkActionAdapterOptions;

  constructor(options: RulesSdkActionAdapterOptions) {
    this.options = options;
  }

  evaluate(state: GameState): MatchOutcome | null {
    const battleState = toRuleEvaluationState(state, this.options.mapId);
    const victory = this.options.ruleSet.checkVictory(battleState, this.options.content);
    return this.toMatchOutcome(victory);
  }

  private toMatchOutcome(victory: VictoryResult | null): MatchOutcome | null {
    if (!victory) {
      return null;
    }

    return {
      winnerTeamId: victory.winnerTeamId,
      isDraw: Boolean(victory.isDraw),
    };
  }
}
