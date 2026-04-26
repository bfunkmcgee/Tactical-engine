import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { createInitialState } from 'engine-core';
import type { EngineRuntimeAdapter } from '../../../runtime/engineRuntimeAdapter';
import {
  createInitialStoreState,
  reduceStoreForTriggeredAction,
  type PresentationStoreState,
} from '../presentationStoreRuntime';

test('createInitialStoreState keeps only last four initialization events from adapter', () => {
  const initialState = createInitialState(['alpha', 'beta'], []);
  const adapter: EngineRuntimeAdapter = {
    initialize: () => ({
      state: initialState,
      events: [
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 1, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'beta', turn: 2, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 3, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'beta', turn: 4, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 5, round: 2 },
      ],
    }),
    queryLegalActions: () => [],
    dispatchAction: (state) => ({ applied: false, state, events: [] }),
    subscribe: () => () => undefined,
  };

  const store = createInitialStoreState(adapter);

  assert.equal(store.state, initialState);
  assert.equal(store.recentEvents.length, 4);
  assert.equal((store.recentEvents[0] as { turn: number }).turn, 2);
  assert.equal((store.recentEvents[3] as { turn: number }).turn, 5);
});

test('reduceStoreForTriggeredAction preserves store when adapter rejects action', () => {
  const state = createInitialState(['alpha', 'beta'], []);
  const store: PresentationStoreState = {
    tick: 4,
    state,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [],
  };

  const adapter: EngineRuntimeAdapter = {
    initialize: () => ({ state, events: [] }),
    queryLegalActions: () => [],
    dispatchAction: (incomingState) => ({ applied: false, state: incomingState, events: [] }),
    subscribe: () => () => undefined,
  };

  const nextStore = reduceStoreForTriggeredAction(store, { id: 'a1', actorId: 'alpha', type: 'PASS' }, adapter);

  assert.equal(nextStore, store);
});

test('reduceStoreForTriggeredAction updates tick/state and truncates adapter events when action applies', () => {
  const initial = createInitialState(['alpha', 'beta'], []);
  const nextState = { ...initial, turn: initial.turn + 1 };

  const store: PresentationStoreState = {
    tick: 1,
    state: initial,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [],
  };

  const adapter: EngineRuntimeAdapter = {
    initialize: () => ({ state: initial, events: [] }),
    queryLegalActions: () => [],
    dispatchAction: () => ({
      applied: true,
      state: nextState,
      events: [
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 1, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'beta', turn: 2, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 3, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'beta', turn: 4, round: 1 },
        { kind: 'TURN_STARTED', actorId: 'alpha', turn: 5, round: 2 },
      ],
    }),
    subscribe: () => () => undefined,
  };

  const nextStore = reduceStoreForTriggeredAction(store, { id: 'a2', actorId: 'alpha', type: 'PASS' }, adapter);

  assert.equal(nextStore.tick, 2);
  assert.equal(nextStore.state, nextState);
  assert.equal(nextStore.recentEvents.length, 4);
  assert.equal((nextStore.recentEvents[0] as { turn: number }).turn, 2);
  assert.equal((nextStore.recentEvents[3] as { turn: number }).turn, 5);
});
