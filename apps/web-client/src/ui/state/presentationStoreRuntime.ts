import type { GameState } from 'engine-core';
import type { RuntimeUpdate } from '../../runtime/appRuntimeFacade';
import type { ViewState } from './engineSnapshot';

export type PresentationStoreState = {
  tick: number;
  state: GameState;
  selection?: string;
  view: ViewState;
  recentEvents: RuntimeUpdate['recentEvents'];
};

export function createInitialStoreState(initialRuntimeUpdate: RuntimeUpdate): Pick<PresentationStoreState, 'state' | 'recentEvents'> {
  return {
    state: initialRuntimeUpdate.state,
    recentEvents: initialRuntimeUpdate.recentEvents,
  };
}

export function reduceStoreForTriggeredAction(
  prev: PresentationStoreState,
  runtimeUpdate: RuntimeUpdate,
): PresentationStoreState {
  if (!runtimeUpdate.applied && runtimeUpdate.recentEvents.length === 0) {
    return prev;
  }

  return {
    ...prev,
    tick: prev.tick + 1,
    state: runtimeUpdate.applied ? runtimeUpdate.state : prev.state,
    recentEvents: runtimeUpdate.recentEvents,
  };
}

export function applyInspectEvent(prev: PresentationStoreState, inspectDetail: string): PresentationStoreState {
  return {
    ...prev,
    recentEvents: [
      ...prev.recentEvents,
      {
        kind: 'INTEGRITY_VIOLATION' as const,
        invariant: 'ui.inspect',
        detail: inspectDetail,
        turn: prev.state.turn,
        round: prev.state.round,
      },
    ].slice(-4),
  };
}
