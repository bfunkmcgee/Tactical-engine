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

export const SCENARIO_RUNTIME_ERROR_CODES = {
  UNKNOWN_SCENARIO_ID: 'UNKNOWN_SCENARIO_ID',
  FACTORY_FAILURE: 'SCENARIO_RUNTIME_FACTORY_FAILURE',
} as const;

export type ScenarioRuntimeErrorCode =
  (typeof SCENARIO_RUNTIME_ERROR_CODES)[keyof typeof SCENARIO_RUNTIME_ERROR_CODES];

abstract class ScenarioRuntimeError extends Error {
  abstract readonly code: ScenarioRuntimeErrorCode;
  readonly scenarioId: string;
  override readonly cause?: unknown;

  protected constructor(message: string, scenarioId: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.scenarioId = scenarioId;
    this.cause = cause;
  }
}

export class UnknownScenarioRuntimeError extends ScenarioRuntimeError {
  readonly code = SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID;

  constructor(scenarioId: string) {
    super(`Unknown scenario runtime: ${scenarioId}`, scenarioId);
  }
}

export class ScenarioRuntimeFactoryError extends ScenarioRuntimeError {
  readonly code = SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE;

  constructor(scenarioId: string, cause: unknown) {
    super(`Scenario runtime factory failed: ${scenarioId}`, scenarioId, cause);
  }
}

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
        throw new UnknownScenarioRuntimeError(scenarioId);
      }

      try {
        return factory();
      } catch (error) {
        throw new ScenarioRuntimeFactoryError(scenarioId, error);
      }
    },
    listScenarioIds: () => Object.keys(factories),
  };
}
