import assert from 'assert/strict';
import { pathToFileURL } from 'url';
import fs from 'fs';

import { resolveIngredientAmount } from '../utils/unitResolver.js';
import { initUomTable } from '../utils/uomConverter.js';

if (!global.chrome) {
  global.chrome = { runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href } };
} else if (!global.chrome.runtime) {
  global.chrome.runtime = { getURL: p => pathToFileURL(process.cwd() + '/' + p).href };
} else if (typeof global.chrome.runtime.getURL !== 'function') {
  global.chrome.runtime.getURL = p => pathToFileURL(process.cwd() + '/' + p).href;
}

if (!global.fetch) {
  global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });
}

await initUomTable();

const ingredient = { name: 'Test Ingredient', amount: '1 cup' };
const record = {
  measures: [
    {
      source: 'fdc:portion',
      unit: 'cup',
      qty: 1,
      gramWeight: null
    }
  ]
};

const fallbackResult = resolveIngredientAmount(ingredient, record, '1 cup');
assert.ok(fallbackResult.grams && Math.abs(fallbackResult.grams - 240) < 1, 'should default to water-density grams');
assert.equal(fallbackResult.source, 'density:fallback');
assert.equal(fallbackResult.confidence, 'low');

const calibratedResult = resolveIngredientAmount(ingredient, record, '1 cup', {
  densityInfo: { convert: true, ratio: 0.5, source: 'density:calibrated', confidence: 'medium' }
});
assert.ok(calibratedResult.grams && Math.abs(calibratedResult.grams - 120) < 1, 'should respect stored density ratio');
assert.equal(calibratedResult.source, 'density:calibrated');
assert.equal(calibratedResult.confidence, 'medium');

const disabledResult = resolveIngredientAmount(ingredient, record, '1 cup', {
  densityInfo: { convert: false }
});
assert.equal(disabledResult.grams, null);
assert.equal(disabledResult.reason, 'conversion-failed');

const recordWithFdcGrams = {
  measures: [
    {
      source: 'fdc:portion',
      unit: 'cup',
      qty: 1,
      gramWeight: 160
    }
  ]
};

const densityPreferred = resolveIngredientAmount(ingredient, recordWithFdcGrams, '1 cup');
assert.ok(
  densityPreferred.grams && Math.abs(densityPreferred.grams - 240) < 1,
  'should prefer density conversion over FDC portion for volume units'
);
assert.notEqual(densityPreferred.source, 'fdc:portion');

const densityDisabledVolume = resolveIngredientAmount(ingredient, recordWithFdcGrams, '1 cup', {
  densityInfo: { convert: false }
});
assert.ok(
  densityDisabledVolume.grams && Math.abs(densityDisabledVolume.grams - 160) < 1,
  'should fall back to FDC portion when density is unavailable'
);
assert.equal(densityDisabledVolume.source, 'fdc:portion');

const countIngredient = { name: 'Counted Ingredient', amount: '1 each' };
const countRecord = {
  measures: [
    {
      source: 'fdc:portion',
      unit: 'each',
      qty: 1,
      gramWeight: 45
    }
  ]
};

const countResult = resolveIngredientAmount(countIngredient, countRecord, '1 each');
assert.ok(countResult.grams && Math.abs(countResult.grams - 45) < 1, 'should still use FDC portion for count units');
assert.equal(countResult.source, 'fdc:portion');

console.log('unitResolverTest passed');
