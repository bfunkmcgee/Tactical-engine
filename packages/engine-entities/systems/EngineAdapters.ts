import type { Action, GameEvent, GameState } from '../../engine-core/state/GameState';
import type { SimulationStrategy, StrategyContext, TurnStartStrategy } from '../../engine-core/simulation/Engine';
import { EntityStore } from '../EntityStore';
import { POSITION_COMPONENT } from '../components/Position';
import { CombatSystem } from './CombatSystem';
import { MovementSystem } from './MovementSystem';
import { TurnEconomySystem } from './TurnEconomySystem';

function getActorUnitId(state: GameState, action: Action): string | undefined {
  return Object.values(state.units).find((unit) => unit.ownerId === action.actorId && unit.hp > 0)?.id;
}

export class EntityMovementStrategyAdapter implements SimulationStrategy {
  constructor(private readonly store: EntityStore, private readonly movementSystem: MovementSystem) {}

  collectEvents(context: StrategyContext): readonly GameEvent[] {
    if (context.action.type !== 'MOVE' || !context.action.payload || !('to' in context.action.payload)) {
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
    if (!actorUnitId || !payload || !('targetId' in payload)) {
      return [];
    }

    return this.combatSystem.collectEvents(
      this.store,
      {
        attackerId: actorUnitId,
        defenderId: payload.targetId,
        abilityId: 'abilityId' in payload ? payload.abilityId : undefined,
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
