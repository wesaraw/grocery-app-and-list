import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { loadUsers } from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';

// Paths for inventory data used when adding new items
const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

const DEFAULT_ITEM = {
  yearly: 0,
  unit: 'oz',
  monthly: 0,
  shelf: 26, // weeks
  category: 'mass import'
};

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArray('currentStock', STOCK_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);
const loadStoreSelections = () => loadArray(STORE_SELECTION_KEY, STORE_SELECTION_PATH);


function loadConsumed() {
  return new Promise(async resolve => {
    chrome.storage.local.get('consumedThisYear', async data => {
      if (data.consumedThisYear) {
        resolve(data.consumedThisYear);
      } else {
        const needs = await loadNeeds();
        resolve(needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit })));
      }
    });
  });
}

function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
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

async function ensureItemExists(name, unit) {
  const needs = await loadNeeds();
  if (needs.find(n => n.name === name)) return;
  const normalizedUnit = unit?.trim() || DEFAULT_ITEM.unit;
  const [consumption, stock, expiration, consumed, storeSelections, purchases, densityMap, itemSeasons] = await Promise.all([
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
    loadPurchases(),
    loadDensityMap(),
    loadItemSeasons()
  ]);

  needs.push({
    name,
    total_needed_year: DEFAULT_ITEM.yearly,
    home_unit: normalizedUnit,
    treat_as_whole_unit: false,
    category: DEFAULT_ITEM.category
  });
  consumption.push({ name, monthly_consumption: DEFAULT_ITEM.monthly, unit: normalizedUnit });
  stock.push({ name, amount: 0, unit: normalizedUnit });
  const shelf = DEFAULT_ITEM.shelf / WEEKS_PER_MONTH;
  expiration.push({ name, shelf_life_months: shelf });
  consumed.push({ name, amount: 0, unit: normalizedUnit });
  storeSelections.push(
    { name, store: 'Stop & Shop', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Stop & Shop'](name), image: null },
    { name, store: 'Walmart', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Walmart'](name), image: null },
    { name, store: 'Amazon', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Amazon'](name), image: null },
    { name, store: 'Shaws', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Shaws'](name), image: null },
    { name, store: 'Roche Bros', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Roche Bros'](name), image: null },
    { name, store: 'Hannaford', price: null, convertedQty: null, pricePerUnit: null, link: STORE_LINKS['Hannaford'](name), image: null }
  );
  densityMap[name] = { convert: false, ratio: 1 };
  if (!purchases[name]) purchases[name] = [];
  purchases[name].push({ purchase_week: getCurrentWeek(), quantity_purchased: 0, date_added: new Date().toISOString() });
  itemSeasons[name] = [];

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    save(STORE_SELECTION_KEY, storeSelections),
    savePurchases(purchases),
    saveDensityMap(densityMap),
    saveItemSeasons(itemSeasons)
  ]);
}

function loadMeals(category) {
  const info = MEAL_TYPES[category] || MEAL_TYPES.lunchDinner;
  return new Promise(async resolve => {
    chrome.storage.local.get(info.key, async data => {
      let arr = data[info.key];
      if (!arr) arr = await loadJSON(info.path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.prepAhead === undefined) m.prepAhead = false;
          if (m.leftoverOk === undefined) m.leftoverOk = false;
          if (m.recipeBook === undefined) m.recipeBook = '';
        });
      }
      resolve(arr || []);
    });
  });
}

function saveMeals(category, arr) {
  const info = MEAL_TYPES[category] || MEAL_TYPES.lunchDinner;
  return new Promise(resolve => {
    chrome.storage.local.set({ [info.key]: arr }, () => resolve());
  });
}

const CATEGORY_MAP = {
  instantbreakfast: 'breakfast'
};

export function parseMealsFromXml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const meals = [];
  doc.querySelectorAll('meal').forEach(mEl => {
    const meal = {};
    const rawCategory = mEl.querySelector('category')?.textContent.trim();
    const normalizedCategory =
      CATEGORY_MAP[rawCategory?.toLowerCase()] || rawCategory || 'lunchDinner';
    meal.category = normalizedCategory;
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
        meal.ingredients.push({ name, amount: `${amt} ${unit}`, unit, serving_size: `${amt} ${unit}` });
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
    await ensureItemExists(ing.name, ing.unit);
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
    ingredients: meal.ingredients,
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

export async function importMealsFromText(text, images = {}, progressCallbacks = {}) {
  const { onStart = () => {}, onProgress = () => {}, onError = () => {}, onComplete = () => {} } = progressCallbacks;

  await initializeMealCategories();
  const users = await loadUsers();
  const meals = parseMealsFromXml(text);
  const total = meals.length;

  onStart(total);
  if (total === 0) {
    onComplete({ total: 0, successCount: 0, errors: [] });
    return { total: 0, successCount: 0, errors: [] };
  }

  let processed = 0;
  let successCount = 0;
  const errors = [];

  for (const meal of meals) {
    if (meal.image && images[meal.image]) {
      meal.image = images[meal.image];
    } else if (meal.image && !images[meal.image]) {
      meal.image = null;
    }
    try {
      await addMeal(meal, users.length);
      successCount += 1;
    } catch (error) {
      errors.push({ meal, error });
      onError({ meal, error, processed: processed + 1, total });
    } finally {
      processed += 1;
      onProgress(processed, total);
    }
  }

  const summary = { total, successCount, errors };
  onComplete(summary);
  return summary;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

export async function importMealsFromFiles(fileList, progressCallbacks = {}) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return { total: 0, successCount: 0, errors: [] };
  }

  const xmlFile = files.find(f => f.name.toLowerCase().endsWith('.xml'));
  if (!xmlFile) {
    throw new Error('XML file not found');
  }

  const imageFiles = files.filter(f => f !== xmlFile);
  const images = {};

  for (const imageFile of imageFiles) {
    images[imageFile.name] = await readFileAsDataURL(imageFile);
  }

  const xmlText = await readFileAsText(xmlFile);
  return importMealsFromText(xmlText, images, progressCallbacks);
}
