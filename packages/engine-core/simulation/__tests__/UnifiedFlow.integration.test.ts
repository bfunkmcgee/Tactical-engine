import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, toRuleEvaluationState, type Action } from '../../state/GameState';
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
    activeActorId: 'A',
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
  assert.deepEqual(attackResult.events.map((event) => event.kind), ['ACTION_APPLIED', 'UNIT_DAMAGED', 'ACTION_POINTS_CHANGED']);
  assert.equal(attackResult.state.units['u-b']?.hp, 5);

  const endCommand: Action = {
    id: 'end-command:A',
    actorId: 'A',
    type: 'END_COMMAND',
    payload: { reason: 'manual' },
  };

  const nextTurn = engine.step(attackResult.state, endCommand);
  assert.equal(nextTurn.state.activeActorId, 'B');
  assert.equal(nextTurn.state.phase, 'COMMAND');
});
