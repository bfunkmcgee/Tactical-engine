import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EntityStore } from '../EntityStore';

interface NestedStats {
  hp: number;
  nested: {
    buffs: number[];
  };
}

function getRequiredComponent(store: EntityStore, entityId: string): NestedStats {
  const component = store.getComponent<NestedStats>('stats', entityId);
  if (!component) {
    throw new Error(`Expected component for ${entityId}`);
  }

  return component;
}

test('upsertComponent defaults to deep clone for safe immutability under repeated writes', () => {
  const store = new EntityStore();
  store.createEntity('unit-1');

  const source: NestedStats = { hp: 10, nested: { buffs: [1, 2] } };
  for (let i = 0; i < 100; i += 1) {
    source.hp = 10 + i;
    source.nested.buffs[0] = i;
    store.upsertComponent('stats', 'unit-1', source);
  }

  source.hp = -1;
  source.nested.buffs[0] = -1;

  const stored = getRequiredComponent(store, 'unit-1');
  assert.equal(stored.hp, 109);
  assert.equal(stored.nested.buffs[0], 99);
});

test('getComponent with clone policy "none" reuses references during repeated reads', () => {
  const store = new EntityStore({
    clonePolicy: {
      onWrite: 'none',
      onRead: 'none',
      onSetInput: 'none',
    },
  });
  store.createEntity('unit-1');
  store.upsertComponent('stats', 'unit-1', { hp: 10, nested: { buffs: [1] } });

  const first = getRequiredComponent(store, 'unit-1');
  let last = first;
  for (let i = 0; i < 200; i += 1) {
    last = getRequiredComponent(store, 'unit-1');
  }

  assert.equal(last, first);

  first.hp = 77;
  const afterMutation = getRequiredComponent(store, 'unit-1');
  assert.equal(afterMutation.hp, 77);
});

test('setComponent honors clone policy while preserving default updater immutability', () => {
  const safeStore = new EntityStore();
  safeStore.createEntity('safe');
  safeStore.upsertComponent('stats', 'safe', { hp: 5, nested: { buffs: [1] } });

  const updaterInputs: NestedStats[] = [];
  for (let i = 0; i < 50; i += 1) {
    safeStore.setComponent<NestedStats>('stats', 'safe', (current) => {
      if (!current) {
        throw new Error('Expected current component for safe store');
      }

      updaterInputs.push(current);
      current.nested.buffs.push(100 + i);
      return { hp: current.hp + 1, nested: current.nested };
    });
  }

  assert.equal(new Set(updaterInputs).size, updaterInputs.length);
  const safeStored = getRequiredComponent(safeStore, 'safe');
  assert.equal(safeStored.hp, 55);
  assert.equal(safeStored.nested.buffs.length, 51);

  const fastStore = new EntityStore({
    clonePolicy: {
      onWrite: 'none',
      onRead: 'none',
      onSetInput: 'none',
    },
  });
  fastStore.createEntity('fast');
  fastStore.upsertComponent('stats', 'fast', { hp: 5, nested: { buffs: [1] } });

  const seenInputs: NestedStats[] = [];
  for (let i = 0; i < 50; i += 1) {
    fastStore.setComponent<NestedStats>('stats', 'fast', (current) => {
      if (!current) {
        throw new Error('Expected current component for fast store');
      }

      seenInputs.push(current);
      current.hp += 1;
      return current;
    });
  }

  const firstSeen = seenInputs[0];
  assert.ok(firstSeen);
  assert.ok(seenInputs.every((input) => input === firstSeen));
  const fastStored = getRequiredComponent(fastStore, 'fast');
  assert.equal(fastStored.hp, 55);
});
