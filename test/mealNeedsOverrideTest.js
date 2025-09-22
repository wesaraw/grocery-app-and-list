const storage = {
  mealCategories: [],
  mealsPerDay: {
    breakfast: 1,
    lunchDinner: 1
  },
  users: ['Alice', 'Bob'],
  userCategoryDays: [
    {
      breakfast: ['Monday'],
      lunchDinner: ['Monday']
    },
    {
      breakfast: ['Monday']
    }
  ],
  userPortionMultipliers: [1, 1.5],
  userPriceThresholds: {},
  itemSeasons: {},
  breakfastMeals: [
    {
      id: 'B1',
      name: 'Override Breakfast',
      ingredients: [{ name: 'Egg', amount: '1 ea' }],
      users: [true, true],
      userPortionOverrides: [undefined, 2]
    }
  ],
  lunchDinnerMeals: [
    {
      id: 'L1',
      name: 'Regular Lunch',
      ingredients: [{ name: 'Lettuce', amount: '1 ea' }],
      users: [true, false]
    }
  ],
  snackMeals: [],
  dessertMeals: [],
  densityRatios: {},
  itemNameMap: {},
  mealSlotOverrides: [
    {
      id: 'override-test',
      userIndex: 0,
      sourceCategoryId: 'lunchDinner',
      slotIndex: 0,
      overrideCategoryId: 'breakfast',
      days: ['Monday']
    }
  ],
  cookingDays: {}
};

global.chrome = {
  runtime: {
    getURL: path => path
  },
  storage: {
    local: {
      get(keys, callback) {
        if (typeof keys === 'string') {
          callback({ [keys]: storage[keys] });
          return;
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = storage[key];
          });
          callback(result);
          return;
        }
        if (keys && typeof keys === 'object') {
          const result = {};
          Object.keys(keys).forEach(key => {
            result[key] = storage[key] !== undefined ? storage[key] : keys[key];
          });
          callback(result);
          return;
        }
        callback({});
      },
      set(values, callback) {
        Object.assign(storage, values);
        if (callback) callback();
      }
    }
  }
};

const fetchMap = new Map([
  ['Required for grocery app/uom_conversion_table.json', {}],
  ['Required for grocery app/yearly_needs_with_manual_flags.json', []]
]);

global.fetch = async url => {
  const key = typeof url === 'string' ? url : url?.toString();
  if (!fetchMap.has(key)) {
    throw new Error(`Unexpected fetch request: ${key}`);
  }
  return {
    json: async () => fetchMap.get(key)
  };
};

const { calculateAndSaveMealNeeds } = await import('../utils/mealNeedsCalculator.js');

const { monthlyArr } = await calculateAndSaveMealNeeds();
const eggEntry = monthlyArr.find(item => item.name === 'Egg');
if (!eggEntry) {
  throw new Error('Expected Egg entry in monthly needs after override');
}
const expectedEgg = ((2 * 1 + 1 * 2) * 52) / 12; // Alice default multiplier, Bob override of 2
if (Math.abs(eggEntry.monthly_consumption - expectedEgg) > 1e-6) {
  throw new Error(
    `Egg consumption mismatch: ${eggEntry.monthly_consumption} vs expected ${expectedEgg}`
  );
}
if (monthlyArr.some(item => item.name === 'Lettuce')) {
  throw new Error('Lunch ingredient should be absent when slot is fully overridden');
}

console.log('meal slot override needs test passed');
