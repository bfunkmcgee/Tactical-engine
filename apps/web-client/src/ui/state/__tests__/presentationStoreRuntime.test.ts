import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { createInitialState, type GameEvent } from 'engine-core';
import type { RuntimeUpdate } from '../../../runtime/appRuntimeFacade';
import {
  applyInspectEvent,
  createInitialStoreState,
  reduceStoreForTriggeredAction,
  type PresentationStoreState,
} from '../presentationStoreRuntime';

test('createInitialStoreState uses runtime-shaped initial update', () => {
  const initialState = createInitialState(['alpha', 'beta'], []);
  const initialUpdate: RuntimeUpdate = {
    applied: true,
    state: initialState,
    recentEvents: [
      { kind: 'TURN_STARTED', actorId: 'beta', turn: 4, round: 2 },
      { kind: 'TURN_STARTED', actorId: 'alpha', turn: 5, round: 3 },
    ],
  };

  const store = createInitialStoreState(initialUpdate);

  assert.equal(store.state, initialState);
  assert.deepEqual(store.recentEvents, initialUpdate.recentEvents);
});

test('reduceStoreForTriggeredAction preserves store when runtime update has no effects', () => {
  const state = createInitialState(['alpha', 'beta'], []);
  const store: PresentationStoreState = {
    tick: 4,
    state,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [],
  };

  const update: RuntimeUpdate = {
    applied: false,
    state,
    recentEvents: [],
  };

  const nextStore = reduceStoreForTriggeredAction(store, update);

  assert.equal(nextStore, store);
});

test('reduceStoreForTriggeredAction surfaces rejection events/reasons from runtime update', () => {
  const state = createInitialState(['alpha', 'beta'], []);
  const store: PresentationStoreState = {
    tick: 2,
    state,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [{ kind: 'TURN_STARTED', actorId: 'alpha', turn: 1, round: 1 }],
  };

  const rejectionEvent: GameEvent = {
    kind: 'ACTION_REJECTED' as const,
    actorId: 'alpha',
    actionType: 'ATTACK',
    reason: 'ATTACK_AMOUNT_INVALID',
    details: { amount: -2 },
    turn: 1,
    round: 1,
  };

  const nextStore = reduceStoreForTriggeredAction(store, {
    applied: false,
    state,
    recentEvents: [rejectionEvent],
  });

  assert.equal(nextStore === store, false);
  assert.equal(nextStore.tick, 3);
  assert.equal(nextStore.state, store.state);
  assert.deepEqual(nextStore.recentEvents, [rejectionEvent]);
});

test('reduceStoreForTriggeredAction updates tick/state from runtime update when action applies', () => {
  const initial = createInitialState(['alpha', 'beta'], []);
  const nextState = { ...initial, turn: initial.turn + 1 };

  const store: PresentationStoreState = {
    tick: 1,
    state: initial,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [],
  };

  const nextStore = reduceStoreForTriggeredAction(store, {
    applied: true,
    state: nextState,
    recentEvents: [
      { kind: 'TURN_STARTED', actorId: 'beta', turn: 2, round: 1 },
      { kind: 'TURN_STARTED', actorId: 'alpha', turn: 3, round: 1 },
      { kind: 'TURN_STARTED', actorId: 'beta', turn: 4, round: 2 },
      { kind: 'TURN_STARTED', actorId: 'alpha', turn: 5, round: 2 },
    ],
  });

  assert.equal(nextStore.tick, 2);
  assert.equal(nextStore.state, nextState);
  assert.equal(nextStore.recentEvents.length, 4);
});

test('applyInspectEvent appends integrity event and truncates to four entries', () => {
  const state = createInitialState(['alpha', 'beta'], []);
  const store: PresentationStoreState = {
    tick: 0,
    state,
    selection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    recentEvents: [
      { kind: 'TURN_STARTED', actorId: 'alpha', turn: 1, round: 1 },
      { kind: 'TURN_STARTED', actorId: 'beta', turn: 2, round: 1 },
      { kind: 'TURN_STARTED', actorId: 'alpha', turn: 3, round: 1 },
      { kind: 'TURN_STARTED', actorId: 'beta', turn: 4, round: 1 },
    ],
  };

  const nextStore = applyInspectEvent(store, 'Inspect @ (1, 2)');

  assert.equal(nextStore.recentEvents.length, 4);
  assert.equal(nextStore.recentEvents[3]?.kind, 'INTEGRITY_VIOLATION');
});
