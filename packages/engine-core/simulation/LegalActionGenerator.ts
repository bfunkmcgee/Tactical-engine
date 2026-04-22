import { getActiveActorId, toRuleEvaluationState, type Action, type GameState, type UnitState } from '../state/GameState';
import type { ContentIndex, RuleSet } from '../../rules-sdk/src';

export interface LegalActionGenerator {
  getLegalActions(state: GameState, actorId: string): Action[];
}

const DEMO_ATTACK_AMOUNT = 1;
const DEMO_ATTACK_ABILITY_ID = 'rifle_shot';
const DEFAULT_MOVE_COST = 1;

export class DemoLegalActionGenerator implements LegalActionGenerator {
  public getLegalActions(state: GameState, actorId: string): Action[] {
    if (getActiveActorId(state) !== actorId) {
      return [];
    }

    switch (state.phase) {
      case 'COMMAND': {
        const actorUnit = this.findActorUnit(state, actorId);
        const actorTeamId = actorUnit?.ownerId ?? actorId;
        const attackActions: Action[] = Object.values(state.units)
          .filter((unit) => unit.ownerId !== actorTeamId && unit.hp > 0)
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((target) => ({
            id: `attack:${actorId}:${target.id}`,
            actorId,
            type: 'ATTACK',
            payload: { targetId: target.id, amount: DEMO_ATTACK_AMOUNT },
          }));

        const moveActions: Action[] =
          actorUnit?.position === undefined
            ? []
            : [
                {
                  id: `move:${actorId}:${actorUnit.id}:${actorUnit.position.x + 1}:${actorUnit.position.y}`,
                  actorId,
                  type: 'MOVE',
                  payload: {
                    unitId: actorUnit.id,
                    to: { x: actorUnit.position.x + 1, y: actorUnit.position.y },
                  },
                },
              ];

        const useAbilityActions: Action[] = actorUnit
          ? [
              {
                id: `use-ability:${actorId}:${actorUnit.id}:basic-strike`,
                actorId,
                type: 'USE_ABILITY',
                payload: {
                  unitId: actorUnit.id,
                  abilityId: 'basic-strike',
                  targetId: attackActions.length > 0 ? (attackActions[0]?.payload as { targetId?: string })?.targetId : undefined,
                },
              },
            ]
          : [];

        const useItemActions: Action[] = actorUnit
          ? [
              {
                id: `use-item:${actorId}:${actorUnit.id}:basic-potion`,
                actorId,
                type: 'USE_ITEM',
                payload: {
                  unitId: actorUnit.id,
                  itemId: 'basic-potion',
                  targetId: actorUnit.id,
                },
              },
            ]
          : [];

        return [
          ...attackActions,
          ...moveActions,
          ...useAbilityActions,
          ...useItemActions,
          {
            id: `end-command:${actorId}`,
            actorId,
            type: 'END_COMMAND',
            payload: { reason: 'manual' },
          },
        ];
      }

      case 'RESOLUTION':
      case 'START_TURN':
      case 'END_TURN':
        return [
          {
            id: `pass:${actorId}:${state.phase}`,
            actorId,
            type: 'PASS',
            payload: { phase: state.phase },
          },
        ];

      default:
        return [];
    }
  }

  private findActorUnit(state: GameState, actorId: string): UnitState | undefined {
    return Object.values(state.units)
      .filter((unit) => unit.ownerId === actorId && unit.hp > 0)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
  }
}

export interface RulesetLegalActionGeneratorOptions {
  readonly ruleSet: RuleSet;
  readonly content: ContentIndex;
  readonly mapId: string;
  readonly attackAbilityId?: string;
  readonly moveActionPointCost?: number;
}

export class RulesetLegalActionGenerator implements LegalActionGenerator {
  private readonly options: RulesetLegalActionGeneratorOptions;

  constructor(options: RulesetLegalActionGeneratorOptions) {
    this.options = options;
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    if (getActiveActorId(state) !== actorId) {
      return [];
    }

    if (state.phase !== 'COMMAND') {
      if (state.phase === 'RESOLUTION' || state.phase === 'START_TURN' || state.phase === 'END_TURN') {
        return [
          {
            id: `phase-pass:${actorId}:${state.phase}`,
            actorId,
            type: 'PASS',
            payload: { phase: state.phase },
          },
        ];
      }
      return [];
    }

    const actorUnit = this.findActorUnit(state, actorId);
    if (!actorUnit) {
      return [this.createEndCommandAction(actorId)];
    }

    const battleState = toRuleEvaluationState(state, this.options.mapId);
    const moveActions = this.generateMoveActions(state, actorId, actorUnit, battleState);
    const attackActions = this.generateAttackActions(state, actorId, actorUnit, battleState);
    const abilityActions = this.generateAbilityActions(state, actorId, actorUnit, battleState);

    return [...moveActions, ...attackActions, ...abilityActions, this.createEndCommandAction(actorId)];
  }

  private generateMoveActions(
    state: GameState,
    actorId: string,
    actorUnit: UnitState,
    battleState: ReturnType<typeof toRuleEvaluationState>,
  ): Action[] {
    if (!actorUnit.position) {
      return [];
    }

    const cost = this.options.moveActionPointCost ?? DEFAULT_MOVE_COST;
    if (!this.hasEnoughActionPoints(actorUnit, cost)) {
      return [];
    }

    const map = this.options.content.maps[this.options.mapId];
    const offsets = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    return offsets
      .map((offset) => ({ x: actorUnit.position!.x + offset.x, y: actorUnit.position!.y + offset.y }))
      .filter((to) => this.isInsideMapBounds(map?.width, map?.height, to.x, to.y))
      .filter((to) => this.options.ruleSet.canMove(battleState, actorUnit.id, to, this.options.content))
      .map((to) => ({
        id: `rule-move:${actorId}:${actorUnit.id}:${to.x}:${to.y}`,
        actorId,
        type: 'MOVE' as const,
        payload: {
          unitId: actorUnit.id,
          to,
          actionPointCost: cost,
        },
      }));
  }

  private generateAttackActions(
    state: GameState,
    actorId: string,
    actorUnit: UnitState,
    battleState: ReturnType<typeof toRuleEvaluationState>,
  ): Action[] {
    const abilityId = this.options.attackAbilityId ?? DEMO_ATTACK_ABILITY_ID;
    const cost = this.options.content.abilities[abilityId]?.cost?.actionPoints ?? DEFAULT_MOVE_COST;

    if (!this.hasEnoughActionPoints(actorUnit, cost) || this.isOnCooldown(actorUnit, abilityId)) {
      return [];
    }

    return Object.values(state.units)
      .filter((unit) => unit.ownerId !== actorUnit.ownerId && unit.hp > 0)
      .filter((unit) => this.withinRange(actorUnit.position, unit.position, this.options.content.abilities[abilityId]?.range ?? 1))
      .filter((unit) => this.options.ruleSet.canTarget(battleState, actorUnit.id, unit.id, abilityId, this.options.content))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((target) => ({
        id: `rule-attack:${actorId}:${actorUnit.id}:${target.id}`,
        actorId,
        type: 'ATTACK' as const,
        payload: {
          sourceUnitId: actorUnit.id,
          targetId: target.id,
          amount: this.options.content.abilities[abilityId]?.damage ?? DEMO_ATTACK_AMOUNT,
          abilityId,
          actionPointCost: cost,
        },
      }));
  }

  private generateAbilityActions(
    state: GameState,
    actorId: string,
    actorUnit: UnitState,
    battleState: ReturnType<typeof toRuleEvaluationState>,
  ): Action[] {
    const definitionId = actorUnit.definitionId;
    const abilityIds = definitionId ? this.options.content.units[definitionId]?.abilityIds ?? [] : [];

    return abilityIds.flatMap((abilityId) => {
      const ability = this.options.content.abilities[abilityId];
      if (!ability) {
        return [];
      }

      const cost = ability.cost?.actionPoints ?? 0;
      if (!this.hasEnoughActionPoints(actorUnit, cost) || this.isOnCooldown(actorUnit, abilityId)) {
        return [];
      }

      if (ability.target === 'self') {
        return [
          {
            id: `rule-ability:${actorId}:${actorUnit.id}:${abilityId}:self`,
            actorId,
            type: 'USE_ABILITY' as const,
            payload: {
              unitId: actorUnit.id,
              abilityId,
              targetId: actorUnit.id,
              actionPointCost: cost,
              cooldown: ability.cooldownTurns,
            },
          },
        ];
      }

      if (ability.target === 'tile') {
        return [];
      }

      const targets = Object.values(state.units)
        .filter((unit) => unit.hp > 0)
        .filter((unit) => {
          if (ability.target === 'ally') {
            return unit.ownerId === actorUnit.ownerId;
          }
          return unit.ownerId !== actorUnit.ownerId;
        })
        .filter((unit) => this.withinRange(actorUnit.position, unit.position, ability.range))
        .filter((unit) => this.options.ruleSet.canTarget(battleState, actorUnit.id, unit.id, abilityId, this.options.content))
        .sort((left, right) => left.id.localeCompare(right.id));

      return targets.map((target) => ({
        id: `rule-ability:${actorId}:${actorUnit.id}:${abilityId}:${target.id}`,
        actorId,
        type: 'USE_ABILITY' as const,
        payload: {
          unitId: actorUnit.id,
          abilityId,
          targetId: target.id,
          actionPointCost: cost,
          cooldown: ability.cooldownTurns,
        },
      }));
    });
  }

  private createEndCommandAction(actorId: string): Action {
    return {
      id: `rule-end-command:${actorId}`,
      actorId,
      type: 'END_COMMAND',
      payload: { reason: 'manual' },
    };
  }

  private findActorUnit(state: GameState, actorId: string): UnitState | undefined {
    return Object.values(state.units)
      .filter((unit) => unit.ownerId === actorId && unit.hp > 0)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
  }

  private hasEnoughActionPoints(unit: UnitState, cost: number): boolean {
    if (cost <= 0) {
      return true;
    }

    return (unit.actionPoints ?? 0) >= cost;
  }

  private isOnCooldown(unit: UnitState, abilityId: string): boolean {
    return (unit.cooldowns?.[abilityId] ?? 0) > 0;
  }

  private withinRange(from: UnitState['position'], to: UnitState['position'], range: number): boolean {
    if (!from || !to) {
      return false;
    }

    const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    return distance <= range;
  }

  private isInsideMapBounds(width: number | undefined, height: number | undefined, x: number, y: number): boolean {
    if (typeof width !== 'number' || typeof height !== 'number') {
      return true;
    }

    return x >= 0 && y >= 0 && x < width && y < height;
  }
}
