import type { GameEvent } from 'engine-core';
import { EntityStore, EntityId } from '../EntityStore';
import { STATS_COMPONENT, Stats } from '../components/Stats';
import {
  STATUS_EFFECTS_COMPONENT,
  StatusEffects,
  TimedEffect,
} from '../components/StatusEffects';

const MIN_EFFECTIVE_STATS: Pick<Stats, 'attack' | 'defense' | 'speed'> = {
  attack: 0,
  defense: 0,
  speed: 0,
};

export function computeEffectiveStats(store: EntityStore, entityId: EntityId): Stats | null {
  const baseStats = store.getComponent<Stats>(STATS_COMPONENT, entityId);
  const statusEffects = store.getComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId);

  return computeEffectiveStatsFromComponents(baseStats, statusEffects);
}

export function computeEffectiveStatsFromComponents(
  baseStats: Stats | null | undefined,
  statusEffects: StatusEffects | null | undefined,
): Stats | null {
  if (!baseStats) {
    return null;
  }

  const effectiveStats: Stats = { ...baseStats };

  if (!statusEffects) {
    return enforceEffectiveStatBounds(effectiveStats);
  }

  for (const effect of statusEffects.effects) {
    for (const modifier of effect.modifiers) {
      if (modifier.type !== 'statDelta') {
        continue;
      }

      effectiveStats[modifier.stat] += modifier.amount * effect.stacks;
    }
  }

  return enforceEffectiveStatBounds(effectiveStats);
}

function enforceEffectiveStatBounds(stats: Stats): Stats {
  return {
    ...stats,
    attack: Math.max(MIN_EFFECTIVE_STATS.attack, stats.attack),
    defense: Math.max(MIN_EFFECTIVE_STATS.defense, stats.defense),
    speed: Math.max(MIN_EFFECTIVE_STATS.speed, stats.speed),
  };
}

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


  collectTickEvents(store: EntityStore, entityId: EntityId, turn = 0, round = 0): readonly GameEvent[] {
    const effectsComponent = store.getComponent<StatusEffects>(STATUS_EFFECTS_COMPONENT, entityId);
    const stats = store.getComponent<Stats>(STATS_COMPONENT, entityId);

    if (!effectsComponent || !stats) {
      return [];
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

    const clampedHp = Math.max(0, Math.min(stats.maxHp, nextHp));
    const events: GameEvent[] = [];
    if (clampedHp < stats.hp) {
      events.push({
        kind: 'UNIT_DAMAGED',
        sourceId: 'status',
        targetId: entityId,
        amount: stats.hp - clampedHp,
        turn,
        round,
      });
    }

    const decayed = effectsComponent.effects
      .map((effect) => ({ ...effect, remainingTurns: effect.remainingTurns - 1 }))
      .filter((effect) => effect.remainingTurns > 0);

    for (const previous of effectsComponent.effects) {
      const next = decayed.find((candidate) => candidate.effectId === previous.effectId);
      if (!next) {
        continue;
      }
      if (previous.remainingTurns !== next.remainingTurns) {
        events.push({
          kind: 'STATUS_APPLIED',
          targetId: entityId,
          statusId: next.effectId,
          duration: next.remainingTurns,
          turn,
          round,
        });
      }
    }

    return events;
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
