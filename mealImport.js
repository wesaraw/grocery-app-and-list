import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { loadUsers } from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { getIngredientMap } from './utils/ingredientStorage.js';
import { updateMealNutritionTotals } from './utils/mealNutritionCalculator.js';
import { initUomTable } from './utils/uomConverter.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { createInventoryLookup } from './utils/inventoryLookup.js';
import { loadGlobalProduceMeasures } from './utils/unitResolver.js';
import { NUTRIENT_DEFINITIONS } from './utils/fdcNutrientMap.js';
import { loadNutritionTargetLookup } from './utils/nutritionTargets.js';
import { ensureIngredientRecordForItem } from './utils/fdcClient.js';
import { getPendingMatch, setPendingMatch } from './utils/nutritionMatching.js';
import { canonicalName } from './utils/nameUtils.js';

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

let ingredientMapCache = {};
let densityMapCache = {};
let globalProduceMeasuresCache = {};
let nutritionTargetLookupCache = {};
let ensureIngredientRecordForItemHandler = ensureIngredientRecordForItem;

function sanitizePortionCount(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) {
    return 1;
  }
  return num;
}

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

async function ensureItemExists(name, unit, inventoryContext) {
  if (!name || !inventoryContext) return;
  const {
    needs = [],
    consumption = [],
    stock = [],
    expiration = [],
    consumed = [],
    storeSelections = [],
    purchases = {},
    densityMap = {},
    itemSeasons = {},
    hasItemByCanonical,
    markItemPresent,
    getOrCreateItemId
  } = inventoryContext;
  if (hasItemByCanonical?.(name)) {
    markItemPresent?.(name);
    return;
  }
  const normalizedUnit = unit?.trim() || DEFAULT_ITEM.unit;
  const itemId = await getOrCreateItemId?.(name);
  const withId = payload => (itemId != null ? { id: itemId, ...payload } : payload);
  needs.push(withId({
    name,
    total_needed_year: DEFAULT_ITEM.yearly,
    home_unit: normalizedUnit,
    treat_as_whole_unit: false,
    category: DEFAULT_ITEM.category
  }));
  consumption.push(withId({ name, monthly_consumption: DEFAULT_ITEM.monthly, unit: normalizedUnit }));
  stock.push(withId({ name, amount: 0, unit: normalizedUnit }));
  const shelf = DEFAULT_ITEM.shelf / WEEKS_PER_MONTH;
  expiration.push(withId({ name, shelf_life_months: shelf }));
  consumed.push(withId({ name, amount: 0, unit: normalizedUnit }));
  const storeRecords = Object.entries(STORE_LINKS).map(([storeName, builder]) =>
    withId({
      name,
      store: storeName,
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: builder(name),
      image: null
    })
  );
  storeSelections.push(...storeRecords);
  densityMap[name] = { convert: false, ratio: 1 };
  if (!purchases[name]) purchases[name] = [];
  purchases[name].push({ purchase_week: getCurrentWeek(), quantity_purchased: 0, date_added: new Date().toISOString() });
  if (!itemSeasons[name]) itemSeasons[name] = [];
  markItemPresent?.(name);

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

function resolveIngredientUnit(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return 'g';
  const sizeUnit = typeof ingredient.sizeUnit === 'string' ? ingredient.sizeUnit.trim() : '';
  const unit = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  const containerUnit = typeof ingredient.containerUnit === 'string' ? ingredient.containerUnit.trim() : '';
  const containerQuantityExists = typeof ingredient.containerQuantity === 'number' && Number.isFinite(ingredient.containerQuantity);
  const unitIsEach = unit.toLowerCase() === 'each';

  if (containerUnit && (unitIsEach || !unit || (ingredient.sizeUsedAsMeasurement && containerQuantityExists))) {
    return containerUnit;
  }

  if (sizeUnit) {
    return sizeUnit;
  }

  if (unit) {
    return unit;
  }

  if (containerUnit) {
    return containerUnit;
  }

  return 'g';
}

function resolveServingSizeText(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return '';
  if (typeof ingredient.serving_size === 'string' && ingredient.serving_size.trim().length > 0) {
    return ingredient.serving_size.trim();
  }
  if (typeof ingredient.amount === 'string' && ingredient.amount.trim().length > 0) {
    return ingredient.amount.trim();
  }
  const containerQuantityIsNumber = typeof ingredient.containerQuantity === 'number' && Number.isFinite(ingredient.containerQuantity);
  const containerUnitText = typeof ingredient.containerUnit === 'string' ? ingredient.containerUnit.trim() : '';
  if (containerQuantityIsNumber && containerUnitText) {
    const quantityText = `${ingredient.containerQuantity}`;
    return `${quantityText} ${containerUnitText}`.trim();
  }
  if (typeof ingredient.quantity === 'number' && Number.isFinite(ingredient.quantity)) {
    const quantityText = `${ingredient.quantity}`;
    const unitText = typeof ingredient.unit === 'string' && ingredient.unit.trim().length > 0
      ? ingredient.unit.trim()
      : '';
    return `${quantityText} ${unitText}`.trim();
  }
  if (typeof ingredient.sizeAmount === 'number' && Number.isFinite(ingredient.sizeAmount)) {
    const quantityText = `${ingredient.sizeAmount}`;
    const unitText = typeof ingredient.sizeUnit === 'string' && ingredient.sizeUnit.trim().length > 0
      ? ingredient.sizeUnit.trim()
      : '';
    return `${quantityText} ${unitText}`.trim();
  }
  return '';
}

function appendNutritionWarning(warnings, message) {
  if (!Array.isArray(warnings) || !message) return;
  warnings.push(message);
}

async function handleNutritionSyncResult(result, ingredient, warnings, unitForDefault) {
  if (!result || !ingredient) return;
  switch (result.status) {
    case 'needs-confirmation': {
      const existingPending = await getPendingMatch(ingredient.name);
      if (!existingPending) {
        await setPendingMatch(ingredient.name, {
          candidates: result.candidates || [],
          unitDefault: unitForDefault,
          source: 'meal-import'
        });
      }
      appendNutritionWarning(
        warnings,
        `Nutrition data for "${ingredient.name}" needs review. Open the nutrition matcher to confirm the best option.`
      );
      break;
    }
    case 'missing-api-key':
      appendNutritionWarning(
        warnings,
        `Nutrition data for "${ingredient.name}" could not sync because an FDC API key is not configured.`
      );
      break;
    case 'no-results':
      appendNutritionWarning(
        warnings,
        `Nutrition data for "${ingredient.name}" needs review because no matches were found automatically.`
      );
      break;
    case 'error':
      appendNutritionWarning(
        warnings,
        `Nutrition sync failed for "${ingredient.name}". Try syncing it from the nutrition screen.`
      );
      break;
    default:
      break;
  }
}

async function syncNutritionForNewItem(ingredient, context = {}) {
  if (!ingredient || typeof ingredient !== 'object' || !ingredient.name) {
    return;
  }
  const normalized = canonicalName(ingredient.name) || ingredient.name.toLowerCase();
  let tracker = context.attemptedNames instanceof Set ? context.attemptedNames : null;
  if (!tracker) {
    tracker = new Set();
    context.attemptedNames = tracker;
  }
  if (tracker) {
    if (tracker.has(normalized)) {
      return;
    }
    tracker.add(normalized);
  }
  const unitForDefault = resolveIngredientUnit(ingredient) || 'g';
  const servingSize = resolveServingSizeText(ingredient);
  try {
    const result = await ensureIngredientRecordForItemHandler(
      {
        name: ingredient.name,
        home_unit: unitForDefault,
        unit: unitForDefault,
        unit_default: unitForDefault,
        serving_size: servingSize || undefined
      },
      { unitDefault: unitForDefault }
    );
    await handleNutritionSyncResult(result, ingredient, context.warnings, unitForDefault);
  } catch (error) {
    console.error('Meal import nutrition sync failed', error);
    appendNutritionWarning(
      context.warnings,
      `Nutrition sync failed for "${ingredient.name}". Try syncing it from the nutrition screen.`
    );
  }
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
          if (typeof m.instructions !== 'string') {
            m.instructions = '';
          } else {
            m.instructions = m.instructions.trim();
          }
          if (typeof m.cookTime !== 'string') {
            m.cookTime = m.cookTime ? String(m.cookTime) : '';
          } else {
            m.cookTime = m.cookTime.trim();
          }
          if (typeof m.sourceUrl !== 'string') {
            m.sourceUrl = m.sourceUrl ? String(m.sourceUrl) : '';
          } else {
            m.sourceUrl = m.sourceUrl.trim();
          }
          if (!Array.isArray(m.importWarnings)) {
            m.importWarnings = [];
          }
          if (!Array.isArray(m.ingredients)) {
            m.ingredients = [];
          }
          m.totalPortions = sanitizePortionCount(m.totalPortions);
          m.ingredients.forEach(ing => {
            if (!ing || typeof ing !== 'object') return;
            if (ing.prepAhead === undefined) ing.prepAhead = false;
          });
        });
      }
      resolve(arr || []);
    });
  });
}

function saveMeals(category, arr) {
  const info = MEAL_TYPES[category] || MEAL_TYPES.lunchDinner;
  if (Array.isArray(arr)) {
    arr.forEach(meal => {
      if (meal && typeof meal === 'object') {
        updateMealNutritionTotals(meal, {
          ingredientMap: ingredientMapCache,
          densityMap: densityMapCache,
          globalProduceMeasures: globalProduceMeasuresCache,
          nutritionTargets: nutritionTargetLookupCache
        });
      }
    });
  }
  return new Promise(resolve => {
    chrome.storage.local.set({ [info.key]: arr }, () => resolve());
  });
}


function sanitizeCategoryId(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '');
}

function resolveCategoryId(rawCategory) {
  const sanitizedInput = sanitizeCategoryId(rawCategory);
  if (!sanitizedInput) return 'lunchDinner';

  if (MEAL_TYPES[sanitizedInput]) {
    return sanitizedInput;
  }

  for (const [id, info] of Object.entries(MEAL_TYPES)) {
    if (sanitizeCategoryId(id) === sanitizedInput) {
      return id;
    }
    if (info?.label && sanitizeCategoryId(info.label) === sanitizedInput) {
      return id;
    }
  }

  return 'lunchDinner';
}

function parsePortionText(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) return null;
  const normalized = Number(match[0]);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return normalized;
}

function readPortionFromElement(mealElement) {
  if (!mealElement) return 1;
  const tags = ['totalPortions', 'portions', 'portionCount', 'yield', 'servings'];
  for (const tag of tags) {
    const text = mealElement.querySelector(tag)?.textContent;
    const parsed = parsePortionText(text);
    if (parsed != null) return parsed;
  }
  return 1;
}

export function parseMealsFromXml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const meals = [];
  doc.querySelectorAll('meal').forEach(mEl => {
    const meal = {};
    const rawCategory = mEl.querySelector('category')?.textContent.trim();
    meal.category = resolveCategoryId(rawCategory);
    meal.name = mEl.querySelector('name')?.textContent.trim() || '';
    meal.recipeBook = mEl.querySelector('recipeBook')?.textContent.trim() || '';
    meal.image = mEl.querySelector('image')?.textContent.trim() || null;
    const userStr = mEl.querySelector('users')?.textContent.trim() || '';
    meal.users = userStr.split('').map(c => c === '1');
    meal.prepared = (mEl.querySelector('prepared')?.textContent.trim() || '').toLowerCase() === 'true';
    meal.group = (mEl.querySelector('group')?.textContent.trim() || '').toLowerCase() === 'true';
    const weight = parseFloat(mEl.querySelector('weight')?.textContent.trim());
    meal.weight = !isNaN(weight) && weight > 0 ? weight : 1;
    meal.totalPortions = sanitizePortionCount(readPortionFromElement(mEl));
    meal.ingredients = [];
    mEl.querySelectorAll('ingredients > item').forEach(iEl => {
      const name = iEl.querySelector('name')?.textContent.trim();
      const amt = iEl.querySelector('amount')?.textContent.trim();
      const unit = iEl.querySelector('unit')?.textContent.trim();
      if (name && amt && unit) {
        meal.ingredients.push({
          name,
          amount: `${amt} ${unit}`,
          unit,
          serving_size: `${amt} ${unit}`,
          prepAhead: false
        });
      }
    });
    if (meal.name && meal.ingredients.length) {
      meals.push(meal);
    }
  });
  return meals;
}

async function addMeal(meal, userCount) {
  const normalizedIngredients = Array.isArray(meal.ingredients)
    ? meal.ingredients.map(ing => ({
        ...ing,
        prepAhead: !!ing?.prepAhead
      }))
    : [];
  if (!Array.isArray(meal.importWarnings)) {
    meal.importWarnings = [];
  }
  let inventoryLookup = null;
  const attemptedNutritionSync = new Set();
  const ensureLookupLoaded = async () => {
    if (!inventoryLookup) {
      inventoryLookup = await createInventoryLookup({
        loadNeeds,
        loadConsumption,
        loadStock,
        loadExpiration,
        loadConsumed,
        loadStoreSelections,
        loadPurchases,
        loadDensityMap,
        loadItemSeasons
      });
    }
    return inventoryLookup;
  };
  for (const ing of normalizedIngredients) {
    if (!ing?.name) continue;
    const lookup = await ensureLookupLoaded();
    if (lookup.hasItemByCanonical?.(ing.name)) {
      continue;
    }
    const existedInCatalog = lookup.hasSerializedId?.(ing.name);
    const warning = existedInCatalog
      ? `Ingredient "${ing.name}" existed in the catalog but was missing from the inventory timeline, so default entries were created.`
      : `Ingredient "${ing.name}" was added to the inventory timeline.`;
    meal.importWarnings.push(warning);
    await ensureItemExists(ing.name, ing.unit, lookup);
    await syncNutritionForNewItemHandler(ing, {
      warnings: meal.importWarnings,
      attemptedNames: attemptedNutritionSync
    });
  }
  const totalPortions = sanitizePortionCount(meal.totalPortions);
  let usersArr = meal.users || [];
  if (usersArr.length < userCount) {
    for (let i = usersArr.length; i < userCount; i++) usersArr.push(false);
  } else if (usersArr.length > userCount) {
    usersArr = usersArr.slice(0, userCount);
  }
  const [latestDensity, latestIngredients, defaults, targets] = await Promise.all([
    loadDensityMap(),
    getIngredientMap(),
    loadGlobalProduceMeasures(),
    loadNutritionTargetLookup(NUTRIENT_DEFINITIONS)
  ]);
  densityMapCache = latestDensity || {};
  ingredientMapCache = latestIngredients || {};
  globalProduceMeasuresCache = defaults || {};
  nutritionTargetLookupCache = targets || {};
  const arr = await loadMeals(meal.category);
  const newMeal = {
    name: meal.name,
    recipeBook: meal.recipeBook || '',
    instructions: typeof meal.instructions === 'string' ? meal.instructions.trim() : '',
    cookTime: typeof meal.cookTime === 'string'
      ? meal.cookTime.trim()
      : typeof meal.time === 'string'
        ? meal.time.trim()
        : '',
    sourceUrl: typeof meal.sourceUrl === 'string' ? meal.sourceUrl.trim() : '',
    importWarnings: Array.isArray(meal.importWarnings) ? meal.importWarnings.slice() : [],
    ingredients: normalizedIngredients,
    users: usersArr,
    people: usersArr.filter(Boolean).length,
    prepared: meal.prepared,
    prepAhead: false,
    image: meal.image || null,
    weight: meal.weight,
    totalPortions,
    groupMeal: meal.group
  };
  updateMealNutritionTotals(newMeal, {
    ingredientMap: ingredientMapCache,
    densityMap: densityMapCache,
    globalProduceMeasures: globalProduceMeasuresCache,
    nutritionTargets: nutritionTargetLookupCache
  });
  arr.push(newMeal);
  await saveMeals(meal.category, arr);
  await calculateAndSaveMealNeeds();
}

let addMealHandler = addMeal;
let syncNutritionForNewItemHandler = syncNutritionForNewItem;

export function __setMealImportTestHooks(overrides = {}) {
  const {
    addMeal: addMealOverride,
    syncNutritionForNewItem: syncNutritionOverride,
    ensureIngredientRecordForItem: ensureIngredientOverride,
    skipOriginal = false,
    skipOriginalNutritionSync = false,
    skipOriginalEnsureIngredientRecordForItem = false
  } = overrides || {};
  if (typeof addMealOverride === 'function') {
    addMealHandler = async (meal, userCount) => {
      await addMealOverride(meal, userCount);
      if (!skipOriginal) {
        await addMeal(meal, userCount);
      }
    };
  } else {
    addMealHandler = addMeal;
  }
  if (typeof syncNutritionOverride === 'function') {
    syncNutritionForNewItemHandler = async (...args) => {
      await syncNutritionOverride(...args);
      if (!skipOriginalNutritionSync) {
        await syncNutritionForNewItem(...args);
      }
    };
  } else {
    syncNutritionForNewItemHandler = syncNutritionForNewItem;
  }
  if (typeof ensureIngredientOverride === 'function') {
    ensureIngredientRecordForItemHandler = async (...args) => {
      const overrideResult = await ensureIngredientOverride(...args);
      if (!skipOriginalEnsureIngredientRecordForItem) {
        return ensureIngredientRecordForItem(...args);
      }
      return overrideResult;
    };
  } else {
    ensureIngredientRecordForItemHandler = ensureIngredientRecordForItem;
  }
}

export async function importMealsFromText(text, images = {}, progressCallbacks = {}) {
  const { onStart = () => {}, onProgress = () => {}, onError = () => {}, onComplete = () => {} } = progressCallbacks;

  await initializeMealCategories();
  await initUomTable();
  const [users, initialDensity, initialIngredients, initialDefaults, initialTargets] = await Promise.all([
    loadUsers(),
    loadDensityMap(),
    getIngredientMap(),
    loadGlobalProduceMeasures(),
    loadNutritionTargetLookup(NUTRIENT_DEFINITIONS)
  ]);
  densityMapCache = initialDensity || {};
  ingredientMapCache = initialIngredients || {};
  globalProduceMeasuresCache = initialDefaults || {};
  nutritionTargetLookupCache = initialTargets || {};
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
      await addMealHandler(meal, users.length);
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

export async function importMealFromMealime(recipeData = {}) {
  await initializeMealCategories();
  await initUomTable();
  const users = await loadUsers();
  const selectedCategory = recipeData.category && MEAL_TYPES[recipeData.category]
    ? recipeData.category
    : 'lunchDinner';
  const normalizedMeal = {
    category: selectedCategory,
    name: recipeData.name || 'Mealime Recipe',
    recipeBook: recipeData.recipeBook || 'Mealime',
    instructions: typeof recipeData.instructions === 'string' ? recipeData.instructions : '',
    cookTime: typeof recipeData.cookTime === 'string'
      ? recipeData.cookTime
      : typeof recipeData.time === 'string'
        ? recipeData.time
        : '',
    time: typeof recipeData.time === 'string'
      ? recipeData.time
      : typeof recipeData.cookTime === 'string'
        ? recipeData.cookTime
        : '',
    sourceUrl: typeof recipeData.sourceUrl === 'string' ? recipeData.sourceUrl : '',
    importWarnings: Array.isArray(recipeData.importWarnings)
      ? recipeData.importWarnings.slice()
      : [],
    ingredients: Array.isArray(recipeData.ingredients)
      ? recipeData.ingredients.map(ingredient => ({ ...ingredient }))
      : [],
    users: Array.isArray(recipeData.users) ? recipeData.users.slice() : [],
    prepared: !!recipeData.prepared,
    prepAhead: !!recipeData.prepAhead,
    image: recipeData.image || null,
    weight: recipeData.weight,
    totalPortions: sanitizePortionCount(recipeData.totalPortions ?? recipeData.servings),
    group: recipeData.group ?? recipeData.groupMeal,
  };
  await addMealHandler(normalizedMeal, users.length);
  return {
    name: normalizedMeal.name,
    totalPortions: normalizedMeal.totalPortions,
    cookTime: normalizedMeal.cookTime,
    warnings: normalizedMeal.importWarnings.slice(),
    sourceUrl: normalizedMeal.sourceUrl,
    category: normalizedMeal.category,
  };
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

export const __mealImportInternals = {
  resolveIngredientUnit,
  resolveServingSizeText,
  syncNutritionForNewItem
};
