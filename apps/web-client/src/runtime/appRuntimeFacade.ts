import { type Action, type GameEvent, type GameState, getActiveActorId } from 'engine-core';
import type { ScenarioRuntime } from 'rules-sdk';

export type RuntimeUpdate = {
  readonly applied: boolean;
  readonly state: GameState;
  readonly recentEvents: readonly GameEvent[];
};

export type AppRuntimeFacade = {
  initialize: () => RuntimeUpdate;
  triggerAction: (state: GameState, action: Action) => RuntimeUpdate;
  queryLegalActions: (state: GameState) => readonly Action[];
};

const MAX_EVENTS = 4;

function shapeRuntimeUpdate(state: GameState, events: readonly GameEvent[], applied: boolean): RuntimeUpdate {
  return {
    applied,
    state,
    recentEvents: events.slice(-MAX_EVENTS),
  };
}

export function createAppRuntimeFacade(scenarioRuntime: ScenarioRuntime): AppRuntimeFacade {
  return {
    initialize: () => {
      const update = scenarioRuntime.engine.initialize(scenarioRuntime.createInitialState());
      return shapeRuntimeUpdate(update.state, update.events, true);
    },
    triggerAction: (state, action) => {
      if (state.matchStatus === 'ENDED') {
        return shapeRuntimeUpdate(state, [], false);
      }

      const update = scenarioRuntime.engine.step(state, action);
      const applied = update.events.some((event) => event.kind !== 'ACTION_REJECTED');
      return shapeRuntimeUpdate(update.state, update.events, applied);
    },
    queryLegalActions: (state) => {
      const activeActorId = getActiveActorId(state);
      return scenarioRuntime.engine.getLegalActions(state, activeActorId);
    },
  };
}
