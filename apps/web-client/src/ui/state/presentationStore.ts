import { useMemo, useState } from 'react';
import {
  type GameEvent,
  type Action,
} from 'engine-core';
import {
  type ScenarioRuntime,
  type ScenarioRuntimeRegistry,
  SCENARIO_RUNTIME_ERROR_CODES,
  type ErrorCategory,
  type ErrorMetadata,
  type ScenarioRuntimeErrorCode,
} from 'rules-sdk';
import {
  EXAMPLE_SCENARIO_ID,
  createExampleScenarioRuntimeRegistry,
} from 'game-scenarios/runtime-registry';
import { projectEngineSnapshot, type EngineSnapshot, type ViewState } from './engineSnapshot';
import {
  createEngineRuntimeAdapter,
  type EngineRuntimeAdapter,
} from '../../runtime/engineRuntimeAdapter';
import {
  createInitialStoreState,
  reduceStoreForTriggeredAction,
  type PresentationStoreState,
} from './presentationStoreRuntime';

export type { EngineSnapshot, Entity, ViewState, EngineActionView } from './engineSnapshot';
export { createInitialStoreState, reduceStoreForTriggeredAction, type PresentationStoreState } from './presentationStoreRuntime';

export const DEFAULT_SCENARIO_ID = EXAMPLE_SCENARIO_ID;

const INITIAL_VIEW: ViewState = { zoom: 1, offsetX: 0, offsetY: 0 };

export type PresentationStoreScenarioAdapter = {
  readonly scenarioRuntime?: ScenarioRuntime;
  readonly initializationError?: {
    readonly message: string;
    readonly diagnostics?: readonly {
      readonly source: string;
      readonly field: string;
      readonly reason: string;
    }[];
    readonly code?: ScenarioRuntimeErrorCode;
    readonly category?: ErrorCategory;
    readonly metadata?: ErrorMetadata;
    readonly scenarioId?: string;
    readonly cause?: string;
    readonly errorName?: string;
    readonly stackSnippet?: string;
  };
};

export function createPresentationStoreScenarioAdapter(options?: {
  readonly scenarioId?: string;
  readonly registry?: ScenarioRuntimeRegistry;
}): PresentationStoreScenarioAdapter {
  const scenarioId = options?.scenarioId ?? DEFAULT_SCENARIO_ID;
  const registry = options?.registry ?? createExampleScenarioRuntimeRegistry();
  try {
    return {
      scenarioRuntime: registry.create(scenarioId),
    };
  } catch (error) {
    const diagnostics = isDiagnosticError(error) ? error.diagnostics : undefined;
    const safeErrorDetails = toSafeErrorDetails(error);
    return {
      initializationError: {
        message: safeErrorDetails.message
          ? `Unable to initialize scenario '${scenarioId}'. ${safeErrorDetails.message}`
          : `Unable to initialize scenario '${scenarioId}'.`,
        diagnostics,
        code: safeErrorDetails.code,
        category: safeErrorDetails.category,
        metadata: safeErrorDetails.metadata,
        scenarioId: safeErrorDetails.scenarioId,
        cause: safeErrorDetails.cause,
        errorName: safeErrorDetails.errorName,
        stackSnippet: safeErrorDetails.stackSnippet,
      },
    };
  }
}

function toSafeErrorDetails(error: unknown): {
  readonly message?: string;
  readonly code?: ScenarioRuntimeErrorCode;
  readonly category?: ErrorCategory;
  readonly metadata?: ErrorMetadata;
  readonly scenarioId?: string;
  readonly cause?: string;
  readonly errorName?: string;
  readonly stackSnippet?: string;
} {
  if (error instanceof Error) {
    const stackSnippet = error.stack?.split('\n').slice(0, 3).join('\n');
    const code = toScenarioRuntimeErrorCode((error as { code?: unknown }).code);
    const category = toErrorCategory((error as { category?: unknown }).category);
    const metadata = toErrorMetadata((error as { metadata?: unknown }).metadata);
    const cause = stringifyCause(error.cause);
    const message = code === SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE
      ? (cause ?? error.message ?? undefined)
      : (error.message || undefined);
    return {
      message,
      code,
      category,
      metadata,
      scenarioId: typeof (error as { scenarioId?: unknown }).scenarioId === 'string'
        ? (error as { scenarioId?: string }).scenarioId
        : undefined,
      cause,
      errorName: error.name || undefined,
      stackSnippet: stackSnippet || undefined,
    };
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return {
      message: error,
      cause: error,
      errorName: 'NonErrorThrown',
    };
  }

  if (error && typeof error === 'object') {
    return {
      cause: 'A non-Error object was thrown.',
      errorName: (error as { constructor?: { name?: string } }).constructor?.name ?? 'NonErrorThrown',
    };
  }

  return {};
}

function toScenarioRuntimeErrorCode(code: unknown): ScenarioRuntimeErrorCode | undefined {
  if (code === SCENARIO_RUNTIME_ERROR_CODES.UNKNOWN_SCENARIO_ID || code === SCENARIO_RUNTIME_ERROR_CODES.FACTORY_FAILURE) {
    return code;
  }
  return undefined;
}

function toErrorCategory(category: unknown): ErrorCategory | undefined {
  if (
    category === 'validation' ||
    category === 'legality' ||
    category === 'runtime_init' ||
    category === 'integrity' ||
    category === 'internal_invariant'
  ) {
    return category;
  }
  return undefined;
}

function toErrorMetadata(metadata: unknown): ErrorMetadata | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as ErrorMetadata;
}

function stringifyCause(cause: unknown): string | undefined {
  if (cause instanceof Error) {
    return cause.message || cause.name || undefined;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return String(cause);
  }
  return undefined;
}

function isDiagnosticError(error: unknown): error is {
  readonly diagnostics: readonly { source: string; field: string; reason: string }[];
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'diagnostics' in error &&
    Array.isArray((error as { diagnostics?: unknown }).diagnostics)
  );
}

function toSnapshot(store: PresentationStoreState, runtimeAdapter: EngineRuntimeAdapter, scenarioRuntime: ScenarioRuntime): EngineSnapshot {
  return projectEngineSnapshot({
    state: store.state,
    events: store.recentEvents,
    selection: store.selection,
    tick: store.tick,
    view: store.view,
    getLegalActions: (state) => runtimeAdapter.queryLegalActions(state),
    teamColors: scenarioRuntime.metadata.teamColors,
  });
}

export function usePresentationStore(scenarioRuntime: ScenarioRuntime) {
  const runtimeAdapter = useMemo(() => createEngineRuntimeAdapter(scenarioRuntime), [scenarioRuntime]);
  const initialEngineSnapshot = useMemo(() => createInitialStoreState(runtimeAdapter), [runtimeAdapter]);

  const [store, setStore] = useState<PresentationStoreState>({
    tick: 0,
    state: initialEngineSnapshot.state,
    selection: undefined,
    view: INITIAL_VIEW,
    recentEvents: initialEngineSnapshot.recentEvents,
  });

  const snapshot = useMemo(
    () => toSnapshot(store, runtimeAdapter, scenarioRuntime),
    [store, runtimeAdapter, scenarioRuntime],
  );


  const actions = useMemo(
    () => ({
      selectTile: (x: number, y: number) => {
        const found = snapshot.entities.find(
          (entity) => Math.abs(entity.x - x) < 24 && Math.abs(entity.y - y) < 24,
        );
        setStore((prev) => ({ ...prev, selection: found?.id }));
      },
      pan: (dx: number, dy: number) => {
        setStore((prev) => ({
          ...prev,
          view: {
            ...prev.view,
            offsetX: prev.view.offsetX + dx,
            offsetY: prev.view.offsetY + dy,
          },
        }));
      },
      zoom: (factor: number) => {
        setStore((prev) => ({
          ...prev,
          view: {
            ...prev.view,
            zoom: Math.min(3, Math.max(0.6, prev.view.zoom * factor)),
          },
        }));
      },
      inspect: (x: number, y: number) => {
        setStore((prev) => {
          const inspectEvent: GameEvent = {
            kind: 'INTEGRITY_VIOLATION',
            invariant: 'ui.inspect',
            detail: `Inspect @ (${Math.round(x)}, ${Math.round(y)})`,
            turn: prev.state.turn,
            round: prev.state.round,
          };

          return {
            ...prev,
            recentEvents: [...prev.recentEvents, inspectEvent].slice(-4),
          };
        });
      },
      triggerAction: (action: Action) => {
        setStore((prev) => reduceStoreForTriggeredAction(prev, action, runtimeAdapter));
      },
    }),
    [runtimeAdapter, snapshot.entities],
  );

  return { snapshot, actions };
}
