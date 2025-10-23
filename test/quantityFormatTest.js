import assert from 'assert';
import { roundQuantity, formatQuantity } from '../utils/quantityFormat.js';

const tests = [];

function addTest(name, fn) {
  tests.push({ name, fn });
}

addTest('roundQuantity clamps to hundredths', () => {
  assert.strictEqual(roundQuantity(1.6667), 1.67);
  assert.strictEqual(roundQuantity('2.345'), 2.35);
  const rounded = roundQuantity(-0.004);
  assert.ok(Object.is(rounded, -0) || rounded === 0);
});

addTest('roundQuantity preserves non-numeric values', () => {
  const sym = Symbol('value');
  assert.strictEqual(roundQuantity(null), null);
  assert.strictEqual(roundQuantity(undefined), undefined);
  assert.strictEqual(roundQuantity(sym), sym);
});

addTest('formatQuantity trims to tenths', () => {
  assert.strictEqual(formatQuantity(1.67), '1.7');
  assert.strictEqual(formatQuantity(2), '2');
  assert.strictEqual(formatQuantity(0), '0');
  assert.strictEqual(formatQuantity(-0.01), '0');
  assert.strictEqual(formatQuantity(-0.16), '-0.2');
});

addTest('formatQuantity handles strings and blanks', () => {
  assert.strictEqual(formatQuantity('3.555'), '3.6');
  assert.strictEqual(formatQuantity(''), '');
  assert.strictEqual(formatQuantity('   '), '   ');
});

let failed = 0;
for (const test of tests) {
  try {
    test.fn();
    console.log(`✅ ${test.name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${test.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
