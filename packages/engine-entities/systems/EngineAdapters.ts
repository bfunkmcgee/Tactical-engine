import type { Action, GameEvent, GameState } from 'engine-core';
import type { SimulationStrategy, StrategyContext, TurnStartStrategy } from 'engine-core';
import { EntityStore } from '../EntityStore';
import { POSITION_COMPONENT } from '../components/Position';
import { CombatSystem } from './CombatSystem';
import { MovementSystem } from './MovementSystem';
import { TurnEconomySystem } from './TurnEconomySystem';

interface MovePayload {
  readonly unitId: string;
  readonly to: { readonly x: number; readonly y: number };
  readonly actionPointCost?: number;
}

interface AttackPayload {
  readonly targetId: string;
  readonly abilityId?: string;
}

function getActorUnitId(state: GameState, action: Action): string | undefined {
  return Object.values(state.units).find((unit) => unit.ownerId === action.actorId && unit.hp > 0)?.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isMovePayload(payload: Action['payload']): payload is MovePayload {
  if (!isRecord(payload) || typeof payload.unitId !== 'string' || !isRecord(payload.to)) {
    return false;
  }

  return typeof payload.to.x === 'number' && typeof payload.to.y === 'number';
}

function isAttackPayload(payload: Action['payload']): payload is AttackPayload {
  if (!isRecord(payload) || typeof payload.targetId !== 'string') {
    return false;
  }

  return payload.abilityId === undefined || typeof payload.abilityId === 'string';
}

export class EntityMovementStrategyAdapter implements SimulationStrategy {
  constructor(private readonly store: EntityStore, private readonly movementSystem: MovementSystem) {}

  collectEvents(context: StrategyContext): readonly GameEvent[] {
    if (context.action.type !== 'MOVE' || !isMovePayload(context.action.payload)) {
      return [];
    }

    const payload = context.action.payload;
    const actorUnitId = payload.unitId;
    const position = this.store.getComponent<{ x: number; y: number }>(POSITION_COMPONENT, actorUnitId);
    if (!position) {
      return [];
    }

    return this.movementSystem.collectEvents(
      this.store,
      {
        entityId: actorUnitId,
        dx: payload.to.x - position.x,
        dy: payload.to.y - position.y,
        actionPointCost: payload.actionPointCost,
      },
      context.state.turn,
      context.state.round,
    );
  }
}

export class EntityCombatStrategyAdapter implements SimulationStrategy {
  constructor(private readonly store: EntityStore, private readonly combatSystem: CombatSystem) {}

  collectEvents(context: StrategyContext): readonly GameEvent[] {
    if (context.action.type !== 'ATTACK') {
      return [];
    }

    const actorUnitId = getActorUnitId(context.state, context.action);
    const payload = context.action.payload;
    if (!actorUnitId || !isAttackPayload(payload)) {
      return [];
    }

    return this.combatSystem.collectEvents(
      this.store,
      {
        attackerId: actorUnitId,
        defenderId: payload.targetId,
        abilityId: payload.abilityId,
      },
      context.state.turn,
      context.state.round,
    );
  }
}

export class EntityTurnEconomyStrategyAdapter implements TurnStartStrategy {
  constructor(private readonly turnEconomySystem: TurnEconomySystem) {}

  collectTurnStartEvents(state: GameState): readonly GameEvent[] {
    return this.turnEconomySystem.collectTurnStartEvents(state);
  }
}
