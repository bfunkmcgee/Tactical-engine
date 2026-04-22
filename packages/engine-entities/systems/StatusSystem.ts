import { EntityStore, EntityId } from '../EntityStore';
import { STATS_COMPONENT, Stats } from '../components/Stats';
import {
  STATUS_EFFECTS_COMPONENT,
  StatusEffects,
  TimedEffect,
} from '../components/StatusEffects';

export class StatusSystem {
  applyEffect(store: EntityStore, entityId: EntityId, effect: TimedEffect): void {
    const current =
      store.getComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId) ?? ({ effects: [] } as StatusEffects);

    const next = [...current.effects];
    const idx = next.findIndex((candidate) => candidate.effectId === effect.effectId);

    if (idx === -1) {
      next.push({ ...effect });
    } else {
      const existing = next[idx];
      if (effect.stackingPolicy === 'refresh') {
        next[idx] = {
          ...existing,
          remainingTurns: effect.durationTurns,
          appliedAtTick: effect.appliedAtTick,
          priority: effect.priority,
        };
      } else if (effect.stackingPolicy === 'replace') {
        next[idx] = { ...effect };
      } else {
        const stackCount = Math.min(
          (existing.maxStacks ?? effect.maxStacks ?? Number.POSITIVE_INFINITY),
          existing.stacks + effect.stacks,
        );
        next[idx] = {
          ...existing,
          stacks: stackCount,
          remainingTurns: Math.max(existing.remainingTurns, effect.remainingTurns),
        };
      }
    }

    store.upsertComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId, {
      effects: this.sortEffects(next),
    });
  }

  tick(store: EntityStore, entityId: EntityId): void {
    const effectsComponent = store.getComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId);
    const stats = store.getComponent<Stats>(STATS_COMPONENT, entityId);

    if (!effectsComponent || !stats) {
      return;
    }

    let nextHp = stats.hp;

    for (const effect of this.sortEffects(effectsComponent.effects)) {
      for (const modifier of effect.modifiers) {
        if (modifier.type === 'dot') {
          nextHp -= modifier.amountPerTurn * effect.stacks;
        }
        if (modifier.type === 'hot') {
          nextHp += modifier.amountPerTurn * effect.stacks;
        }
      }
    }

    store.upsertComponent<Stats>(STATS_COMPONENT, entityId, {
      ...stats,
      hp: Math.max(0, Math.min(stats.maxHp, nextHp)),
    });

    const decayed = effectsComponent.effects
      .map((effect) => ({ ...effect, remainingTurns: effect.remainingTurns - 1 }))
      .filter((effect) => effect.remainingTurns > 0);

    store.upsertComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId, {
      effects: this.sortEffects(decayed),
    });
  }

  private sortEffects(effects: TimedEffect[]): TimedEffect[] {
    return [...effects].sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      if (a.appliedAtTick !== b.appliedAtTick) {
        return a.appliedAtTick - b.appliedAtTick;
      }

      return a.effectId.localeCompare(b.effectId);
    });
  }
}
