import type { GameEvent } from '../../engine-core/state/GameState';
import { EntityStore, EntityId } from '../EntityStore';
import { ACTION_POINTS_COMPONENT, ActionPoints } from '../components/ActionPoints';
import { STATS_COMPONENT, Stats } from '../components/Stats';
import { TEAM_COMPONENT, Team } from '../components/Team';
import { computeEffectiveStats } from './StatusSystem';

export interface AttackRequest {
  attackerId: EntityId;
  defenderId: EntityId;
  actionPointCost?: number;
  abilityId?: string;
}

export interface AttackResult {
  success: boolean;
  damage: number;
  remainingHp?: number;
}

export class CombatSystem {
  collectEvents(store: EntityStore, request: AttackRequest, turn = 0, round = 0): readonly GameEvent[] {
    const cost = request.actionPointCost ?? 1;
    const attackerTeam = store.getComponent<Team>(TEAM_COMPONENT, request.attackerId);
    const defenderTeam = store.getComponent<Team>(TEAM_COMPONENT, request.defenderId);
    const attackerBaseStats = store.getComponent<Stats>(STATS_COMPONENT, request.attackerId);
    const defenderBaseStats = store.getComponent<Stats>(STATS_COMPONENT, request.defenderId);
    const attackerAp = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.attackerId);

    if (!attackerTeam || !defenderTeam || !attackerBaseStats || !defenderBaseStats || !attackerAp) {
      return [];
    }

    if (attackerTeam.teamId === defenderTeam.teamId || attackerAp.current < cost) {
      return [];
    }

    const attackerStats = computeEffectiveStats(store, request.attackerId) ?? attackerBaseStats;
    const defenderStats = computeEffectiveStats(store, request.defenderId) ?? defenderBaseStats;
    const damage = Math.max(1, attackerStats.attack - defenderStats.defense);
    const nextHp = Math.max(0, defenderBaseStats.hp - damage);

    const events: GameEvent[] = [
      {
        kind: 'UNIT_DAMAGED',
        sourceId: attackerTeam.teamId,
        sourceUnitId: request.attackerId,
        targetId: request.defenderId,
        amount: damage,
        abilityId: request.abilityId,
        turn,
        round,
      },
      {
        kind: 'ACTION_POINTS_CHANGED',
        unitId: request.attackerId,
        from: attackerAp.current,
        to: attackerAp.current - cost,
        reason: 'ATTACK',
        turn,
        round,
      },
    ];

    if (nextHp === 0) {
      events.push({
        kind: 'UNIT_DEFEATED',
        sourceId: attackerTeam.teamId,
        sourceUnitId: request.attackerId,
        targetId: request.defenderId,
        turn,
        round,
      });
    }

    return events;
  }

  attack(store: EntityStore, request: AttackRequest): AttackResult {
    const events = this.collectEvents(store, request);
    if (events.length === 0) {
      return { success: false, damage: 0 };
    }

    let damage = 0;
    for (const event of events) {
      if (event.kind === 'UNIT_DAMAGED') {
        damage = event.amount;
        const targetStats = store.getComponent<Stats>(STATS_COMPONENT, request.defenderId);
        if (targetStats) {
          store.upsertComponent<Stats>(STATS_COMPONENT, request.defenderId, {
            ...targetStats,
            hp: Math.max(0, targetStats.hp - event.amount),
          });
        }
      }
      if (event.kind === 'ACTION_POINTS_CHANGED') {
        const ap = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.attackerId);
        if (ap) {
          store.upsertComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.attackerId, {
            ...ap,
            current: event.to,
          });
        }
      }
    }

    const remainingHp = store.getComponent<Stats>(STATS_COMPONENT, request.defenderId)?.hp;
    return { success: true, damage, remainingHp };
  }
}
