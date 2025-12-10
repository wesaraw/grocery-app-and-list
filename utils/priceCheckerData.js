import { loadJSON } from './dataLoader.js';
import { calculatePurchaseNeeds } from './purchaseCalculator.js';
import { initUomTable } from './uomConverter.js';
import { loadDensityMap } from './unitNormalize.js';
import { MEAL_TYPES, initializeMealCategories, loadCookingDays } from './mealData.js';
import { loadGlobalProduceMeasures } from './unitResolver.js';
import { sortItemsByCategory } from './sortByCategory.js';
import { loadPurchases } from './purchaseStorage.js';
import { getIngredientMap, updateIngredient } from './ingredientStorage.js';
import {
  loadArray as loadItemArray,
  convertArrayToNames,
  getItemNameMap
} from './itemStorage.js';
import { formatQuantity } from './quantityFormat.js';
import { getStoreNamesForItem } from './storeCatalog.js';
import { hydrateAverageEachWeights } from './eachWeight.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const CONSUMED_PATH = 'consumedThisYear';

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadMonthlyConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);

async function loadStock() {
  return new Promise(async resolve => {
    chrome.storage.local.get('currentStock', async data => {
      if (data.currentStock) {
        resolve(data.currentStock);
      } else {
        const stock = await loadJSON(STOCK_PATH);
        resolve(stock);
      }
    });
  });
}

function getTodayIsoDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function getCurrentWeek() {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  const week = Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
  return { week, isoDate: getTodayIsoDate() };
}

async function loadConsumed() {
  return new Promise(async resolve => {
    chrome.storage.local.get(CONSUMED_PATH, async data => {
      if (data[CONSUMED_PATH]) {
        resolve(data[CONSUMED_PATH]);
      } else {
        const needs = await loadNeeds();
        resolve(
          needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit }))
        );
      }
    });
  });
}

function loadStoredArray(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

const loadMealPlanMonth = () => loadStoredArray('mealPlanMonthly');

function loadCalendar() {
  return new Promise(resolve => {
    chrome.storage.local.get('whatToEatCalendar', data => {
      resolve(data.whatToEatCalendar || {});
    });
  });
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.leftoverOk === undefined) m.leftoverOk = false;
          if (typeof m.instructions !== 'string') {
            m.instructions = '';
          } else {
            m.instructions = m.instructions.trim();
          }
        });
      }
      resolve(arr || []);
    });
  });
}

async function loadMealsByCategory() {
  await initializeMealCategories();
  const result = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    result[type] = await loadMeals(type);
  }
  return result;
}

async function getData() {
  const [
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    meals,
    dMap,
    ingredientMap,
    globalProduceMeasures,
    cookingDays
  ] = await Promise.all([
    loadNeeds(),
    loadMonthlyConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadPurchases(),
    loadStoredArray('mealPlanYearly'),
    loadMealPlanMonth(),
    loadCalendar(),
    loadMealsByCategory(),
    loadDensityMap(),
    getIngredientMap(),
    loadGlobalProduceMeasures(),
    loadCookingDays()
  ]);
  return {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory: meals,
    density: dMap,
    ingredientMap,
    globalProduceMeasures,
    cookingDays
  };
}

let itemNameToIdMap = {};
let itemIdToNameMap = {};

function resolvedNameKey(name) {
  if (name == null) return '';
  const resolved = resolveItemName(name);
  if (resolved && resolved.trim()) return resolved;
  const str = String(name).trim();
  return str;
}

function mapByResolvedName(list, transform = entry => entry) {
  const map = new Map();
  (list || []).forEach(entry => {
    if (!entry) return;
    const key = resolvedNameKey(entry.name);
    if (!key) return;
    map.set(key, transform(entry, key));
  });
  return map;
}

function normalizeEntriesByName(list) {
  return (list || []).map(entry => {
    if (!entry) return entry;
    const key = resolvedNameKey(entry.name);
    if (!key || key === entry.name) return entry;
    return { ...entry, name: key };
  });
}

function mergeNeedsWithPurchases(needsList = [], purchaseList = []) {
  const combined = [];
  const seen = new Set();

  needsList.forEach(item => {
    const key = resolvedNameKey(item?.name);
    if (key) seen.add(key);
    combined.push(item);
  });

  purchaseList.forEach(purchase => {
    const key = resolvedNameKey(purchase?.name);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const ing =
      ingredientMapData[key] ||
      ingredientMapData[resolveItemName(key)] ||
      ingredientMapData[purchase?.name] || {};
    const category =
      ing.category || ing.food_category || ing.categoryName || 'Other';
    const homeUnit = purchase?.home_unit || ing.home_unit || ing.unit || 'each';

    combined.push({
      name: purchase?.name,
      home_unit: homeUnit,
      category
    });
  });

  return combined;
}

function lookupByNameOrId(map, name) {
  if (!map || typeof map.get !== 'function') return undefined;
  for (const key of aliasKeys(name)) {
    if (map.has(key)) {
      return map.get(key);
    }
  }
  return undefined;
}

function resolveItemName(name) {
  if (name == null) return '';
  const str = String(name);
  return itemIdToNameMap[str] || str;
}

function aliasKeys(name) {
  if (name == null) return [];
  const keys = new Set();
  const str = String(name);
  if (str) keys.add(str);
  const resolved = resolveItemName(str);
  if (resolved && resolved !== str) {
    keys.add(resolved);
  }
  const idFromResolved = itemNameToIdMap[resolved];
  if (idFromResolved) {
    keys.add(idFromResolved);
  }
  const idFromOriginal = itemNameToIdMap[str];
  if (idFromOriginal) {
    keys.add(idFromOriginal);
  }
  return Array.from(keys);
}

let ingredientMapData = {};
let densityMap = {};
let globalProduceMeasuresData = {};
let cookingDaysData = {};

async function ensureWeightHydration(needs) {
  await hydrateAverageEachWeights(needs, {
    ingredientMap: ingredientMapData,
    densityMap,
    globalProduceMeasures: globalProduceMeasuresData
  }, { updateIngredient });
}

function passesNeedFilter(needAmt, includeZero) {
  return includeZero || (needAmt != null && needAmt > 0);
}

function buildNeedLevel(needAmt) {
  if (!(needAmt > 0)) return 'optional';
  if (needAmt >= 10) return 'high';
  if (needAmt >= 5) return 'medium';
  return 'optional';
}

function buildNeedLabel(needAmt, unit) {
  if (needAmt == null || isNaN(needAmt)) return 'No need';
  return `${formatQuantity(needAmt)} ${unit || ''}`.trim();
}

async function getFinal(itemName) {
  const key = `final_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([key], data => resolve(data[key]));
  });
}

async function getFinalProduct(itemName) {
  const key = `final_product_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([key], data => resolve(data[key]));
  });
}

export async function fetchFinalSelection(itemName) {
  const [store, product] = await Promise.all([
    getFinal(itemName),
    getFinalProduct(itemName)
  ]);
  return { store, product };
}

function normalizeSearchText(searchText = '') {
  return searchText
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchTokens(name, category, storeTokens = []) {
  return [name, category, ...storeTokens]
    .filter(Boolean)
    .map(str =>
      str
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

const baseSnapshotState = {
  promise: null,
  data: null
};

const metadataCache = new Map();
const categoryItemsCache = new Map();

async function computeBaseSnapshot() {
  await initUomTable();
  const {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory,
    density,
    cookingDays,
    ingredientMap,
    globalProduceMeasures
  } = await getData();

  const nameMap = await getItemNameMap();
  itemNameToIdMap = nameMap || {};
  itemIdToNameMap = {};
  Object.entries(itemNameToIdMap).forEach(([name, id]) => {
    if (id != null) {
      itemIdToNameMap[String(id)] = name;
    }
  });

  const normalizedNeeds = normalizeEntriesByName(needs);
  densityMap = density;
  ingredientMapData = ingredientMap || {};
  globalProduceMeasuresData = globalProduceMeasures || {};
  cookingDaysData = cookingDays || {};
  await ensureWeightHydration(normalizedNeeds);

  const consMap = mapByResolvedName(consumption, (c, key) =>
    key === c.name ? c : { ...c, name: key }
  );
  const hasCalendar = calendar && Object.keys(calendar).length > 0;
  if (!hasCalendar) {
    (mealMonth || []).forEach(m => {
      const rec = lookupByNameOrId(consMap, m.name);
      if (rec) rec.monthly_consumption += m.monthly_consumption;
      else {
        const key = resolvedNameKey(m.name);
        if (!key) return;
        consMap.set(key, {
          name: key,
          monthly_consumption: m.monthly_consumption
        });
      }
    });
  }
  const consumptionData = Array.from(consMap.values());

  const { week, isoDate } = getCurrentWeek();
  const purchaseInfo = await calculatePurchaseNeeds(
    needs,
    consumptionData,
    stock,
    expiration,
    consumed,
    mealYear,
    purchases,
    week,
    calendar,
    mealsByCategory,
    !hasCalendar,
    densityMap,
    isoDate
  );

  const normalizedPurchaseInfo = normalizeEntriesByName(purchaseInfo);
  const displayNeeds = mergeNeedsWithPurchases(normalizedNeeds, normalizedPurchaseInfo);
  const purchaseMap = mapByResolvedName(normalizedPurchaseInfo);
  const sortedNeeds = sortItemsByCategory(displayNeeds);

  const categoryMetaMap = new Map();
  const itemsByCategory = new Map();

  sortedNeeds.forEach(item => {
    const category = item.category || 'Other';
    const meta = categoryMetaMap.get(category) || {
      name: category,
      itemCount: 0,
      needCount: 0,
      searchTokens: new Set()
    };

    const storeTokens = getStoreNamesForItem(item.name) || [];
    const tokens = buildSearchTokens(item.name, category, storeTokens);
    const needInfo = lookupByNameOrId(purchaseMap, item.name);
    const needAmt = needInfo ? Math.round(needInfo.toBuy) : null;
    const needLevel = buildNeedLevel(needAmt);

    meta.itemCount += 1;
    if (needAmt > 0) meta.needCount += 1;
    tokens.forEach(token => meta.searchTokens.add(token));

    const baseItem = {
      name: item.name,
      category,
      homeUnit: item.home_unit,
      needAmount: needAmt,
      needLevel,
      needLabel: buildNeedLabel(needAmt, item.home_unit),
      stores: storeTokens,
      searchHaystack: tokens.join(' ')
    };

    const list = itemsByCategory.get(category) || [];
    list.push(baseItem);
    itemsByCategory.set(category, list);
    categoryMetaMap.set(category, meta);
  });

  const categories = Array.from(categoryMetaMap.values()).map(cat => ({
    name: cat.name,
    itemCount: cat.itemCount,
    needCount: cat.needCount,
    searchHaystack: Array.from(cat.searchTokens).join(' ')
  }));

  return {
    generatedAt: new Date(),
    categories,
    itemsByCategory
  };
}

async function getBaseSnapshot() {
  if (baseSnapshotState.data) return baseSnapshotState.data;
  if (baseSnapshotState.promise) return baseSnapshotState.promise;
  baseSnapshotState.promise = computeBaseSnapshot().then(data => {
    baseSnapshotState.data = data;
    baseSnapshotState.promise = null;
    return data;
  });
  return baseSnapshotState.promise;
}

function buildCacheKey(includeZero, searchText) {
  return `${includeZero ? 'all' : 'need'}|${normalizeSearchText(searchText)}`;
}

async function getMetadataView(includeZero, searchText) {
  const key = buildCacheKey(includeZero, searchText);
  if (metadataCache.has(key)) return metadataCache.get(key);
  const base = await getBaseSnapshot();
  const view = {
    generatedAt: base.generatedAt,
    categories: base.categories.map(cat => ({ ...cat }))
  };
  metadataCache.set(key, view);
  return view;
}

async function getItemsForCategory({ cacheKey, categoryName, includeZero, searchText }) {
  const normalizedSearch = normalizeSearchText(searchText);
  const base = await getBaseSnapshot();
  const perKeyCache = categoryItemsCache.get(cacheKey) || new Map();
  if (perKeyCache.has(categoryName)) return perKeyCache.get(categoryName);

  const sourceItems = base.itemsByCategory.get(categoryName) || [];
  const filtered = sourceItems
    .filter(item => {
      if (!passesNeedFilter(item.needAmount, includeZero)) return false;
      if (!normalizedSearch) return true;
      return item.searchHaystack.includes(normalizedSearch);
    })
    .map(item => ({ ...item }));

  perKeyCache.set(categoryName, filtered);
  categoryItemsCache.set(cacheKey, perKeyCache);
  return filtered;
}

export async function loadPriceCheckerSnapshot({
  includeZero = false,
  searchText = '',
  includeItems = true,
  categoryNames = null
} = {}) {
  const normalizedSearch = normalizeSearchText(searchText);
  const cacheKey = buildCacheKey(includeZero, normalizedSearch);
  const metadata = await getMetadataView(includeZero, normalizedSearch);
  let categories = metadata.categories.map(cat => ({ ...cat }));

  const allowedCategories = categoryNames ? new Set(categoryNames) : null;
  if (allowedCategories) {
    categories = categories.filter(cat => allowedCategories.has(cat.name));
  }

  if (!includeItems) {
    return { categories, generatedAt: metadata.generatedAt };
  }

  await Promise.all(
    categories.map(async category => {
      category.items = await getItemsForCategory({
        cacheKey,
        categoryName: category.name,
        includeZero,
        searchText: normalizedSearch
      });
    })
  );

  return { categories, generatedAt: metadata.generatedAt };
}

export async function loadPriceCheckerState({ searchText = '' } = {}) {
  await initUomTable();
  const {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory,
    density,
    cookingDays,
    ingredientMap,
    globalProduceMeasures
  } = await getData();

  const nameMap = await getItemNameMap();
  itemNameToIdMap = nameMap || {};
  itemIdToNameMap = {};
  Object.entries(itemNameToIdMap).forEach(([name, id]) => {
    if (id != null) {
      itemIdToNameMap[String(id)] = name;
    }
  });

  const normalizedNeeds = normalizeEntriesByName(needs);
  densityMap = density || densityMap || {};
  ingredientMapData = ingredientMap || ingredientMapData || {};
  globalProduceMeasuresData = globalProduceMeasures || globalProduceMeasuresData || {};
  cookingDaysData = cookingDays || cookingDaysData || {};
  await ensureWeightHydration(normalizedNeeds);

  const consMap = mapByResolvedName(consumption, (c, key) =>
    key === c.name ? c : { ...c, name: key }
  );
  const mealPlanMonthMap = mapByResolvedName(mealMonth, m => m.monthly_consumption);
  const hasCalendar = calendar && Object.keys(calendar).length > 0;
  if (!hasCalendar) {
    (mealMonth || []).forEach(m => {
      const rec = lookupByNameOrId(consMap, m.name);
      if (rec) rec.monthly_consumption += m.monthly_consumption;
      else {
        const key = resolvedNameKey(m.name);
        if (!key) return;
        consMap.set(key, {
          name: key,
          monthly_consumption: m.monthly_consumption
        });
      }
    });
  }
  const consumptionData = Array.from(consMap.values());

  const { week, isoDate } = getCurrentWeek();
  const purchaseInfo = await calculatePurchaseNeeds(
    needs,
    consumptionData,
    stock,
    expiration,
    consumed,
    mealYear,
    purchases,
    week,
    calendar,
    mealsByCategory,
    !hasCalendar,
    densityMap,
    isoDate
  );
  const normalizedPurchaseInfo = normalizeEntriesByName(purchaseInfo);
  const displayNeeds = mergeNeedsWithPurchases(normalizedNeeds, normalizedPurchaseInfo);
  const purchaseMap = mapByResolvedName(normalizedPurchaseInfo);
  const sortedNeeds = sortItemsByCategory(displayNeeds);
  const text = searchText.trim().toLowerCase();

  const filteredNeeds = sortedNeeds
    .map(category => ({
      ...category,
      items: category.items.filter(item => {
        const needInfo = lookupByNameOrId(purchaseMap, item.name);
        const needAmt = needInfo ? Math.round(needInfo.toBuy) : null;
        const matchesSearch = !text || item.name.toLowerCase().includes(text);
        return matchesSearch && passesNeedFilter(needAmt, false);
      })
    }))
    .filter(cat => cat.items.length > 0);

  return {
    needsData: displayNeeds,
    normalizedNeeds,
    consumptionData,
    stockData: stock,
    expirationData: expiration,
    consumedYearData: consumed,
    mealYearData: mealYear,
    purchasesData: purchases,
    calendarData: calendar,
    mealsByCategoryData: mealsByCategory,
    cookingDaysData,
    densityMap,
    ingredientMapData,
    globalProduceMeasuresData,
    mealPlanMonthMap,
    purchaseMap,
    normalizedPurchaseInfo,
    filteredNeeds,
    sortedNeeds,
    consumptionMap: consMap,
    itemNameToIdMap,
    itemIdToNameMap
  };
}
