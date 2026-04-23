import type { Engine, GameState, UnitState } from 'engine-core';

export interface ScenarioRuntimeMetadata {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly teamColors?: Readonly<Record<string, string>>;
}

export interface ScenarioRuntime {
  readonly metadata: ScenarioRuntimeMetadata;
  readonly mapId: string;
  readonly players: readonly string[];
  readonly units: readonly UnitState[];
  readonly engine: Engine;
  createInitialState(): GameState;
}

export interface ScenarioRuntimeRegistry {
  create(scenarioId: string): ScenarioRuntime;
  listScenarioIds(): readonly string[];
}

export type ScenarioRuntimeFactory = () => ScenarioRuntime;

export type ScenarioRuntimeShape = Omit<ScenarioRuntime, 'metadata'> & {
  readonly metadata: ScenarioRuntimeMetadata;
};

export function createScenarioRuntime(runtime: ScenarioRuntimeShape): ScenarioRuntime {
  return runtime;
}

export function createScenarioRuntimeRegistry(
  factories: Readonly<Record<string, ScenarioRuntimeFactory>>,
): ScenarioRuntimeRegistry {
  return {
    create: (scenarioId: string): ScenarioRuntime => {
      const factory = factories[scenarioId];
      if (!factory) {
        throw new Error(`Unknown scenario runtime: ${scenarioId}`);
      }

      return factory();
    },
    listScenarioIds: () => Object.keys(factories),
  };
}
