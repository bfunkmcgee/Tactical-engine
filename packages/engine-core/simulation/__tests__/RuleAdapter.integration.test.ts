import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createExampleScenarioRuntime } from '../../../../games/example-skirmish/scenario/runtime';

test('example scenario runtime bridges rules-sdk legal actions into engine-core', () => {
  const runtime = createExampleScenarioRuntime();
  const state = runtime.engine.advancePhase(runtime.createInitialState());

  const legal = runtime.engine.getLegalActions(state, 'alliance');
  const move = legal.find((action) => action.type === 'MOVE');

  assert.ok(move);
  assert.equal(move?.id.startsWith('rule-move:'), true);
});

test('attack resolution uses rules-sdk damage instead of demo fixed damage', () => {
  const runtime = createExampleScenarioRuntime();
  const initial = runtime.createInitialState();
  const positioned = {
    ...initial,
    phase: 'COMMAND' as const,
    activeActivationSlot: {
      id: 'team:alliance',
      entityId: 'alliance',
      teamId: 'alliance',
      label: 'Team alliance',
    },
    units: {
      ...initial.units,
      'alliance-1': {
        ...initial.units['alliance-1']!,
        position: { x: 1, y: 1 },
      },
      'raider-1': {
        ...initial.units['raider-1']!,
        hp: 120,
        position: { x: 2, y: 1 },
      },
    },
  };

  const attack = runtime.engine
    .getLegalActions(positioned, 'alliance')
    .find((action) => {
      if (action.type !== 'ATTACK' || !action.payload || typeof action.payload !== 'object') {
        return false;
      }
      const payload = action.payload as { targetId?: string };
      return payload.targetId === 'raider-1';
    });

  assert.ok(attack);
  if (!attack) {
    return;
  }

  const result = runtime.engine.step(positioned, attack);
  const damageEvent = result.events.find((event) => event.kind === 'UNIT_DAMAGED');

  assert.ok(damageEvent);
  if (damageEvent?.kind === 'UNIT_DAMAGED') {
    assert.equal(damageEvent.amount, 30);
    assert.equal(damageEvent.abilityId, 'rifle_shot');
  }

  assert.equal(result.state.units['raider-1']?.hp, 90);
});
