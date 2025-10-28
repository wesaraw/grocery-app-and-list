import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';

global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        if (requested.includes('itemNameMap')) {
          cb({ itemNameMap: { 'Green Beans': '123' } });
        } else {
          cb({});
        }
      },
      set: (_value, cb) => (typeof cb === 'function' ? cb() : undefined)
    }
  }
};

const needs = [
  { name: 'Green Beans', home_unit: 'each', total_needed_year: 0 }
];

const consumption = [{ name: '123', monthly_consumption: 1 }];
const stock = [];
const expiration = [{ name: '123', shelf_life_months: 1 }];

const result = await calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  [],
  [],
  {},
  1,
  {},
  {},
  true,
  {},
  '2025-01-01',
  '2025-01-08'
);

const entry = result.find(item => item.name === 'Green Beans');
if (!entry) {
  throw new Error('Expected Green Beans entry');
}
if (!(entry.toBuy > 0)) {
  throw new Error(`Expected positive toBuy but received ${entry.toBuy}`);
}

console.log('purchaseNeedsIdLookupTest passed');
