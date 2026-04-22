import { EntityStore, EntityId } from '../EntityStore';
import { ACTION_POINTS_COMPONENT, ActionPoints } from '../components/ActionPoints';
import { POSITION_COMPONENT, Position } from '../components/Position';
import { computeEffectiveStats } from './StatusSystem';

export interface MovementRequest {
  entityId: EntityId;
  dx: number;
  dy: number;
  actionPointCost?: number;
}

export class MovementSystem {
  move(store: EntityStore, request: MovementRequest): boolean {
    const position = store.getComponent<Position>(POSITION_COMPONENT, request.entityId);
    const actionPoints = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.entityId);
    const effectiveStats = computeEffectiveStats(store, request.entityId);

    if (!position || !actionPoints || !effectiveStats) {
      return false;
    }

    const distance = Math.abs(request.dx) + Math.abs(request.dy);
    if (distance > effectiveStats.speed) {
      return false;
    }

    const cost = request.actionPointCost ?? distance;
    if (cost < 0 || actionPoints.current < cost) {
      return false;
    }

    store.upsertComponent<Position>(POSITION_COMPONENT, request.entityId, {
      x: position.x + request.dx,
      y: position.y + request.dy,
    });

    store.upsertComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.entityId, {
      ...actionPoints,
      current: actionPoints.current - cost,
    });

    return true;
  }
}
