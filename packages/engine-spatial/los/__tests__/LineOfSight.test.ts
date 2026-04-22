import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { LineOfSight, type ObstacleType } from '../LineOfSight';

test('LineOfSight aggregates cover and blocks on hard obstacles', () => {
  const obstacleMap = new Map<string, ObstacleType>([
    ['1,0', 'soft'],
    ['2,0', 'hard'],
  ]);

  const los = new LineOfSight({
    getObstacle: (cell) => obstacleMap.get(`${cell.q},${cell.r}`) ?? 'none',
    getCoverValue: () => 2,
  });

  const result = los.query({ q: 0, r: 0 }, { q: 3, r: 0 });
  assert.equal(result.visible, false);
  assert.equal(result.cover, 2);
  assert.deepEqual(result.blockedAt, { q: 2, r: 0 });
});

test('LineOfSight cache invalidates for movement, terrain, and turn changes', () => {
  const los = new LineOfSight({
    getObstacle: () => 'none',
    getCoverValue: () => 1,
  });

  const from = { q: 0, r: 0 };
  const to = { q: 3, r: 0 };
  assert.equal(los.query(from, to).fromCache, false);
  assert.equal(los.query(from, to).fromCache, true);

  los.invalidateOnMovement();
  assert.equal(los.query(from, to).fromCache, false);

  los.query(from, to);
  los.invalidateOnTerrainChange();
  assert.equal(los.query(from, to).fromCache, false);

  los.query(from, to);
  los.setTurn(2);
  assert.equal(los.query(from, to).fromCache, false);
});
