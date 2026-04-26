import type { Engine, GameState, UnitState } from 'engine-core';
import {
  ERROR_CATEGORIES,
  ERROR_CODES,
  RulesSdkError,
  wrapUnknownError,
  type ErrorMetadata,
} from './errors';
export { ERROR_CATEGORIES, ERROR_CODES, RulesSdkError, wrapUnknownError, type DiagnosticPayload, type ErrorCategory, type ErrorCode, type ErrorMetadata } from './errors';

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
  UNKNOWN_SCENARIO_ID: ERROR_CODES.SCENARIO_RUNTIME_UNKNOWN_ID,
  FACTORY_FAILURE: ERROR_CODES.SCENARIO_RUNTIME_FACTORY_FAILURE,
} as const;

export type ScenarioRuntimeErrorCode =
  (typeof SCENARIO_RUNTIME_ERROR_CODES)[keyof typeof SCENARIO_RUNTIME_ERROR_CODES];

abstract class ScenarioRuntimeError extends RulesSdkError {
  abstract readonly code: ScenarioRuntimeErrorCode;
  readonly scenarioId: string;

  protected constructor(message: string, scenarioId: string, category: (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES], cause?: unknown, metadata?: ErrorMetadata) {
    super(message, {
      category,
      code: new.target === UnknownScenarioRuntimeError
        ? SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID
        : SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE,
      metadata: {
        ...metadata,
        scenarioId,
      },
      cause,
    });
    this.scenarioId = scenarioId;
  }
}

export class UnknownScenarioRuntimeError extends ScenarioRuntimeError {
  readonly code = SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID;

  constructor(scenarioId: string) {
    super(`Unknown scenario runtime: ${scenarioId}`, scenarioId, ERROR_CATEGORIES.LEGALITY);
  }
}

export class ScenarioRuntimeFactoryError extends ScenarioRuntimeError {
  readonly code = SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE;

  constructor(scenarioId: string, cause: unknown) {
    const wrappedCause = wrapUnknownError(cause, {
      message: `Scenario runtime factory failed: ${scenarioId}`,
      category: ERROR_CATEGORIES.RUNTIME_INIT,
      code: ERROR_CODES.SCENARIO_RUNTIME_FACTORY_FAILURE,
      metadata: {
        scenarioId,
      },
    });
    super(`Scenario runtime factory failed: ${scenarioId}`, scenarioId, ERROR_CATEGORIES.RUNTIME_INIT, cause, {
      ...wrappedCause.metadata,
    });
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
