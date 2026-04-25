import {
  createScenarioRuntimeRegistry,
  type ScenarioRuntimeFactory,
  type ScenarioRuntimeRegistry,
} from 'rules-sdk';
import {
  createExampleScenarioRuntime,
  EXAMPLE_SCENARIO_ID,
} from './runtime';

const SCENARIO_RUNTIME_FACTORIES: Readonly<Record<string, ScenarioRuntimeFactory>> = {
  [EXAMPLE_SCENARIO_ID]: createExampleScenarioRuntime,
};

export function createExampleScenarioRuntimeRegistry(): ScenarioRuntimeRegistry {
  return createScenarioRuntimeRegistry(SCENARIO_RUNTIME_FACTORIES);
}

export { EXAMPLE_SCENARIO_ID };
