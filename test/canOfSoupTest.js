import 'fake-indexeddb/auto';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';
import { initUomTable } from '../utils/uomConverter.js';
import { db } from '../db.js';
import {
  convertArrayToIds,
  convertArrayToNames,
  convertObjectKeysToIds
} from '../utils/itemRegistry.js';

const storage = {};
global.chrome = {
  runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href },
  storage: {
    local: {
      get: (key, cb) => {
        if (key == null) return cb({});
        if (typeof key === 'string') return cb({ [key]: storage[key] });
        cb({});
      },
      set: (obj, cb) => {
        Object.assign(storage, obj);
        cb();
      }
    }
  }
};

global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });

await initUomTable();
await db.items.clear();
await db.lists.clear();
const data = JSON.parse(fs.readFileSync('grocery_backup (44).txt', 'utf8'));

async function convertItems(d) {
  d.yearlyNeeds = await convertArrayToNames(await convertArrayToIds(d.yearlyNeeds));
  d.monthlyConsumption = await convertArrayToNames(
    await convertArrayToIds(d.monthlyConsumption)
  );
  d.currentStock = await convertArrayToNames(await convertArrayToIds(d.currentStock));
  d.expirationData = await convertArrayToNames(
    await convertArrayToIds(d.expirationData)
  );
  d.consumedThisYear = await convertArrayToNames(
    await convertArrayToIds(d.consumedThisYear)
  );
  d.mealPlanYearly = await convertArrayToNames(
    await convertArrayToIds(d.mealPlanYearly)
  );
  d.purchases = await convertObjectKeysToIds(d.purchases || {});
  const mealKeys = ['breakfastMeals', 'lunchDinnerMeals', 'snackMeals', 'dessertMeals'];
  for (const key of mealKeys) {
    if (Array.isArray(d[key])) {
      for (const m of d[key]) {
        if (Array.isArray(m.ingredients)) {
          m.ingredients = await convertArrayToNames(
            await convertArrayToIds(m.ingredients)
          );
        }
      }
    }
  }
  return d;
}

await convertItems(data);

function buildMealsByCategory(d) {
  const result = {};
  const cats = d.mealCategories || [];
  for (const c of cats) result[c.id] = d[c.key] || [];
  for (const id of ['breakfast', 'lunchDinner', 'snack', 'dessert']) {
    if (!result[id]) result[id] = d[id + 'Meals'] || [];
  }
  return result;
}

const mealsByCategory = buildMealsByCategory(data);
const res = await calculatePurchaseNeeds(
  data.yearlyNeeds,
  data.monthlyConsumption,
  data.currentStock,
  data.expirationData,
  data.consumedThisYear,
  data.mealPlanYearly,
  data.purchases,
  30,
  data.whatToEatCalendar,
  mealsByCategory,
  false,
  {}
);
const soup = res.find(i => i.name === 'Can of Soup');
if (!soup || soup.toBuy !== 17) {
  throw new Error(`Expected toBuy 17 but got ${soup ? soup.toBuy : 'null'}`);
}
console.log('canOfSoup test passed');
