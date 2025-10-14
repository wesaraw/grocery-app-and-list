import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';

global.chrome = {
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: (_value, cb) => (typeof cb === 'function' ? cb() : undefined)
    }
  }
};

const needs = [
  { name: 'Apple', home_unit: 'each', total_needed_year: 0, treat_as_whole_unit: false }
];
const consumption = [];
const stock = [];
const expiration = [{ name: ' apple ', shelf_life_months: 0.23 }];
const purchases = {};

const mealsByCategory = {
  snack: [
    {
      id: 'appleSnack',
      name: 'Apple Snack',
      people: 1,
      ingredients: [{ name: 'APPLE', serving_size: '1 each' }]
    }
  ]
};

const calendar = { 'User 1': {} };
['2025-01-01', '2025-01-08', '2025-01-15', '2025-01-22', '2025-01-29', '2025-02-05'].forEach(date => {
  calendar['User 1'][date] = { snack: { mealId: 'appleSnack', type: 'cook' } };
});

const result = await calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  [],
  [],
  purchases,
  1,
  calendar,
  mealsByCategory,
  true,
  {}
);

const apple = result.find(item => item.name === 'Apple');
if (!apple) {
  throw new Error('Expected apple result');
}
if (apple.toBuy !== 1) {
  throw new Error(`Expected toBuy 1 but got ${apple.toBuy}`);
}

console.log('purchaseExpirationCanonicalTest passed');
