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
  { name: 'Pasta', home_unit: 'each', total_needed_year: 0, treat_as_whole_unit: false }
];
const consumption = [];
const stock = [];
const expiration = [{ name: 'pasta', shelf_life_months: 12 }];
const purchases = {
  Pasta: [
    {
      purchase_week: 10,
      quantity_purchased: 5,
      manual_expiration_override: null
    }
  ]
};

const mealsByCategory = {
  dinner: [
    {
      id: 'pastaNight',
      name: 'Pasta Night',
      people: 1,
      ingredients: [{ name: 'Pasta', serving_size: '1 each' }]
    }
  ]
};

const calendar = { User: {} };
['2025-01-01', '2025-01-02', '2025-01-03'].forEach(date => {
  calendar.User[date] = { dinner: { mealId: 'pastaNight', type: 'cook' } };
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
  {},
  '2025-01-01',
  '2025-01-02'
);

const pasta = result.find(item => item.name === 'Pasta');
if (!pasta) {
  throw new Error('Expected pasta result');
}
if (pasta.toBuy !== 2) {
  throw new Error(`Expected toBuy 2 but got ${pasta.toBuy}`);
}

console.log('commitDateRangeFilterTest passed');
