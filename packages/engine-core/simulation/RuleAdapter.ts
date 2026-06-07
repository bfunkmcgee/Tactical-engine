import type {
  ContentIndex,
  DamageResolution,
  ResolvedStatusApplication,
  RuleSet,
  VictoryResult,
} from 'rules-sdk';
import { toRuleEvaluationState, type Action, type GameEvent, type GameState, type UnitState } from '../state/GameState';
import type { ActiveEffect, SimulationUnit } from '../state/SimulationContract';
import type { TurnStartStrategy } from './Engine';

export interface RuleStatusApplication {
  readonly statusId: string;
  readonly duration: number;
  readonly stacks: number;
}

export interface RuleAttackResolution {
  readonly amount: number;
  readonly defeated: boolean;
  readonly abilityId?: string;
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly appliedStatusApplications: readonly RuleStatusApplication[];
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
      appliedStatusApplications: this.toRuleStatusApplications(resolution.appliedStatusApplications),
      appliedCooldownTurns: resolution.appliedCooldownTurns,
    };
  }

  private toRuleStatusApplications(applications: readonly ResolvedStatusApplication[] | undefined): RuleStatusApplication[] {
    return (applications ?? []).map((application) => ({
      statusId: application.statusId,
      duration: Math.max(1, application.durationTurns ?? 1),
      stacks: Math.max(1, application.stacks ?? 1),
    }));
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

export interface RulesSdkTurnStartStrategyOptions {
  readonly ruleSet: RuleSet;
  readonly content: ContentIndex;
  readonly mapId: string;
  /**
   * Action points regenerated toward `maxActionPoints` for each active-team unit
   * at the start of its turn. Defaults to 1.
   */
  readonly actionPointRegenPerTurn?: number;
}

/**
 * Drives the rules-sdk turn-start lifecycle through the engine's event log.
 *
 * Each turn-start boundary the active team's units regenerate action points and
 * advance their rule-owned status/cooldown lifecycle. The ruleset's
 * `applyStatusEffects` hook decides *how* effects decay, tick damage/heal, and
 * how cooldowns count down; this strategy decides *whose* effects advance (the
 * active team only, so every unit ticks once per round at its own turn) and
 * translates the resulting state delta into engine events so replay stays
 * event-sourced.
 */
export class RulesSdkTurnStartStrategy implements TurnStartStrategy {
  private readonly options: RulesSdkTurnStartStrategyOptions;

  constructor(options: RulesSdkTurnStartStrategyOptions) {
    this.options = options;
  }

  collectTurnStartEvents(state: GameState): readonly GameEvent[] {
    const activeSlot = state.activeActivationSlot;
    const slotMatchesUnit = Boolean(state.units[activeSlot.entityId]);
    const activeTeamId = activeSlot.teamId ?? state.units[activeSlot.entityId]?.ownerId;

    const isActiveUnit = (unit: UnitState): boolean =>
      slotMatchesUnit ? unit.id === activeSlot.entityId : unit.ownerId === activeTeamId;

    const battleState = toRuleEvaluationState(state, this.options.mapId);
    const ticked = this.options.ruleSet.applyStatusEffects(battleState, this.options.content);
    const tickedById = new Map(ticked.units.map((unit) => [unit.id, unit] as const));

    const regenPerTurn = this.options.actionPointRegenPerTurn ?? 1;
    const events: GameEvent[] = [];

    for (const unit of Object.values(state.units).sort((left, right) => left.id.localeCompare(right.id))) {
      if (!isActiveUnit(unit)) {
        continue;
      }

      this.collectActionPointRegen(events, unit, regenPerTurn, state);

      const tickedUnit = tickedById.get(unit.id);
      if (!tickedUnit) {
        continue;
      }

      this.collectCooldownTicks(events, unit, tickedUnit, state);
      this.collectStatusTicks(events, unit, tickedUnit, state);
      this.collectHealthDelta(events, unit, tickedUnit, state);
    }

    return events;
  }

  private collectActionPointRegen(events: GameEvent[], unit: UnitState, regenPerTurn: number, state: GameState): void {
    if (regenPerTurn <= 0 || typeof unit.actionPoints !== 'number' || typeof unit.maxActionPoints !== 'number') {
      return;
    }

    const next = Math.min(unit.maxActionPoints, unit.actionPoints + regenPerTurn);
    if (next === unit.actionPoints) {
      return;
    }

    events.push({
      kind: 'ACTION_POINTS_CHANGED',
      unitId: unit.id,
      from: unit.actionPoints,
      to: next,
      reason: 'TURN_START',
      turn: state.turn,
      round: state.round,
    });
  }

  private collectCooldownTicks(events: GameEvent[], unit: UnitState, tickedUnit: SimulationUnit, state: GameState): void {
    const before = unit.cooldowns ?? {};
    const after = tickedUnit.cooldowns ?? {};
    const abilityIds = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const abilityId of [...abilityIds].sort()) {
      const from = before[abilityId] ?? 0;
      const to = after[abilityId] ?? 0;
      if (from === to) {
        continue;
      }

      events.push({
        kind: 'COOLDOWN_TICKED',
        unitId: unit.id,
        abilityId,
        from,
        to,
        turn: state.turn,
        round: state.round,
      });
    }
  }

  private collectStatusTicks(events: GameEvent[], unit: UnitState, tickedUnit: SimulationUnit, state: GameState): void {
    const before = unit.activeEffects ?? [];
    const afterByKey = new Map((tickedUnit.activeEffects ?? []).map((effect) => [effectKey(effect), effect] as const));

    for (const previous of [...before].sort((left, right) => effectKey(left).localeCompare(effectKey(right)))) {
      const next = afterByKey.get(effectKey(previous));
      if (!next) {
        events.push({
          kind: 'STATUS_REMOVED',
          targetId: unit.id,
          statusId: previous.effectId,
          sourceUnitId: previous.sourceUnitId,
          turn: state.turn,
          round: state.round,
        });
        continue;
      }

      if (next.duration !== previous.duration) {
        events.push({
          kind: 'STATUS_TICKED',
          targetId: unit.id,
          statusId: previous.effectId,
          sourceUnitId: previous.sourceUnitId,
          duration: next.duration,
          turn: state.turn,
          round: state.round,
        });
      }
    }
  }

  private collectHealthDelta(events: GameEvent[], unit: UnitState, tickedUnit: SimulationUnit, state: GameState): void {
    const delta = tickedUnit.health - unit.hp;
    if (delta < 0) {
      events.push({
        kind: 'UNIT_DAMAGED',
        sourceId: 'status',
        targetId: unit.id,
        amount: -delta,
        turn: state.turn,
        round: state.round,
      });

      if (tickedUnit.health <= 0) {
        events.push({
          kind: 'UNIT_DEFEATED',
          sourceId: 'status',
          targetId: unit.id,
          turn: state.turn,
          round: state.round,
        });
      }
      return;
    }

    if (delta > 0) {
      events.push({
        kind: 'UNIT_HEALED',
        sourceId: 'status',
        targetId: unit.id,
        amount: delta,
        turn: state.turn,
        round: state.round,
      });
    }
  }
}

function effectKey(effect: ActiveEffect): string {
  return `${effect.effectId}::${effect.sourceUnitId ?? ''}`;
}
