import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EntityStore } from '../../EntityStore';
import { ACTION_POINTS_COMPONENT } from '../../components/ActionPoints';
import { COOLDOWNS_COMPONENT } from '../../components/Cooldowns';
import { POSITION_COMPONENT } from '../../components/Position';
import { STATS_COMPONENT } from '../../components/Stats';
import { STATUS_EFFECTS_COMPONENT, type TimedEffect } from '../../components/StatusEffects';
import { TEAM_COMPONENT } from '../../components/Team';
import { CombatSystem } from '../CombatSystem';
import { MovementSystem } from '../MovementSystem';
import { StatusSystem, computeEffectiveStats } from '../StatusSystem';
import { TurnEconomySystem } from '../TurnEconomySystem';

function setupBasicStore(): EntityStore {
  const store = new EntityStore();
  store.createEntity('p1');
  store.createEntity('p2');

  store.upsertComponent(TEAM_COMPONENT, 'p1', { teamId: 'A' });
  store.upsertComponent(TEAM_COMPONENT, 'p2', { teamId: 'B' });

  store.upsertComponent(STATS_COMPONENT, 'p1', { hp: 10, maxHp: 10, attack: 6, defense: 2, speed: 5 });
  store.upsertComponent(STATS_COMPONENT, 'p2', { hp: 8, maxHp: 8, attack: 4, defense: 3, speed: 4 });

  store.upsertComponent(ACTION_POINTS_COMPONENT, 'p1', { current: 5, max: 6, regenPerTurn: 1 });
  store.upsertComponent(ACTION_POINTS_COMPONENT, 'p2', { current: 1, max: 4, regenPerTurn: 1 });

  store.upsertComponent(POSITION_COMPONENT, 'p1', { x: 0, y: 0 });
  store.upsertComponent(POSITION_COMPONENT, 'p2', { x: 1, y: 0 });

  return store;
}

function poison(atTick: number, policy: TimedEffect['stackingPolicy'], stacks = 1): TimedEffect {
  return {
    effectId: 'poison',
    durationTurns: 3,
    remainingTurns: 3,
    stackingPolicy: policy,
    stacks,
    maxStacks: 3,
    priority: 10,
    appliedAtTick: atTick,
    modifiers: [{ type: 'dot', amountPerTurn: 2 }],
  };
}

test('CombatSystem invariants: invalid AP and dead-target behavior', () => {
  const store = setupBasicStore();
  const combat = new CombatSystem();

  assert.equal(combat.attack(store, { attackerId: 'p1', defenderId: 'p2', actionPointCost: 99 }).success, false);

  store.upsertComponent(STATS_COMPONENT, 'p2', { hp: 0, maxHp: 8, attack: 4, defense: 3, speed: 4 });
  const deadTargetAttack = combat.attack(store, { attackerId: 'p1', defenderId: 'p2' });
  assert.equal(deadTargetAttack.success, true);
  assert.equal(deadTargetAttack.remainingHp, 0);

  store.upsertComponent(STATS_COMPONENT, 'p2', { hp: 8, maxHp: 8, attack: 4, defense: 3, speed: 4 });
  const initialAp = store.getComponent<{ current: number }>(ACTION_POINTS_COMPONENT, 'p1')?.current ?? 0;
  const result = combat.attack(store, { attackerId: 'p1', defenderId: 'p2' });
  const nextAp = store.getComponent<{ current: number }>(ACTION_POINTS_COMPONENT, 'p1')?.current ?? 0;

  assert.equal(result.success, true);
  assert.ok(result.damage >= 1);
  assert.equal(nextAp, initialAp - 1);
});

test('MovementSystem invariants: rejects impossible moves and AP overspend', () => {
  const store = setupBasicStore();
  const movement = new MovementSystem();

  assert.equal(movement.move(store, { entityId: 'p1', dx: 10, dy: 0 }), false);
  assert.equal(movement.move(store, { entityId: 'p1', dx: 1, dy: 0, actionPointCost: 999 }), false);

  const moved = movement.move(store, { entityId: 'p1', dx: 1, dy: 1, actionPointCost: 2 });
  assert.equal(moved, true);
  assert.deepEqual(store.getComponent<{ x: number; y: number }>(POSITION_COMPONENT, 'p1'), { x: 1, y: 1 });
});

test('StatusSystem stack/refresh/replace policies are deterministic', () => {
  const store = setupBasicStore();
  const status = new StatusSystem();

  status.applyEffect(store, 'p1', poison(1, 'stack', 1));
  status.applyEffect(store, 'p1', poison(2, 'stack', 2));
  let effects = store.getComponent<{ effects: TimedEffect[] }>(STATUS_EFFECTS_COMPONENT, 'p1')?.effects ?? [];
  assert.equal(effects[0]?.stacks, 3);

  status.applyEffect(store, 'p1', poison(5, 'refresh', 1));
  effects = store.getComponent<{ effects: TimedEffect[] }>(STATUS_EFFECTS_COMPONENT, 'p1')?.effects ?? [];
  assert.equal(effects[0]?.remainingTurns, 3);

  status.applyEffect(store, 'p1', { ...poison(7, 'replace', 1), remainingTurns: 1, stacks: 1 });
  effects = store.getComponent<{ effects: TimedEffect[] }>(STATUS_EFFECTS_COMPONENT, 'p1')?.effects ?? [];
  assert.equal(effects[0]?.remainingTurns, 1);

  status.tick(store, 'p1');
  const statsAfterTick = store.getComponent<{ hp: number }>(STATS_COMPONENT, 'p1');
  assert.equal(statsAfterTick?.hp, 8);
});

test('TurnEconomySystem: cooldown decrement and stable turn ordering', () => {
  const store = setupBasicStore();
  const turnEconomy = new TurnEconomySystem();

  store.upsertComponent(COOLDOWNS_COMPONENT, 'p1', { abilities: { blast: 2, dash: 0 } });

  turnEconomy.startTurn(store);
  assert.deepEqual(
    store.getComponent<{ abilities: Record<string, number> }>(COOLDOWNS_COMPONENT, 'p1')?.abilities,
    { blast: 1, dash: 0 },
  );

  const order = turnEconomy.getTurnOrder(store);
  assert.deepEqual(order, ['p1', 'p2']);

  const effective = computeEffectiveStats(store, 'p1');
  assert.ok((effective?.speed ?? -1) >= 0);
});
