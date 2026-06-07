import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { createExampleScenarioRuntime } from '../../../../games/example-skirmish/scenario/runtime';
import type { GameEvent, GameState } from '../../state/GameState';

function startTurnEvents(events: readonly GameEvent[]): readonly GameEvent[] {
  // Drop the framing TURN_STARTED / PHASE_ADVANCED events emitted by initialize so
  // the assertions focus on the rules-driven turn-start economy.
  return events.filter((event) => event.kind !== 'TURN_STARTED' && event.kind !== 'PHASE_ADVANCED');
}

test('turn-start lifecycle ticks cooldowns, statuses, and regenerates AP for the active team', () => {
  const runtime = createExampleScenarioRuntime();
  const initial = runtime.createInitialState();
  const state: GameState = {
    ...initial,
    phase: 'START_TURN',
    activeActivationSlot: { id: 'team:alliance', entityId: 'alliance', teamId: 'alliance', label: 'Team alliance' },
    units: {
      ...initial.units,
      'alliance-1': {
        ...initial.units['alliance-1']!,
        hp: 100,
        maxHp: 100,
        actionPoints: 0,
        maxActionPoints: 2,
        cooldowns: { suppressing_fire: 2 },
        activeEffects: [{ effectId: 'dot:4', duration: 2, stacks: 1 }],
      },
      'alliance-2': {
        ...initial.units['alliance-2']!,
        hp: 50,
        maxHp: 75,
        actionPoints: 2,
        maxActionPoints: 2,
        activeEffects: [{ effectId: 'regen:8', duration: 1, stacks: 1 }],
      },
      'raider-1': {
        ...initial.units['raider-1']!,
        cooldowns: { gravity_well: 3 },
        activeEffects: [{ effectId: 'dot:6', duration: 2, stacks: 1 }],
      },
    },
  };

  const result = runtime.engine.initialize(state);
  const economy = startTurnEvents(result.events);

  const cooldownTick = economy.find((event) => event.kind === 'COOLDOWN_TICKED');
  assert.ok(cooldownTick, 'expected a cooldown to tick down at turn start');
  if (cooldownTick?.kind === 'COOLDOWN_TICKED') {
    assert.equal(cooldownTick.unitId, 'alliance-1');
    assert.equal(cooldownTick.abilityId, 'suppressing_fire');
    assert.equal(cooldownTick.from, 2);
    assert.equal(cooldownTick.to, 1);
  }

  const apRegen = economy.find((event) => event.kind === 'ACTION_POINTS_CHANGED');
  assert.ok(apRegen, 'expected action points to regenerate at turn start');
  if (apRegen?.kind === 'ACTION_POINTS_CHANGED') {
    assert.equal(apRegen.unitId, 'alliance-1');
    assert.equal(apRegen.reason, 'TURN_START');
    assert.equal(apRegen.from, 0);
    assert.equal(apRegen.to, 1);
  }

  const statusTick = economy.find((event) => event.kind === 'STATUS_TICKED');
  assert.ok(statusTick, 'expected the dot effect to tick down');
  if (statusTick?.kind === 'STATUS_TICKED') {
    assert.equal(statusTick.targetId, 'alliance-1');
    assert.equal(statusTick.statusId, 'dot:4');
    assert.equal(statusTick.duration, 1);
  }

  const dotDamage = economy.find((event) => event.kind === 'UNIT_DAMAGED');
  assert.ok(dotDamage, 'expected dot damage to be applied');
  if (dotDamage?.kind === 'UNIT_DAMAGED') {
    assert.equal(dotDamage.targetId, 'alliance-1');
    assert.equal(dotDamage.amount, 4);
    assert.equal(dotDamage.sourceId, 'status');
  }

  const heal = economy.find((event) => event.kind === 'UNIT_HEALED');
  assert.ok(heal, 'expected regen to heal the wounded ally');
  if (heal?.kind === 'UNIT_HEALED') {
    assert.equal(heal.targetId, 'alliance-2');
    assert.equal(heal.amount, 8);
  }

  const removed = economy.find((event) => event.kind === 'STATUS_REMOVED');
  assert.ok(removed, 'expected the one-turn regen effect to expire');
  if (removed?.kind === 'STATUS_REMOVED') {
    assert.equal(removed.targetId, 'alliance-2');
    assert.equal(removed.statusId, 'regen:8');
  }

  // Final reduced state reflects the lifecycle advance.
  assert.equal(result.state.units['alliance-1']?.hp, 96);
  assert.equal(result.state.units['alliance-1']?.actionPoints, 1);
  assert.equal(result.state.units['alliance-1']?.cooldowns?.suppressing_fire, 1);
  assert.equal(result.state.units['alliance-2']?.hp, 58);
  assert.equal(result.state.units['alliance-2']?.activeEffects?.length ?? 0, 0);

  // Non-active team's lifecycle must not advance on the alliance's turn start.
  assert.equal(result.state.units['raider-1']?.cooldowns?.gravity_well, 3);
  assert.deepEqual(result.state.units['raider-1']?.activeEffects, [{ effectId: 'dot:6', duration: 2, stacks: 1 }]);
});
