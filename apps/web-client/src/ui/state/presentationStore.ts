import { useMemo, useState } from 'react';
import {
  type GameEvent,
  type GameState,
  type Action,
  getActiveActorId,
} from 'engine-core';
import {
  EXAMPLE_SCENARIO_ID,
  createDefaultScenarioRuntimeRegistry,
  type ScenarioRuntime,
  type ScenarioRuntimeRegistry,
} from 'rules-sdk';
import { projectEngineSnapshot, type EngineSnapshot, type ViewState } from './engineSnapshot';
import { isSameAction } from './actionIdentity';

export type { EngineSnapshot, Entity, ViewState, EngineActionView } from './engineSnapshot';

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
  };
};

export function createPresentationStoreScenarioAdapter(options?: {
  readonly scenarioId?: string;
  readonly registry?: ScenarioRuntimeRegistry;
}): PresentationStoreScenarioAdapter {
  const scenarioId = options?.scenarioId ?? DEFAULT_SCENARIO_ID;
  const registry = options?.registry ?? createDefaultScenarioRuntimeRegistry();
  try {
    return {
      scenarioRuntime: registry.create(scenarioId),
    };
  } catch (error) {
    const diagnostics = isDiagnosticError(error) ? error.diagnostics : undefined;
    return {
      initializationError: {
        message: `Unable to initialize scenario '${scenarioId}'.`,
        diagnostics,
      },
    };
  }
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

type StoreState = {
  tick: number;
  state: GameState;
  selection?: string;
  view: ViewState;
  recentEvents: readonly GameEvent[];
};

function createInitialEngineSnapshot(runtime: ScenarioRuntime): Pick<StoreState, 'state' | 'recentEvents'> {
  const initialization = runtime.engine.initialize(runtime.createInitialState());
  return {
    state: initialization.state,
    recentEvents: initialization.events.slice(-4),
  };
}

function toSnapshot(store: StoreState, runtime: ScenarioRuntime): EngineSnapshot {
  return projectEngineSnapshot({
    state: store.state,
    events: store.recentEvents,
    selection: store.selection,
    tick: store.tick,
    view: store.view,
    getLegalActions: runtime.engine.getLegalActions.bind(runtime.engine),
    teamColors: runtime.metadata.teamColors,
  });
}

export function usePresentationStore(scenarioRuntime: ScenarioRuntime) {
  const initialEngineSnapshot = useMemo(() => createInitialEngineSnapshot(scenarioRuntime), [scenarioRuntime]);

  const [store, setStore] = useState<StoreState>({
    tick: 0,
    state: initialEngineSnapshot.state,
    selection: undefined,
    view: INITIAL_VIEW,
    recentEvents: initialEngineSnapshot.recentEvents,
  });

  const snapshot = useMemo(() => toSnapshot(store, scenarioRuntime), [store, scenarioRuntime]);

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
        setStore((prev) => {
          if (prev.state.matchStatus === 'ENDED') {
            return prev;
          }

          const activeActorId = getActiveActorId(prev.state);
          const legalActions = scenarioRuntime.engine.getLegalActions(prev.state, activeActorId);
          const isLegal = legalActions.some((candidate) => isSameAction(candidate, action));
          if (!isLegal) {
            return prev;
          }

          const result = scenarioRuntime.engine.step(prev.state, action);
          return {
            ...prev,
            tick: prev.tick + 1,
            state: result.state,
            recentEvents: result.events.slice(-4),
          };
        });
      },
    }),
    [scenarioRuntime, snapshot.entities],
  );

  return { snapshot, actions };
}
