import { useMemo, useState } from 'react';
import {
  type GameEvent,
  type GameState,
  type UnitState,
  createInitialState,
} from '../../../../../packages/engine-core/state/GameState';
import { advancePhase, getLegalActions, step } from '../../../../../packages/engine-core/simulation/Engine';
import { projectEngineSnapshot, type EngineSnapshot, type ViewState } from './engineSnapshot';

export type { EngineSnapshot, Entity, ViewState, EngineActionView } from './engineSnapshot';

const INITIAL_UNITS: UnitState[] = Array.from({ length: 80 }, (_, i) => ({
  id: `unit-${i + 1}`,
  ownerId: i % 2 === 0 ? 'player-1' : 'player-2',
  hp: 10,
  maxHp: 10,
}));

const INITIAL_VIEW: ViewState = { zoom: 1, offsetX: 0, offsetY: 0 };

function createInitialEngineState(): GameState {
  return advancePhase(createInitialState(['player-1', 'player-2'], INITIAL_UNITS));
}

type StoreState = {
  tick: number;
  state: GameState;
  selection?: string;
  view: ViewState;
  recentEvents: readonly GameEvent[];
};

function toSnapshot(store: StoreState): EngineSnapshot {
  return projectEngineSnapshot({
    state: store.state,
    events: store.recentEvents,
    selection: store.selection,
    tick: store.tick,
    view: store.view,
    getLegalActions,
  });
}

export function usePresentationStore() {
  const [store, setStore] = useState<StoreState>({
    tick: 0,
    state: createInitialEngineState(),
    selection: undefined,
    view: INITIAL_VIEW,
    recentEvents: [],
  });

  const snapshot = useMemo(() => toSnapshot(store), [store]);

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
      triggerAction: (actionId: string) => {
        setStore((prev) => {
          const legalActions = prev.state.activeActorId ? getLegalActions(prev.state, prev.state.activeActorId) : [];
          const action = legalActions.find((candidate) => candidate.id === actionId);
          if (!action) {
            return prev;
          }

          const result = step(prev.state, action);
          return {
            ...prev,
            tick: prev.tick + 1,
            state: result.state,
            recentEvents: result.events.slice(-4),
          };
        });
      },
    }),
    [snapshot.entities],
  );

  return { snapshot, actions };
}
