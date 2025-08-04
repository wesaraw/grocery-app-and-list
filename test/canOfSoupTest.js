import fs from 'fs';
import { pathToFileURL } from 'url';
import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';
import { initUomTable } from '../utils/uomConverter.js';

global.chrome = {
  runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href },
  storage: { local: { get: (_k, cb) => cb({}), set: (_o, cb) => cb() } }
};

global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });

await initUomTable();
const data = JSON.parse(fs.readFileSync('grocery_backup (44).txt', 'utf8'));

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
