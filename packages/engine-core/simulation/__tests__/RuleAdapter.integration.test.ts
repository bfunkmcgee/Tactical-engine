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

test('ExampleRuleSet toEngineEvents forwards turn and round from hook events', () => {
  const runtime = createExampleScenarioRuntime();

  const turnStart = runtime.ruleSet.toEngineEvents({
    turn: 8,
    round: 3,
    activeTeamId: 'alliance',
    unitIds: ['alliance-1'],
  });
  const damaged = runtime.ruleSet.toEngineEvents({
    turn: 8,
    round: 3,
    activeTeamId: 'alliance',
    sourceUnitId: 'alliance-1',
    targetUnitId: 'raider-1',
    amount: 12,
    abilityId: 'rifle_shot',
  });
  const defeated = runtime.ruleSet.toEngineEvents({
    turn: 8,
    round: 3,
    activeTeamId: 'alliance',
    sourceUnitId: 'alliance-1',
    unitId: 'raider-1',
  });

  assert.equal(turnStart[0]?.turn, 8);
  assert.equal(turnStart[0]?.round, 3);
  assert.equal(damaged[0]?.turn, 8);
  assert.equal(damaged[0]?.round, 3);
  assert.equal(defeated[0]?.turn, 8);
  assert.equal(defeated[0]?.round, 3);
});

test('engine emits MATCH_ENDED and stores terminal outcome after victory', () => {
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
      'alliance-1': {
        ...initial.units['alliance-1']!,
        position: { x: 1, y: 1 },
      },
      'raider-1': {
        ...initial.units['raider-1']!,
        hp: 30,
        position: { x: 2, y: 1 },
      },
    },
  };

  const attack = runtime.engine
    .getLegalActions(positioned, 'alliance')
    .find((action) => action.type === 'ATTACK' && action.payload && typeof action.payload === 'object');

  assert.ok(attack);
  if (!attack) {
    return;
  }

  const result = runtime.engine.step(positioned, attack);
  const terminalEvent = result.events.find((event) => event.kind === 'MATCH_ENDED');

  assert.ok(terminalEvent);
  if (terminalEvent?.kind === 'MATCH_ENDED') {
    assert.equal(terminalEvent.winnerTeamId, 'alliance');
    assert.equal(terminalEvent.isDraw, false);
  }

  assert.equal(result.state.matchStatus, 'ENDED');
  assert.equal(result.state.winnerTeamId, 'alliance');
  assert.equal(result.state.isDraw, false);

  const followUp = runtime.engine.step(result.state, attack);
  assert.equal(followUp.events.length, 0);
  assert.equal(followUp.state, result.state);
});
