import {
  EXAMPLE_SCENARIO_ID,
  createExampleScenarioRuntimeRegistry,
} from '../../../../../../../games/example-skirmish/scenario/registry';

export const bad = [EXAMPLE_SCENARIO_ID, createExampleScenarioRuntimeRegistry] as const;
