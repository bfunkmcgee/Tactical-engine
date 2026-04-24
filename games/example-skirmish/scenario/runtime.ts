import {
  ActionResolver,
  createInitialState,
  Engine,
  RulesetLegalActionGenerator,
  RulesSdkActionAdapter,
  RulesSdkMatchOutcomeEvaluator,
  type UnitState,
} from 'engine-core';
import {
  createScenarioRuntime,
  type ScenarioRuntime,
  type ScenarioRuntimeMetadata,
} from 'rules-sdk/scenario-runtime';
import type { ContentIndex } from 'rules-sdk';
import type { ContentPack } from 'rules-sdk';
import {
  createValidatedExampleContent,
  ExampleRuleSet,
  type ExampleScenarioValidationDiagnostic,
  ExampleScenarioValidationError,
} from '../rules/ExampleRuleSet';

const EXAMPLE_MAP_ID = 'example_arena';
const EXAMPLE_PLAYERS = ['alliance', 'raiders'] as const;
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type RuntimeUnitState = DeepReadonly<UnitState>;
type RuntimeUnitList = ReadonlyArray<RuntimeUnitState>;

export const EXAMPLE_SCENARIO_ID = 'example-skirmish';

export const EXAMPLE_SCENARIO_METADATA: ScenarioRuntimeMetadata = {
  id: EXAMPLE_SCENARIO_ID,
  name: 'Example Skirmish',
  description: 'Starter 2-team skirmish scenario used by the web-client.',
  teamColors: {
    alliance: '#4f86f7',
    raiders: '#d65b4b',
  },
};

const EXAMPLE_UNITS: RuntimeUnitList = [
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

export type ExampleScenarioRuntime = ScenarioRuntime & {
  readonly ruleSet: ExampleRuleSet;
};

export type ExampleScenarioRuntimeOptions = {
  readonly contentPack?: ContentPack;
};

export class ExampleScenarioInitializationError extends Error {
  readonly diagnostics: readonly ExampleScenarioValidationDiagnostic[];

  constructor(diagnostics: readonly ExampleScenarioValidationDiagnostic[]) {
    super('Example scenario failed to initialize due to invalid content.');
    this.name = 'ExampleScenarioInitializationError';
    this.diagnostics = diagnostics;
  }
}

export function createExampleScenarioRuntime(options: ExampleScenarioRuntimeOptions = {}): ExampleScenarioRuntime {
  const ruleSet = new ExampleRuleSet();
  let content: ContentIndex;
  try {
    content = createValidatedExampleContent(options.contentPack);
  } catch (error) {
    if (error instanceof ExampleScenarioValidationError) {
      throw new ExampleScenarioInitializationError(error.diagnostics);
    }
    throw error;
  }
  const legalActions = new RulesetLegalActionGenerator({
    ruleSet,
    content,
    mapId: EXAMPLE_MAP_ID,
    attackAbilityId: 'rifle_shot',
  });
  const ruleAdapter = new RulesSdkActionAdapter({
    ruleSet,
    content,
    mapId: EXAMPLE_MAP_ID,
    defaultAttackAbilityId: 'rifle_shot',
  });
  const actionResolver = new ActionResolver(legalActions, ruleAdapter);
  const matchOutcomeEvaluator = new RulesSdkMatchOutcomeEvaluator({
    ruleSet,
    content,
    mapId: EXAMPLE_MAP_ID,
    defaultAttackAbilityId: 'rifle_shot',
  });

  const metadata = deepFreeze(cloneScenarioMetadata(EXAMPLE_SCENARIO_METADATA));
  const players = deepFreeze([...EXAMPLE_PLAYERS]);
  const units = deepFreeze(cloneUnits(EXAMPLE_UNITS));

  return {
    ...createScenarioRuntime({
      metadata,
      mapId: EXAMPLE_MAP_ID,
      players,
      units,
      engine: new Engine({
        actionResolver,
        matchOutcomeEvaluator,
      }),
      createInitialState: () => createInitialState(players, units),
    }),
    ruleSet,
  };
}

function cloneUnits(units: RuntimeUnitList): UnitState[] {
  return units.map(cloneUnit);
}

function cloneUnit(unit: RuntimeUnitState): UnitState {
  return {
    ...unit,
    position: unit.position ? { ...unit.position } : undefined,
    spatialRef: unit.spatialRef ? { ...unit.spatialRef } : undefined,
    cooldowns: unit.cooldowns ? { ...unit.cooldowns } : undefined,
    activeEffects: unit.activeEffects?.map((effect) => ({ ...effect })),
  };
}

function cloneScenarioMetadata(metadata: ScenarioRuntimeMetadata): ScenarioRuntimeMetadata {
  return {
    ...metadata,
    teamColors: metadata.teamColors ? { ...metadata.teamColors } : undefined,
  };
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value) as DeepReadonly<T>;
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    return Object.freeze(value) as DeepReadonly<T>;
  }

  return value as DeepReadonly<T>;
}
