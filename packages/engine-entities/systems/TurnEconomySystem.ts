import { EntityStore } from '../EntityStore';
import { ACTION_POINTS_COMPONENT, ActionPoints } from '../components/ActionPoints';
import { COOLDOWNS_COMPONENT, Cooldowns } from '../components/Cooldowns';

export class TurnEconomySystem {
  startTurn(store: EntityStore): void {
    for (const { entityId, data } of store.getComponentEntries<ActionPoints>(ACTION_POINTS_COMPONENT)) {
      const nextCurrent = Math.min(data.max, data.current + data.regenPerTurn);
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
}
