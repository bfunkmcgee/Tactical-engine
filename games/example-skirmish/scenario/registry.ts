import {
  createScenarioRuntimeRegistry,
  type ScenarioRuntimeRegistry,
} from 'rules-sdk';
import {
  createExampleScenarioRuntime,
  EXAMPLE_SCENARIO_ID,
  EXAMPLE_SCENARIO_METADATA,
} from './runtime';

const SCENARIO_RUNTIME_REGISTRY = {
  [EXAMPLE_SCENARIO_ID]: {
    metadata: EXAMPLE_SCENARIO_METADATA,
    create: createExampleScenarioRuntime,
  },
};

export function createExampleScenarioRuntimeRegistry(): ScenarioRuntimeRegistry {
  return createScenarioRuntimeRegistry(SCENARIO_RUNTIME_REGISTRY);
}

export { EXAMPLE_SCENARIO_ID };
