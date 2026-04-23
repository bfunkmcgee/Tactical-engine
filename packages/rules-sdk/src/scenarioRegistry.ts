import {
  createExampleScenarioRuntime,
  EXAMPLE_SCENARIO_ID,
} from '../../../games/example-skirmish/scenario/runtime';
import {
  createScenarioRuntimeRegistry,
  type ScenarioRuntimeFactory,
  type ScenarioRuntimeRegistry,
} from './scenarioRuntime';

const SCENARIO_RUNTIME_FACTORIES: Readonly<Record<string, ScenarioRuntimeFactory>> = {
  [EXAMPLE_SCENARIO_ID]: createExampleScenarioRuntime,
};

export function createDefaultScenarioRuntimeRegistry(): ScenarioRuntimeRegistry {
  return createScenarioRuntimeRegistry(SCENARIO_RUNTIME_FACTORIES);
}

export { EXAMPLE_SCENARIO_ID };
