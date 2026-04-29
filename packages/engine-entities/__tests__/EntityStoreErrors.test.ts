import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENTITY_STORE_ERROR_CODES, EntityStore, EntityStoreError } from '../EntityStore';

test('createEntity duplicate failures use stable entity-store codes and metadata', () => {
  const store = new EntityStore();
  store.createEntity('entity-1');

  let error: unknown;
  try {
    store.createEntity('entity-1');
  } catch (caught) {
    error = caught;
  }

  if (!(error instanceof EntityStoreError)) {
    throw error instanceof Error ? error : new Error('Expected EntityStoreError');
  }

  assert.equal(error.code, ENTITY_STORE_ERROR_CODES.ENTITY_ALREADY_EXISTS);
  assert.equal(error.category, 'legality');
  assert.equal(error.metadata?.entityId, 'entity-1');
  assert.match(error.message, /already exists/u);
});

test('component writes for unknown entities expose stable entity-store codes and metadata', () => {
  const store = new EntityStore();

  let error: unknown;
  try {
    store.upsertComponent('position', 'missing', { x: 1, y: 1 });
  } catch (caught) {
    error = caught;
  }

  if (!(error instanceof EntityStoreError)) {
    throw error instanceof Error ? error : new Error('Expected EntityStoreError');
  }

  assert.equal(error.code, ENTITY_STORE_ERROR_CODES.ENTITY_UNKNOWN);
  assert.equal(error.category, 'legality');
  assert.equal(error.metadata?.entityId, 'missing');
  assert.match(error.message, /Unknown entity 'missing'/u);
});
