import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { createGestureHandlers } from '../gestureController';

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map<number, () => void>();

  return {
    api: {
      setTimeout: (callback: () => void) => {
        const id = nextId++;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id: number) => {
        timers.delete(id);
      },
    },
    runAll: () => {
      const callbacks = Array.from(timers.values());
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function callbacksRecorder() {
  const calls = {
    taps: [] as Array<[number, number]>,
    drags: [] as Array<[number, number]>,
    pinches: [] as number[],
    longPresses: [] as Array<[number, number]>,
  };

  return {
    calls,
    callbacks: {
      onTap: (x: number, y: number) => calls.taps.push([x, y]),
      onDrag: (dx: number, dy: number) => calls.drags.push([dx, dy]),
      onPinch: (factor: number) => calls.pinches.push(factor),
      onLongPress: (x: number, y: number) => calls.longPresses.push([x, y]),
    },
  };
}

test('fires tap when pointer up stays near initial pointer down position', () => {
  const { callbacks, calls } = callbacksRecorder();
  const handlers = createGestureHandlers(callbacks, createFakeTimers().api);

  handlers.onPointerDown({ pointerId: 1, clientX: 100, clientY: 200, setPointerCapture: () => undefined });
  handlers.onPointerMove({ pointerId: 1, clientX: 104, clientY: 201 });
  handlers.onPointerUp({ pointerId: 1, clientX: 105, clientY: 202 });

  assert.deepEqual(calls.taps, [[105, 202]]);
});

test('fires drag deltas during single pointer move', () => {
  const { callbacks, calls } = callbacksRecorder();
  const handlers = createGestureHandlers(callbacks, createFakeTimers().api);

  handlers.onPointerDown({ pointerId: 3, clientX: 10, clientY: 20, setPointerCapture: () => undefined });
  handlers.onPointerMove({ pointerId: 3, clientX: 16, clientY: 27 });
  handlers.onPointerMove({ pointerId: 3, clientX: 19, clientY: 30 });

  assert.deepEqual(calls.drags, [
    [6, 7],
    [3, 3],
  ]);
});

test('fires pinch but does not fire tap or long-press for multi-touch sequence', () => {
  const { callbacks, calls } = callbacksRecorder();
  const timers = createFakeTimers();
  const handlers = createGestureHandlers(callbacks, timers.api);

  handlers.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, setPointerCapture: () => undefined });
  handlers.onPointerDown({ pointerId: 2, clientX: 10, clientY: 0, setPointerCapture: () => undefined });
  handlers.onPointerMove({ pointerId: 2, clientX: 20, clientY: 0 });
  handlers.onPointerMove({ pointerId: 2, clientX: 30, clientY: 0 });
  handlers.onPointerUp({ pointerId: 2, clientX: 20, clientY: 0 });
  handlers.onPointerUp({ pointerId: 1, clientX: 0, clientY: 0 });
  timers.runAll();

  assert.equal(calls.pinches.length, 1);
  assert.equal(calls.taps.length, 0);
  assert.equal(calls.longPresses.length, 0);
});

test('cancels pending long-press once movement exceeds cancellation threshold', () => {
  const { callbacks, calls } = callbacksRecorder();
  const timers = createFakeTimers();
  const handlers = createGestureHandlers(callbacks, timers.api);

  handlers.onPointerDown({ pointerId: 9, clientX: 50, clientY: 50, setPointerCapture: () => undefined });
  handlers.onPointerMove({ pointerId: 9, clientX: 55, clientY: 50 });
  timers.runAll();

  assert.deepEqual(calls.longPresses, []);
});
