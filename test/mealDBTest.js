import 'fake-indexeddb/auto';
import { db } from '../db.js';
import { saveMealRecord, loadMealsByType } from '../utils/mealData.js';

const storage = {};

global.chrome = {
  storage: {
    local: {
      get: (key, cb) => {
        if (key == null) return cb({ ...storage });
        if (typeof key === 'string') return cb({ [key]: storage[key] });
        if (Array.isArray(key)) {
          const res = {};
          for (const k of key) res[k] = storage[k];
          return cb(res);
        }
        cb({});
      },
      set: (obj, cb) => {
        Object.assign(storage, obj);
        cb && cb();
      },
      remove: (keys, cb) => {
        if (Array.isArray(keys)) {
          for (const k of keys) delete storage[k];
        } else {
          delete storage[keys];
        }
        cb && cb();
      }
    }
  }
};

async function run() {
  await db.meals.clear();
  await saveMealRecord({
    name: 'Test Meal',
    ingredients: [
      { name: 'Test Ingredient', amount: '1 cup', serving_size: '1 cup' }
    ],
    people: 1,
    prepared: false,
    prepAhead: false,
    recipeBook: '',
    image: null,
    weight: 1,
    groupMeal: false,
    category: 'lunchDinner'
  });
  const meals = await loadMealsByType('lunchDinner');
  const m = meals.find(meal => meal.name === 'Test Meal');
  if (!m) throw new Error('Meal not found');
  if (!m.ingredients[0] || m.ingredients[0].name !== 'Test Ingredient') {
    throw new Error('Ingredient name mismatch');
  }
  console.log('meal DB test passed');
}

await run();
