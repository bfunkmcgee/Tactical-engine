import type { GameEvent } from '../../engine-core/state/GameState';
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
  collectEvents(store: EntityStore, request: MovementRequest, turn = 0, round = 0): readonly GameEvent[] {
    const position = store.getComponent<Position>(POSITION_COMPONENT, request.entityId);
    const actionPoints = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.entityId);
    const effectiveStats = computeEffectiveStats(store, request.entityId);

    if (!position || !actionPoints || !effectiveStats) {
      return [];
    }

    const distance = Math.abs(request.dx) + Math.abs(request.dy);
    if (distance > effectiveStats.speed) {
      return [];
    }

    const cost = request.actionPointCost ?? distance;
    if (cost < 0 || actionPoints.current < cost) {
      return [];
    }

    const to = { x: position.x + request.dx, y: position.y + request.dy };

    return [
      {
        kind: 'UNIT_MOVED',
        unitId: request.entityId,
        from: position,
        to,
        turn,
        round,
      },
      {
        kind: 'ACTION_POINTS_CHANGED',
        unitId: request.entityId,
        from: actionPoints.current,
        to: actionPoints.current - cost,
        reason: 'MOVE',
        turn,
        round,
      },
    ];
  }

  move(store: EntityStore, request: MovementRequest): boolean {
    const events = this.collectEvents(store, request);
    if (events.length === 0) {
      return false;
    }

    for (const event of events) {
      if (event.kind === 'UNIT_MOVED') {
        store.upsertComponent<Position>(POSITION_COMPONENT, request.entityId, event.to);
      }
      if (event.kind === 'ACTION_POINTS_CHANGED') {
        const current = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.entityId);
        if (current) {
          store.upsertComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.entityId, {
            ...current,
            current: event.to,
          });
        }
      }
    }

    return true;
  }
}
