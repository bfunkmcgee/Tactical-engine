import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { resolveLayoutClass, subscribeLayoutClass } from '../App';

type Listener = () => void;

function createMediaQueryList(matches: boolean) {
  const listeners = new Set<Listener>();

  return {
    get matches() {
      return matches;
    },
    setMatches(nextValue: boolean) {
      matches = nextValue;
      listeners.forEach((listener) => listener());
    },
    addEventListener: (_event: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: Listener) => {
      listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
  };
}

test('resolveLayoutClass returns desktop, tablet, and mobile in precedence order', () => {
  assert.equal(
    resolveLayoutClass({
      desktop: { matches: true } as MediaQueryList,
      tablet: { matches: true } as MediaQueryList,
    }),
    'layout-desktop',
  );

  assert.equal(
    resolveLayoutClass({
      desktop: { matches: false } as MediaQueryList,
      tablet: { matches: true } as MediaQueryList,
    }),
    'layout-tablet',
  );

  assert.equal(
    resolveLayoutClass({
      desktop: { matches: false } as MediaQueryList,
      tablet: { matches: false } as MediaQueryList,
    }),
    'layout-mobile',
  );
});

test('subscribeLayoutClass emits updates and removes listeners on cleanup', () => {
  const desktopQuery = createMediaQueryList(false);
  const tabletQuery = createMediaQueryList(false);
  const emitted: string[] = [];

  const unsubscribe = subscribeLayoutClass(
    (query) => (query.includes('1200') ? (desktopQuery as unknown as MediaQueryList) : (tabletQuery as unknown as MediaQueryList)),
    (layoutClass) => emitted.push(layoutClass),
  );

  assert.deepEqual(emitted, ['layout-mobile']);

  tabletQuery.setMatches(true);
  desktopQuery.setMatches(true);

  assert.deepEqual(emitted, ['layout-mobile', 'layout-tablet', 'layout-desktop']);
  assert.equal(desktopQuery.listenerCount(), 1);
  assert.equal(tabletQuery.listenerCount(), 1);

  unsubscribe();

  assert.equal(desktopQuery.listenerCount(), 0);
  assert.equal(tabletQuery.listenerCount(), 0);
});
