import {
  ActionResolver,
  createInitialState,
  Engine,
  RulesetLegalActionGenerator,
  RulesSdkActionAdapter,
  type GameState,
  type UnitState,
} from 'engine-core';
import { ExampleRuleSet, exampleContent } from '../rules/ExampleRuleSet';

const EXAMPLE_MAP_ID = 'example_arena';
const EXAMPLE_PLAYERS = ['alliance', 'raiders'] as const;

const EXAMPLE_UNITS: readonly UnitState[] = [
  {
    id: 'alliance-1',
    definitionId: 'alliance_infantry',
    ownerId: 'alliance',
    hp: 100,
    maxHp: 100,
    actionPoints: 2,
    maxActionPoints: 2,
    position: { x: 1, y: 1 },
  },
  {
    id: 'alliance-2',
    definitionId: 'alliance_sniper',
    ownerId: 'alliance',
    hp: 75,
    maxHp: 75,
    actionPoints: 2,
    maxActionPoints: 2,
    position: { x: 2, y: 1 },
  },
  {
    id: 'alliance-3',
    definitionId: 'alliance_medic',
    ownerId: 'alliance',
    hp: 82,
    maxHp: 82,
    actionPoints: 2,
    maxActionPoints: 2,
    position: { x: 1, y: 2 },
  },
  {
    id: 'raider-1',
    definitionId: 'raider_brute',
    ownerId: 'raiders',
    hp: 120,
    maxHp: 120,
    actionPoints: 2,
    maxActionPoints: 2,
    position: { x: 5, y: 5 },
  },
  {
    id: 'raider-2',
    definitionId: 'raider_skirmisher',
    ownerId: 'raiders',
    hp: 88,
    maxHp: 88,
    actionPoints: 2,
    maxActionPoints: 2,
    position: { x: 6, y: 5 },
  },
];

export interface ExampleScenarioRuntime {
  readonly mapId: string;
  readonly players: readonly string[];
  readonly units: readonly UnitState[];
  readonly ruleSet: ExampleRuleSet;
  readonly engine: Engine;
  createInitialState(): GameState;
}

export function createExampleScenarioRuntime(): ExampleScenarioRuntime {
  const ruleSet = new ExampleRuleSet();
  const legalActions = new RulesetLegalActionGenerator({
    ruleSet,
    content: exampleContent,
    mapId: EXAMPLE_MAP_ID,
    attackAbilityId: 'rifle_shot',
  });
  const ruleAdapter = new RulesSdkActionAdapter({
    ruleSet,
    content: exampleContent,
    mapId: EXAMPLE_MAP_ID,
    defaultAttackAbilityId: 'rifle_shot',
  });
  const actionResolver = new ActionResolver(legalActions, ruleAdapter);

  return {
    mapId: EXAMPLE_MAP_ID,
    players: [...EXAMPLE_PLAYERS],
    units: [...EXAMPLE_UNITS],
    ruleSet,
    engine: new Engine(actionResolver),
    createInitialState: () => createInitialState(EXAMPLE_PLAYERS, EXAMPLE_UNITS),
  };
}
