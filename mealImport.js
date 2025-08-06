import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { loadUsers } from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArrayWithFallback,
  loadArray,
  saveArray,
  getItemId,
  convertArrayToNames,
  convertArrayToIds,
  loadObject,
  saveObject
} from './utils/itemRegistry.js';
import { db } from './db.js';

// Paths for inventory data used when adding new items
const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const SEARCH_RESULTS_KEY = 'searchResults';

const DEFAULT_ITEM = {
  yearly: 0,
  unit: 'oz',
  monthly: 0,
  shelf: 26, // weeks
  category: 'mass import'
};

const loadNeeds = () => loadArrayWithFallback('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () => loadArrayWithFallback('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArrayWithFallback('currentStock', STOCK_PATH);
const loadExpiration = () => loadArrayWithFallback('expirationData', EXPIRATION_PATH);
const loadSearchResults = () => loadObject(SEARCH_RESULTS_KEY);


async function loadConsumed() {
  const arr = await loadArray('consumedThisYear');
  if (arr.length > 0) return arr;
  const needs = await loadNeeds();
  return needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit }));
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

const STORE_LINKS = {
  'Stop & Shop': name =>
    `https://stopandshop.com/product-search/${name.replace(/ /g, '%20')}?searchRef=&semanticSearch=false`,
  Walmart: name =>
    `https://www.walmart.com/search?q=${encodeURIComponent(name.replace(/ /g, '+'))}&facet=fulfillment_method_in_store%3AIn-store%7C%7Cexclude_oos%3AShow+available+items+only`,
  Amazon: name =>
    `https://www.amazon.com/s?k=${name.split(/\s+/).map(encodeURIComponent).join('+')}`,
  Shaws: name =>
    `https://www.shaws.com/shop/search-results.html?q=${name.replace(/ /g, '%20')}`,
  'Roche Bros': name =>
    `https://onlineshopping.rochebros.com/search?searchTerms=${name.replace(/ /g, '%20')}`,
  Hannaford: name =>
    `https://www.hannaford.com/search/product?form_state=searchForm&keyword=${name.replace(/ /g, '+')}&ieDummyTextField=&productTypeId=P`
};

async function ensureItemExists(name) {
  const needs = await loadNeeds();
  if (needs.find(n => n.name === name)) return;
  const [consumption, stock, expiration, consumed, searchResults, purchases, densityMap, itemSeasons] = await Promise.all([
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadSearchResults(),
    loadPurchases(),
    loadDensityMap(),
    loadItemSeasons()
  ]);

  needs.push({
    name,
    total_needed_year: DEFAULT_ITEM.yearly,
    home_unit: DEFAULT_ITEM.unit,
    treat_as_whole_unit: false,
    category: DEFAULT_ITEM.category
  });
  consumption.push({ name, monthly_consumption: DEFAULT_ITEM.monthly, unit: DEFAULT_ITEM.unit });
  stock.push({ name, amount: 0, unit: DEFAULT_ITEM.unit });
  const shelf = DEFAULT_ITEM.shelf / WEEKS_PER_MONTH;
  expiration.push({ name, shelf_life_months: shelf });
  consumed.push({ name, amount: 0, unit: DEFAULT_ITEM.unit });
  searchResults[name] = {
    'Stop & Shop': { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Stop & Shop'](name), image: null },
    Walmart: { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Walmart'](name), image: null },
    Amazon: { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Amazon'](name), image: null },
    Shaws: { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Shaws'](name), image: null },
    'Roche Bros': { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Roche Bros'](name), image: null },
    Hannaford: { price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Hannaford'](name), image: null }
  };
  densityMap[name] = { convert: false, ratio: 1 };
  if (!purchases[name]) purchases[name] = [];
  purchases[name].push({ purchase_week: getCurrentWeek(), quantity_purchased: 0, date_added: new Date().toISOString() });
  itemSeasons[name] = [];

  await Promise.all([
    saveArray('yearlyNeeds', needs),
    saveArray('monthlyConsumption', consumption),
    saveArray('currentStock', stock),
    saveArray('expirationData', expiration),
    saveArray('consumedThisYear', consumed),
    saveObject(SEARCH_RESULTS_KEY, searchResults),
    savePurchases(purchases),
    saveDensityMap(densityMap),
    saveItemSeasons(itemSeasons)
  ]);
}

async function loadMeals(category) {
  const info = MEAL_TYPES[category] || MEAL_TYPES.lunchDinner;
  let arr = await db.meals.where('category').equals(category).toArray();
  if (!arr.length && info.path) {
    arr = await loadJSON(info.path).catch(() => []);
    for (const m of arr) {
      m.category = category;
    }
  }
  if (Array.isArray(arr)) {
    for (const m of arr) {
      m.ingredients = await convertArrayToNames(m.ingredients || []);
      if (m.prepared === undefined) m.prepared = false;
      if (m.prepAhead === undefined) m.prepAhead = false;
      if (m.recipeBook === undefined) m.recipeBook = '';
      if (m.weight === undefined) m.weight = 1;
      if (m.groupMeal === undefined) m.groupMeal = false;
    }
  }
  return arr || [];
}

async function saveMeals(category, arr) {
  const stored = [];
  for (const m of arr) {
    const ingredients = await convertArrayToIds(m.ingredients || []);
    stored.push({ ...m, category, ingredients });
  }
  await db.meals.where('category').equals(category).delete();
  if (stored.length) {
    await db.meals.bulkPut(stored);
  }
}

function parseMealsFromXml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const meals = [];
  doc.querySelectorAll('meal').forEach(mEl => {
    const meal = {};
    meal.category = mEl.querySelector('category')?.textContent.trim() || 'lunchDinner';
    meal.name = mEl.querySelector('name')?.textContent.trim() || '';
    meal.recipeBook = mEl.querySelector('recipeBook')?.textContent.trim() || '';
    meal.image = mEl.querySelector('image')?.textContent.trim() || null;
    const userStr = mEl.querySelector('users')?.textContent.trim() || '';
    meal.users = userStr.split('').map(c => c === '1');
    meal.prepared = (mEl.querySelector('prepared')?.textContent.trim() || '').toLowerCase() === 'true';
    meal.group = (mEl.querySelector('group')?.textContent.trim() || '').toLowerCase() === 'true';
    const weight = parseFloat(mEl.querySelector('weight')?.textContent.trim());
    meal.weight = !isNaN(weight) && weight > 0 ? weight : 1;
    meal.ingredients = [];
    mEl.querySelectorAll('ingredients > item').forEach(iEl => {
      const name = iEl.querySelector('name')?.textContent.trim();
      const amt = iEl.querySelector('amount')?.textContent.trim();
      const unit = iEl.querySelector('unit')?.textContent.trim();
      if (name && amt && unit) {
        meal.ingredients.push({ name, amount: `${amt} ${unit}`, serving_size: `${amt} ${unit}` });
      }
    });
    if (meal.name && meal.ingredients.length) {
      meals.push(meal);
    }
  });
  return meals;
}

async function addMeal(meal, userCount) {
  for (const ing of meal.ingredients) {
    await ensureItemExists(ing.name);
  }
  const converted = [];
  for (const ing of meal.ingredients) {
    const id = await getItemId(ing.name);
    converted.push({ id, amount: ing.amount, serving_size: ing.serving_size });
  }
  let usersArr = meal.users || [];
  if (usersArr.length < userCount) {
    for (let i = usersArr.length; i < userCount; i++) usersArr.push(false);
  } else if (usersArr.length > userCount) {
    usersArr = usersArr.slice(0, userCount);
  }
  const arr = await loadMeals(meal.category);
  arr.push({
    name: meal.name,
    recipeBook: meal.recipeBook || '',
    ingredients: converted,
    users: usersArr,
    people: usersArr.filter(Boolean).length,
    prepared: meal.prepared,
    prepAhead: false,
    image: meal.image || null,
    weight: meal.weight,
    groupMeal: meal.group
  });
  await saveMeals(meal.category, arr);
  await calculateAndSaveMealNeeds();
}

export async function importMealsFromText(text, images = {}) {
  await initializeMealCategories();
  const users = await loadUsers();
  const meals = parseMealsFromXml(text);
  for (const meal of meals) {
    if (meal.image && images[meal.image]) {
      meal.image = images[meal.image];
    } else if (meal.image && !images[meal.image]) {
      meal.image = null;
    }
    try {
      await addMeal(meal, users.length);
      alert(`Imported meal: ${meal.name}`);
    } catch (e) {
      alert(`Error importing ${meal.name}: ${e.message}`);
    }
  }
}

export function importMealsFromFiles(fileList) {
  const files = Array.from(fileList);
  const xmlFile = files.find(f => f.name.toLowerCase().endsWith('.xml'));
  if (!xmlFile) {
    alert('XML file not found');
    return;
  }
  const imageFiles = files.filter(f => f !== xmlFile);
  const images = {};

  Promise.all(
    imageFiles.map(
      f =>
        new Promise(resolve => {
          const r = new FileReader();
          r.onload = () => {
            images[f.name] = r.result;
            resolve();
          };
          r.readAsDataURL(f);
        })
    )
  ).then(() => {
    const reader = new FileReader();
    reader.onload = () => {
      importMealsFromText(reader.result, images);
    };
    reader.readAsText(xmlFile);
  });
}
