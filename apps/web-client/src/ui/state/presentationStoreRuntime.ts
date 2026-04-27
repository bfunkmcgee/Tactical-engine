import type { Action, GameEvent, GameState } from 'engine-core';
import type { EngineRuntimeAdapter } from '../../runtime/engineRuntimeAdapter';
import type { ViewState } from './engineSnapshot';

export type PresentationStoreState = {
  tick: number;
  state: GameState;
  selection?: string;
  view: ViewState;
  recentEvents: readonly GameEvent[];
};

export function createInitialStoreState(runtimeAdapter: EngineRuntimeAdapter): Pick<PresentationStoreState, 'state' | 'recentEvents'> {
  const initialization = runtimeAdapter.initialize();
  return {
    state: initialization.state,
    recentEvents: initialization.events.slice(-4),
  };
}

export function reduceStoreForTriggeredAction(
  prev: PresentationStoreState,
  action: Action,
  runtimeAdapter: EngineRuntimeAdapter,
): PresentationStoreState {
  const result = runtimeAdapter.dispatchAction(prev.state, action);
  if (!result.applied && result.events.length === 0) {
    return prev;
  }

  return {
    ...prev,
    tick: prev.tick + 1,
    state: result.applied ? result.state : prev.state,
    recentEvents: result.events.slice(-4),
  };
}
