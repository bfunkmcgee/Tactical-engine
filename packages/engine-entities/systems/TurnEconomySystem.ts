import { EntityStore, EntityId } from '../EntityStore';
import { ACTION_POINTS_COMPONENT, ActionPoints } from '../components/ActionPoints';
import { COOLDOWNS_COMPONENT, Cooldowns } from '../components/Cooldowns';
import { computeEffectiveStats } from './StatusSystem';

export class TurnEconomySystem {
  startTurn(store: EntityStore): void {
    for (const { entityId, data } of store.getComponentEntries<ActionPoints>(ACTION_POINTS_COMPONENT)) {
      const effectiveStats = computeEffectiveStats(store, entityId);
      const speedRegenBonus = effectiveStats ? Math.floor(effectiveStats.speed / 5) : 0;
      const nextCurrent = Math.min(data.max, data.current + data.regenPerTurn + speedRegenBonus);

      store.upsertComponent<ActionPoints>(ACTION_POINTS_COMPONENT, entityId, {
        ...data,
        current: nextCurrent,
      });
    }

    for (const { entityId, data } of store.getComponentEntries<Cooldowns>(COOLDOWNS_COMPONENT)) {
      const nextAbilities: Record<string, number> = {};

      for (const [abilityId, remaining] of Object.entries(data.abilities)) {
        nextAbilities[abilityId] = Math.max(0, remaining - 1);
      }

      store.upsertComponent<Cooldowns>(COOLDOWNS_COMPONENT, entityId, {
        abilities: nextAbilities,
      });
    }
  }

  getTurnOrder(store: EntityStore): EntityId[] {
    const actors = store
      .getComponentEntries<ActionPoints>(ACTION_POINTS_COMPONENT)
      .map(({ entityId }) => ({
        entityId,
        speed: computeEffectiveStats(store, entityId)?.speed ?? 0,
      }));

    actors.sort((a, b) => {
      if (a.speed !== b.speed) {
        return b.speed - a.speed;
      }

      return a.entityId.localeCompare(b.entityId);
    });

    return actors.map((actor) => actor.entityId);
  }
}
