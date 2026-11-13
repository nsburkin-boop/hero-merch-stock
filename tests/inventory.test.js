import test from 'node:test';
import assert from 'node:assert/strict';
import { isLow, nextVariant, skuId, validPhoto } from '../src/inventory.js';

test('the low-stock threshold applies to each location independently', () => {
  assert.deepEqual([0, 1, 2, 3, 20].map(isLow), [true, true, true, false, false]);
});

test('a transfer conserves stock and checks direction, amount and capacity', () => {
  const initial = { office: 4, warehouse: 12 };
  const moved = nextVariant('transfer', initial, { from: 'office', amount: 4 });
  assert.deepEqual(moved, { office: 0, warehouse: 16 });
  assert.deepEqual(nextVariant('transfer', moved, { from: 'warehouse', amount: 4 }), initial);
  assert.throws(() => nextVariant('transfer', initial, { from: 'office', amount: 5 }));
  assert.throws(() => nextVariant('transfer', initial, { from: 'office', amount: 0 }));
  assert.throws(() => nextVariant('transfer', initial, { from: 'other', amount: 1 }));
});

test('stock adjustments touch a single location and reject negative balances', () => {
  const initial = { office: 2, warehouse: 12 };
  assert.deepEqual(nextVariant('adjust', initial, { location: 'warehouse', delta: -4 }), { office: 2, warehouse: 8 });
  assert.throws(() => nextVariant('adjust', initial, { location: 'office', delta: -3 }));
});

test('SKUs normalize and Cloudinary URLs must match the configured cloud', () => {
  assert.equal(skuId(' hl-m.01 '), 'HL-M.01');
  assert.throws(() => skuId('a/b'));
  assert.equal(validPhoto('https://res.cloudinary.com/hero/image/upload/test.png', 'hero'), true);
  assert.equal(validPhoto('https://res.cloudinary.com/hero/image/upload/test.png', 'other'), false);
  assert.equal(validPhoto('https://res.cloudinary.com.evil.example/hero/image/upload/test.png', 'hero'), false);
});
