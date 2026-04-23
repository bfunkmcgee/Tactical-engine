import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, getActiveActorId, toRuleEvaluationState, type Action } from '../../state/GameState';
import { Engine } from '../Engine';
import { EntityStore } from '../../../engine-entities/EntityStore';
import { ACTION_POINTS_COMPONENT } from '../../../engine-entities/components/ActionPoints';
import { POSITION_COMPONENT } from '../../../engine-entities/components/Position';
import { STATS_COMPONENT } from '../../../engine-entities/components/Stats';
import { TEAM_COMPONENT } from '../../../engine-entities/components/Team';
import { CombatSystem } from '../../../engine-entities/systems/CombatSystem';
import { TurnEconomySystem } from '../../../engine-entities/systems/TurnEconomySystem';
import {
  EntityCombatStrategyAdapter,
  EntityTurnEconomyStrategyAdapter,
} from '../../../engine-entities/systems/EngineAdapters';
import type { ContentIndex, RuleSet } from '../../../rules-sdk/src';
import { TurnManager } from '../TurnManager';

function setupEntityStore(): EntityStore {
  const store = new EntityStore();
  store.createEntity('u-a');
  store.createEntity('u-b');
  store.upsertComponent(TEAM_COMPONENT, 'u-a', { teamId: 'A' });
  store.upsertComponent(TEAM_COMPONENT, 'u-b', { teamId: 'B' });
  store.upsertComponent(STATS_COMPONENT, 'u-a', { hp: 10, maxHp: 10, attack: 6, defense: 2, speed: 5 });
  store.upsertComponent(STATS_COMPONENT, 'u-b', { hp: 8, maxHp: 8, attack: 4, defense: 3, speed: 4 });
  store.upsertComponent(ACTION_POINTS_COMPONENT, 'u-a', { current: 3, max: 4, regenPerTurn: 1 });
  store.upsertComponent(ACTION_POINTS_COMPONENT, 'u-b', { current: 1, max: 3, regenPerTurn: 1 });
  store.upsertComponent(POSITION_COMPONENT, 'u-a', { x: 0, y: 0 });
  store.upsertComponent(POSITION_COMPONENT, 'u-b', { x: 1, y: 0 });
  return store;
}

const ruleSet: RuleSet = {
  id: 'integration-rule-set',
  canMove: () => true,
  canTarget: () => true,
  resolveDamage: () => ({ amount: 3, defeated: false }),
  applyStatusEffects: (state) => state,
  checkVictory: () => null,
  onDamage: () => undefined,
  onTurnStart: () => undefined,
  onUnitDefeated: () => undefined,
};

const content = {
  abilities: {},
  factions: {},
  maps: { integration: { id: 'integration', width: 4, height: 4, tiles: ['plains'] } },
  tiles: { plains: { id: 'plains', movementCost: 1 } },
  units: {},
} as unknown as ContentIndex;

test('integration: engine + entity systems + rules sdk share one event contract', () => {
  const state = {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, actionPoints: 3, maxActionPoints: 4, position: { x: 0, y: 0 } },
        { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, actionPoints: 1, maxActionPoints: 3, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const battleState = toRuleEvaluationState(state, 'integration');
  assert.equal(ruleSet.canTarget(battleState, 'u-a', 'u-b', 'basic', content), true);

  const entityStore = setupEntityStore();
  const combatStrategy = new EntityCombatStrategyAdapter(entityStore, new CombatSystem());
  const turnEconomyStrategy = new EntityTurnEconomyStrategyAdapter(new TurnEconomySystem());
  const engine = new Engine(undefined, undefined, undefined, combatStrategy, undefined, turnEconomyStrategy);

  const attack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: 1 },
  };

  const attackResult = engine.step(state, attack);
  assert.deepEqual(attackResult.events.map((event) => event.kind), ['ACTION_APPLIED', 'ACTION_POINTS_CHANGED', 'UNIT_DAMAGED']);
  assert.equal(attackResult.state.units['u-b']?.hp, 7);

  const endCommand: Action = {
    id: 'end-command:A',
    actorId: 'A',
    type: 'END_COMMAND',
    payload: { reason: 'manual' },
  };

  const nextTurn = engine.step(attackResult.state, endCommand);
  assert.equal(getActiveActorId(nextTurn.state), 'B');
  assert.equal(nextTurn.state.phase, 'COMMAND');
});

test('integration: END_COMMAND uses turn-start boundary from phase policy', () => {
  const state = {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, actionPoints: 3, maxActionPoints: 4, position: { x: 0, y: 0 } },
        { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, actionPoints: 1, maxActionPoints: 3, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const observedPhases: string[] = [];
  const reorderedTurnManager = new TurnManager(undefined, ['START_TURN', 'RESOLUTION', 'COMMAND', 'END_TURN']);
  const engine = new Engine(
    undefined,
    reorderedTurnManager,
    undefined,
    undefined,
    undefined,
    {
      collectTurnStartEvents: (phaseState) => {
        observedPhases.push(phaseState.phase);
        return [];
      },
    },
  );

  const endCommand: Action = {
    id: 'end-command:A',
    actorId: 'A',
    type: 'END_COMMAND',
    payload: { reason: 'manual' },
  };

  const result = engine.step(state, endCommand);
  assert.equal(result.state.phase, 'COMMAND');
  assert.deepEqual(observedPhases, ['START_TURN']);
});

test('integration: END_COMMAND returns events in exact reduction order', () => {
  const state = {
    ...createInitialState(['A', 'B'], []),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const engine = new Engine(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      collectTurnStartEvents: (phaseState) => [
        {
          kind: 'ACTION_POINTS_CHANGED' as const,
          unitId: 'economy-marker',
          from: 0,
          to: 1,
          reason: 'TURN_START' as const,
          turn: phaseState.turn,
          round: phaseState.round,
        },
      ],
    },
  );

  const endCommand: Action = {
    id: 'end-command:A',
    actorId: 'A',
    type: 'END_COMMAND',
    payload: { reason: 'manual' },
  };

  const result = engine.step(state, endCommand);
  assert.deepEqual(result.events.map((event) => event.kind), [
    'ACTION_APPLIED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'TURN_STARTED',
    'ACTION_POINTS_CHANGED',
    'PHASE_ADVANCED',
  ]);
});

test('integration: PASS returns events in exact reduction order for phase flow', () => {
  const state = {
    ...createInitialState(['A', 'B'], []),
    phase: 'END_TURN' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const engine = new Engine();
  const pass: Action = {
    id: 'pass:A',
    actorId: 'A',
    type: 'PASS',
    payload: { phase: 'END_TURN' },
  };

  const result = engine.step(state, pass);
  assert.deepEqual(result.events.map((event) => event.kind), ['ACTION_APPLIED', 'PHASE_ADVANCED', 'TURN_STARTED']);
});

test('integration: Engine.step surfaces ACTION_REJECTED for invalid actions', () => {
  const state = {
    ...createInitialState(
      ['A', 'B'],
      [
        { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, position: { x: 0, y: 0 } },
        { id: 'u-b', ownerId: 'B', hp: 10, maxHp: 10, position: { x: 1, y: 0 } },
      ],
    ),
    phase: 'COMMAND' as const,
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A' },
  };

  const engine = new Engine();
  const invalidAttack: Action = {
    id: 'attack:A:u-b',
    actorId: 'A',
    type: 'ATTACK',
    payload: { targetId: 'u-b', amount: -1 },
  };

  const result = engine.step(state, invalidAttack);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    kind: 'ACTION_REJECTED',
    actorId: 'A',
    actionType: 'ATTACK',
    reason: 'ATTACK_AMOUNT_INVALID',
    details: { amount: '-1' },
    turn: 1,
    round: 1,
  });
  assert.equal(result.state.eventLog.at(-1)?.kind, 'ACTION_REJECTED');
});
