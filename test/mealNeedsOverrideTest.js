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
      breakfast: ['Monday'],
      lunchDinner: ['Monday']
    }
  ],
  userPortionMultipliers: [1, 1.5],
  userPriceThresholds: {},
  itemSeasons: {},
  breakfastMeals: [
    {
      id: 'B1',
      name: 'Override Breakfast',
      ingredients: [{ name: 'Egg', amount: '8 ea' }],
      users: [true, true],
      userPortionOverrides: [undefined, 2],
      totalPortions: 4
    }
  ],
  lunchDinnerMeals: [
    {
      id: 'L1',
      name: 'Regular Lunch',
      ingredients: [{ name: 'Lettuce', amount: '1 ea' }],
      users: [true, true]
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
  ['data/required-for-grocery-app/uom_conversion_table.json', {}],
  ['data/required-for-grocery-app/yearly_needs_with_manual_flags.json', []]
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
const eggPerPortion = 8 / 4; // per-serving egg count after totalPortions scaling
const aliceWeeklyEggs = eggPerPortion * 2 * 1; // two breakfast slots for Alice
const bobWeeklyEggs = eggPerPortion * 1 * 2; // Bob override of 2 on a single slot
const expectedEgg = ((aliceWeeklyEggs + bobWeeklyEggs) * 52) / 12;
if (Math.abs(eggEntry.monthly_consumption - expectedEgg) > 1e-6) {
  throw new Error(
    `Egg consumption mismatch: ${eggEntry.monthly_consumption} vs expected ${expectedEgg}`
  );
}
const lettuceEntry = monthlyArr.find(item => item.name === 'Lettuce');
if (!lettuceEntry) {
  throw new Error('Expected Lettuce entry for default portion meal');
}
const expectedLettuce = ((1 * 1.5) * 52) / 12; // Bob keeps default one-portion lunch with 1.5 multiplier
if (Math.abs(lettuceEntry.monthly_consumption - expectedLettuce) > 1e-6) {
  throw new Error(
    `Lettuce consumption mismatch: ${lettuceEntry.monthly_consumption} vs expected ${expectedLettuce}`
  );
}

console.log('meal slot override needs test passed');
