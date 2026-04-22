import { EntityStore, EntityId } from '../EntityStore';
import { ACTION_POINTS_COMPONENT, ActionPoints } from '../components/ActionPoints';
import { STATS_COMPONENT, Stats } from '../components/Stats';
import { TEAM_COMPONENT, Team } from '../components/Team';
import { computeEffectiveStats } from './StatusSystem';

export interface AttackRequest {
  attackerId: EntityId;
  defenderId: EntityId;
  actionPointCost?: number;
}

export interface AttackResult {
  success: boolean;
  damage: number;
  remainingHp?: number;
}

export class CombatSystem {
  attack(store: EntityStore, request: AttackRequest): AttackResult {
    const cost = request.actionPointCost ?? 1;
    const attackerTeam = store.getComponent<Team>(TEAM_COMPONENT, request.attackerId);
    const defenderTeam = store.getComponent<Team>(TEAM_COMPONENT, request.defenderId);
    const attackerBaseStats = store.getComponent<Stats>(STATS_COMPONENT, request.attackerId);
    const defenderBaseStats = store.getComponent<Stats>(STATS_COMPONENT, request.defenderId);
    const attackerAp = store.getComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.attackerId);

    if (!attackerTeam || !defenderTeam || !attackerBaseStats || !defenderBaseStats || !attackerAp) {
      return { success: false, damage: 0 };
    }

    if (attackerTeam.teamId === defenderTeam.teamId || attackerAp.current < cost) {
      return { success: false, damage: 0 };
    }

    const attackerStats = computeEffectiveStats(store, request.attackerId) ?? attackerBaseStats;
    const defenderStats = computeEffectiveStats(store, request.defenderId) ?? defenderBaseStats;
    const damage = Math.max(1, attackerStats.attack - defenderStats.defense);
    const nextHp = Math.max(0, defenderBaseStats.hp - damage);

    store.upsertComponent<Stats>(STATS_COMPONENT, request.defenderId, {
      ...defenderBaseStats,
      hp: nextHp,
    });

    store.upsertComponent<ActionPoints>(ACTION_POINTS_COMPONENT, request.attackerId, {
      ...attackerAp,
      current: attackerAp.current - cost,
    });

    return {
      success: true,
      damage,
      remainingHp: nextHp,
    };
  }
}
