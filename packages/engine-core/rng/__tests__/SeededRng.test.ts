import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { SeededRng } from '../SeededRng';

test('SeededRng replays identical sequences for identical seeds', () => {
  const a = new SeededRng(0xdecafbad);
  const b = new SeededRng(0xdecafbad);

  const seqA = Array.from({ length: 8 }, () => a.nextInt(1, 100));
  const seqB = Array.from({ length: 8 }, () => b.nextInt(1, 100));

  assert.deepEqual(seqA, seqB);
  assert.equal(a.snapshot(), b.snapshot());
});

test('SeededRng golden outputs for seed 1337', () => {
  const rng = new SeededRng(1337);
  const floats = [rng.nextFloat(), rng.nextFloat(), rng.nextFloat()].map((v) => Number(v.toFixed(8)));
  const ints = [rng.nextInt(1, 6), rng.nextInt(1, 6), rng.nextInt(1, 6)];

  assert.deepEqual(floats, [0.18441183, 0.18998925, 0.81047199]);
  assert.deepEqual(ints, [4, 3, 3]);
});

test('SeededRng throws on invalid ranges', () => {
  const rng = new SeededRng(42);
  assert.throws(() => rng.nextInt(2, 1), /maxInclusive must be >= minInclusive/);
});
