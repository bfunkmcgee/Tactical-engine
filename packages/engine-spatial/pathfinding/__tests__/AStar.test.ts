import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AStar } from '../AStar';
import { SquareGridAdapter, type CellRef } from '../../grid/GridAdapter';

function key(cell: CellRef): string {
  return `${cell.q},${cell.r}`;
}

test('AStar finds deterministic path and serves cached repeats', () => {
  const grid = new SquareGridAdapter();
  const blocked = new Set<string>(['1,0']);

  const astar = new AStar(grid, {
    isCellWalkable: (cell) => !blocked.has(key(cell)),
    getTerrainCost: () => 1,
    getZoneOfControlPenalty: () => 0,
  });

  const query = { start: { q: 0, r: 0 }, goal: { q: 2, r: 0 }, moverId: 'unit-1' };
  const first = astar.findPath(query);
  const second = astar.findPath(query);

  assert.ok(first);
  if (!first) {
    return;
  }
  assert.equal(first.fromCache, false);
  assert.equal(second?.fromCache, true);
  assert.equal(first.totalCost, 4);
  assert.deepEqual(first.steps[0]?.cell, { q: 0, r: 0 });
  assert.deepEqual(first.steps.at(-1)?.cell, { q: 2, r: 0 });
});

test('AStar invalidates cache for movement, terrain, and turn changes', () => {
  const grid = new SquareGridAdapter();
  const astar = new AStar(grid, {
    isCellWalkable: () => true,
    getTerrainCost: () => 1,
    getZoneOfControlPenalty: () => 0,
  });

  const query = { start: { q: 0, r: 0 }, goal: { q: 0, r: 2 } };
  astar.findPath(query);
  assert.equal(astar.findPath(query)?.fromCache, true);

  astar.invalidateOnMovement();
  assert.equal(astar.findPath(query)?.fromCache, false);

  astar.findPath(query);
  astar.invalidateOnTerrainChange();
  assert.equal(astar.findPath(query)?.fromCache, false);

  astar.findPath(query);
  astar.setTurn(99);
  assert.equal(astar.findPath(query)?.fromCache, false);
});
