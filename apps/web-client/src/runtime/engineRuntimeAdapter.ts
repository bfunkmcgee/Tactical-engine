import { type Action, type GameEvent, type GameState, getActiveActorId } from 'engine-core';
import type { ScenarioRuntime } from 'rules-sdk';

export type EngineRuntimeUpdate = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
};

export type EngineRuntimeAdapter = {
  dispatchAction: (state: GameState, action: Action) => {
    readonly applied: boolean;
    readonly state: GameState;
    readonly events: readonly GameEvent[];
  };
  queryLegalActions: (state: GameState) => readonly Action[];
  initialize: () => EngineRuntimeUpdate;
  subscribe: (listener: (update: EngineRuntimeUpdate) => void) => () => void;
};

export function createEngineRuntimeAdapter(scenarioRuntime: ScenarioRuntime): EngineRuntimeAdapter {
  const listeners = new Set<(update: EngineRuntimeUpdate) => void>();

  const emit = (update: EngineRuntimeUpdate) => {
    listeners.forEach((listener) => listener(update));
  };

  return {
    initialize: () => {
      const update = scenarioRuntime.engine.initialize(scenarioRuntime.createInitialState());
      emit(update);
      return update;
    },
    queryLegalActions: (state) => {
      const activeActorId = getActiveActorId(state);
      return scenarioRuntime.engine.getLegalActions(state, activeActorId);
    },
    dispatchAction: (state, action) => {
      if (state.matchStatus === 'ENDED') {
        return { applied: false, state, events: [] };
      }

      const update = scenarioRuntime.engine.step(state, action);
      emit(update);
      const applied = update.events.some((event) => event.kind !== 'ACTION_REJECTED');
      return {
        applied,
        state: update.state,
        events: update.events,
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
