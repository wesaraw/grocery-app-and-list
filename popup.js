import { initUomTable, convert } from './utils/uomConverter.js';
import { convertWithDensity } from './utils/unitNormalize.js';
import { calculatePurchaseNeeds } from './utils/purchaseCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { parseUnitPrice, getPriceUnitInfo, sheetSqFtFor } from "./utils/priceUtils.js";
import { getItemId } from './utils/itemStorage.js';
import { resolveNextPrepWindow } from './utils/calendarUtils.js';
import { formatQuantity, roundQuantity } from './utils/quantityFormat.js';
import { getStoreNamesForItem } from './utils/storeCatalog.js';
import { hydrateAverageEachWeights } from './utils/eachWeight.js';
import {
  fetchFinalSelection,
  loadPriceCheckerState
} from './utils/priceCheckerData.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';

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
    cookingDays,
    ingredientMap,
    globalProduceMeasures
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
    loadCookingDays(),
    getIngredientMap(),
    loadGlobalProduceMeasures()
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
    cookingDays,
    ingredientMap,
    globalProduceMeasures
  };
}

const finalMap = new Map();
let needsData = [];
let consumptionData = [];
let consumptionMap = new Map();
let expirationData = [];
let stockData = [];
let consumedYearData = [];
let mealYearData = [];
let purchasesData = {};
let calendarData = {};
let mealsByCategoryData = {};
let hideZeroItems = false;
let ingredientMapData = {};
let globalProduceMeasuresData = {};

function passesNeedFilter(needAmt) {
  return !hideZeroItems || (needAmt != null && needAmt > 0);
}

function applyRowVisibility(node) {
  if (!node) return;
  const collapsed = node.dataset.collapsed === 'true';
  const filtered = node.dataset.filtered === 'true';
  node.style.display = collapsed || filtered ? 'none' : 'list-item';
}

function setFilterHidden(node, hidden) {
  if (!node) return;
  node.dataset.filtered = hidden ? 'true' : 'false';
  applyRowVisibility(node);
}
let filterText = '';
const headerState = {};
let weightPackMap = new Map();
let densityMap = {};
let mealMonthMap = new Map();
let mealPlanMonthMap = new Map();
let cookingDaysData = {};
let itemNameToIdMap = {};
let itemIdToNameMap = {};

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

function lookupByNameOrId(map, name) {
  if (!map || typeof map.get !== 'function') return undefined;
  for (const key of aliasKeys(name)) {
    if (map.has(key)) {
      return map.get(key);
    }
  }
  return undefined;
}

function findNeedItem(itemName) {
  const aliases = aliasKeys(itemName);
  return needsData.find(n => aliases.includes(n?.name));
}

function densityInfoFor(itemName) {
  const resolved = resolveItemName(itemName);
  return densityMap[resolved] || densityMap[itemName] || {};
}

function resolvedNameKey(name) {
  const resolved = resolveItemName(name);
  if (resolved && resolved.trim()) return resolved;
  if (name == null) return '';
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

function buildStockLookup(list = []) {
  const map = new Map();
  list.forEach(entry => {
    if (!entry) return;
    const key = resolvedNameKey(entry.name);
    if (!key) return;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  });
  return map;
}

function normalizeStockAmount(entry, targetUnit, itemName) {
  if (!entry || !targetUnit) return 0;
  const amount = Number(entry.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const sourceUnit = entry.unit || targetUnit;
  if (!sourceUnit || sourceUnit.toLowerCase() === targetUnit.toLowerCase()) {
    return amount;
  }
  const info = densityInfoFor(itemName);
  try {
    const converted = convertWithDensity(amount, sourceUnit, targetUnit, {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!Number.isNaN(converted) && Number.isFinite(converted)) {
      return converted;
    }
  } catch (_err) {}
  try {
    const converted = convert(amount).from(sourceUnit).to(targetUnit);
    if (!Number.isNaN(converted) && Number.isFinite(converted)) {
      return converted;
    }
  } catch (_err) {}
  return amount;
}

function weeklyNeedForItem(itemName) {
  const cons = lookupByNameOrId(consumptionMap, itemName);
  const baseMonthly = cons?.monthly_consumption || 0;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const plannedMonthly = hasCalendar
    ? lookupByNameOrId(mealPlanMonthMap, itemName) || 0
    : 0;
  const weekly = (baseMonthly + plannedMonthly) / WEEKS_PER_MONTH;
  return Number.isFinite(weekly) ? weekly : null;
}

function expirationRunwayWeeks(itemName, expMap) {
  const rec = lookupByNameOrId(expMap, itemName);
  if (!rec) return null;
  if (rec.runway_weeks != null) return Number(rec.runway_weeks);
  if (rec.expiration_runway_weeks != null)
    return Number(rec.expiration_runway_weeks);
  if (rec.runwayWeeks != null) return Number(rec.runwayWeeks);
  if (rec.shelf_life_weeks != null) return Number(rec.shelf_life_weeks);
  if (rec.shelf_life_months != null)
    return rec.shelf_life_months * WEEKS_PER_MONTH;
  return null;
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

let resolveInit;
const initReady = new Promise(resolve => {
  resolveInit = resolve;
});

function storageKey(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
}

function extractScrapedProducts(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object' && Array.isArray(entry.products)) {
    return entry.products;
  }
  return [];
}

function loadScraped(item, store) {
  return new Promise(resolve => {
    const key = storageKey('scraped', item, store);
    chrome.storage.local.get([key], data => resolve(extractScrapedProducts(data[key])));
  });
}

function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const sanitize = str =>
    str
      ?.replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    let m;
    if ((m = s.match(/(\d+)\s*\/\s*(\d+)\s*(?:doz|dozen)/i))) {
      const numerator = parseInt(m[1], 10);
      const denominator = parseInt(m[2], 10);
      if (denominator) {
        return { count: Math.round((numerator / denominator) * 12), match: m[0] };
      }
    }
    if (!s.includes('/') && (m = s.match(/(\d+(?:\.\d+)?)\s*(?:doz|dozen)/i))) {
      return { count: Math.round(parseFloat(m[1]) * 12), match: m[0] };
    }
    if ((m = s.match(/(?:half|1\/2)\s*-?\s*doz(?:en)?/i))) {
      return { count: 6, match: m[0] };
    }
    if ((m = s.match(/\bdoz(?:en)?\b/i))) {
      return { count: 12, match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/pack\s*of\s*(\d+)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*-\s*\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    return null;
  };

  let m = matchPack(product?.name);
  if (!m) m = matchPack(product?.size);
  if (!m) m = matchPack(product?.unit);
  if (m) {
    const { count, match } = m;
    const source = `${product?.name || ''} ${product?.size || ''} ${product?.unit || ''}`;
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(match);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

function weightKey(product, itemName) {
  if (product.convertedQty != null) {
    const clamped = roundQuantity(product.convertedQty);
    if (Number.isFinite(clamped)) {
      return clamped.toFixed(2);
    }
  }
  if (product.sizeQty != null && product.sizeUnit) {
    const info = densityInfoFor(itemName);
    const oz = convertWithDensity(
      product.sizeQty,
      product.sizeUnit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (Number.isFinite(oz)) {
      const rounded = roundQuantity(oz);
      if (Number.isFinite(rounded)) {
        return rounded.toFixed(2);
      }
    }
  }
  return null;
}

function getPackInfo(product, map = weightPackMap, itemName = null) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product, itemName);
  if (key && map && map.has(key)) {
    return map.get(key);
  }
  return base;
}

  function getPackCount(product, map = weightPackMap, itemName = null) {
    return getPackInfo(product, map, itemName).count;
  }

function weightBasedEachCount(item, product, info, mult) {
  const gramsPerEach = item?.averageEachWeight?.gramsPerEach;
  if (!(gramsPerEach > 0)) return null;

    let grams = null;
    if (product.convertedQty != null) {
      grams = convertWithDensity(
        product.convertedQty * mult,
        'oz',
        'g',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    } else if (product.sizeQty != null && product.sizeUnit) {
      grams = convertWithDensity(
        product.sizeQty * mult,
        product.sizeUnit,
        'g',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }

    if (!(grams > 0)) return null;
  const count = grams / gramsPerEach;
  return Number.isFinite(count) && count > 0 ? count : null;
}

function packageWeightInGrams(product, info, mult) {
  if (!product) return null;
  if (product.convertedQty != null) {
    return convertWithDensity(product.convertedQty * mult, 'oz', 'g', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
  }
  if (product.sizeQty != null && product.sizeUnit) {
    return convertWithDensity(product.sizeQty * mult, product.sizeUnit, 'g', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
  }
  return null;
}

function requiredPackageMultiplier(item, product, info, needEachQty, mult) {
  if (!(needEachQty > 0)) return null;
  const gramsPerEach = item?.averageEachWeight?.gramsPerEach;
  if (!(gramsPerEach > 0)) return null;
  const packageGrams = packageWeightInGrams(product, info, mult);
  if (!(packageGrams > 0)) return null;
  const neededGrams = needEachQty * gramsPerEach;
  const multiplier = neededGrams / packageGrams;
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null;
}

  function packsForNeed(itemName, needAmt, product, map = weightPackMap) {
    if (!product || needAmt == null || isNaN(needAmt)) return null;
    const item = findNeedItem(itemName);
  if (!item) return null;
  const info = densityInfoFor(itemName);
  const { count: pack, weightPerPack } = getPackInfo(product, map, itemName);
  if (!pack || pack <= 0) return null;

  let qtyPerPack = pack;
  if (item.home_unit.toLowerCase() !== 'each') {
    const mult = weightPerPack ? 1 : pack;
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * mult;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * mult,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) {
      qtyPerPack = convertWithDensity(
        ozQty,
        'oz',
        item.home_unit,
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
  } else {
    const mult = weightPerPack ? 1 : pack;
    const multiplier = requiredPackageMultiplier(item, product, info, needAmt, mult);
    if (multiplier != null) {
      return Math.ceil(multiplier);
    }
  }
  if (qtyPerPack == null || qtyPerPack <= 0) return null;
  return Math.ceil(needAmt / qtyPerPack);
}

function needText(itemName, needAmt, product = null, map = weightPackMap) {
  const item = findNeedItem(itemName);
  if (!item || needAmt == null || isNaN(needAmt)) return '';
  const packs = product ? packsForNeed(itemName, needAmt, product, map) : null;
  const packStr =
    packs != null ? ` \u2026 ${packs} pack${packs > 1 ? 's' : ''}` : '';
  return ` (Need: ${formatQuantity(needAmt)} ${item.home_unit}${packStr})`;
}

async function buildWeightPackMap(item, stores) {
  const resolvedItem = resolveItemName(item);
  const map = new Map();
  for (const s of stores) {
    const arr = await loadScraped(resolvedItem, s);
    for (const p of arr) {
      let info;
      if (p && p.packCount && p.packCount > 1) {
        info = { count: p.packCount, weightPerPack: false };
      } else {
        info = baseGetPackInfo(p);
      }
      if (info.count > 1) {
        const key = weightKey(p, resolvedItem);
        if (key && (!map.has(key) || map.get(key).count < info.count)) {
          map.set(key, info);
        }
      }
    }
  }
  weightPackMap = map;
  return map;
}


function extractSheetCount(itemName, product) {
  const sqft = sheetSqFtFor(resolveItemName(itemName));
  const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
  if (ppu != null && ut && /^(?:sf|sqft)$/.test(ut) && product.priceNumber != null) {
    const totalSqFt = product.priceNumber / ppu;
    return Math.round(totalSqFt / sqft);
  }
  const fields = [product?.name, product?.size, product?.unit];
  for (const f of fields) {
    if (!f) continue;
    const m = f.match(/(\d[\d,]*)\s*sheets?/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    const sq = f.match(/(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|sf)/i);
    if (sq) return Math.round(parseInt(sq[1].replace(/,/g, ''), 10) / sqft);
  }
  return null;
}

function pricePerHomeUnit(itemName, product, map = weightPackMap) {
  const item = findNeedItem(itemName);
  if (!item || !product) return null;
  const info = densityInfoFor(itemName);
  const { count: pack, weightPerPack } = getPackInfo(product, map, itemName);
  const mult = weightPerPack ? 1 : pack;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
    if (unit === 'sheets') {
      const sheetSqFt = sheetSqFtFor(resolveItemName(itemName));
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) {
        return ppu * sheetSqFt;
      }
      if (/ct|count|sheet/.test(ut)) {
        return ppu;
      }
    }
    const totalSheets = extractSheetCount(itemName, product);
      if (totalSheets && product.priceNumber != null) {
        return product.priceNumber / (totalSheets * mult);
      }
    }
    if (unit === 'each') {
      const eachCount = weightBasedEachCount(item, product, info, mult) || pack;
      return product.priceNumber != null ? product.priceNumber / eachCount : null;
    }
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null && product.priceNumber != null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * mult;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * mult,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convertWithDensity(
      1,
      item.home_unit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(ozPerUnit) && ozPerUnit > 0) {
      return pricePerOz * ozPerUnit;
    }
  }
  return null;
}

function monthlyCost(itemName, product, map = weightPackMap) {
  const cons = lookupByNameOrId(consumptionMap, itemName);
  if (!cons) return null;
  const unitPrice = pricePerHomeUnit(itemName, product, map);
  if (unitPrice == null) return null;
  const base = cons.monthly_consumption || 0;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const planned = hasCalendar ? lookupByNameOrId(mealPlanMonthMap, itemName) || 0 : 0;
  return unitPrice * (base + planned);
}

function storeNamesForItem(itemName) {
  return getStoreNamesForItem(itemName) || [];
}

function homeUnitLabel(itemName) {
  const item = findNeedItem(itemName);
  if (!item || !item.home_unit) return null;
  const u = item.home_unit.toLowerCase();
  return u === 'each' ? 'ea' : u;
}

function formatFinalText(itemName, store, product, map = weightPackMap) {
  let text = store ? ` - ${store}` : '';
  if (product) {
    let pStr =
      product.priceNumber != null
        ? `$${product.priceNumber.toFixed(2)}`
        : product.price;
    const { unitType: normalizedUnitType } = getPriceUnitInfo(product);
    const displayUnit = normalizedUnitType || product.unitType || 'oz';
    let qStr =
      product.convertedQty != null
        ? `${formatQuantity(product.convertedQty)} ${displayUnit}`
        : product.size;
    const unitPrice = pricePerHomeUnit(itemName, product, map);
    const label = homeUnitLabel(itemName) || displayUnit || 'oz';
    let uStr =
      unitPrice != null
        ? `$${unitPrice.toFixed(2)}/${label}`
        : product.unit;
    const cost = monthlyCost(itemName, product, map);
    const costStr = cost != null ? ` - $${cost.toFixed(2)}/mo` : '';
    text += ` - ${product.name} - ${pStr} - ${qStr} - ${uStr}${costStr}`;
  }
  return text;
}

function updateFinalInfo(itemName, span, img, store, product, map = weightPackMap) {
  if (product) {
    const info = getPackInfo(product, map, itemName);
    if (info.count > 1) {
      const wKey = weightKey(product, itemName);
      if (wKey && map && (!map.has(wKey) || map.get(wKey).count < info.count)) {
        map.set(wKey, info);
      }
    }
  }
  span.textContent = formatFinalText(itemName, store, product, map);
  if (product) {
    img.src = product.image || '';
    img.alt = product.name || '';
    img.style.display = 'inline';
  } else {
    img.style.display = 'none';
    img.src = '';
    img.alt = '';
  }
}

async function init() {
  await initUomTable();
  chrome.storage.local.remove('storeSelections');
  await rerenderAll();
  resolveInit();
}

init();

// Listen for scraped data sent from content script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'scrapedData') {
    console.log('Received data for', message.item);
    console.log(message.products);
  } else if (message.type === 'finalSelection') {
    await initReady;
    const rec = finalMap.get(message.item);
    if (rec) {
      const { span, img, btn } = rec;
      const prod = message.product;
      const stores = storeNamesForItem(message.item);
      const weightMap = await buildWeightPackMap(message.item, stores);
      if (prod) {
        const info = getPackInfo(prod, weightMap, message.item);
        if (info.count > 1) {
          const wKey = weightKey(prod, message.item);
          if (wKey && (!weightMap.has(wKey) || weightMap.get(wKey).count < info.count)) {
            weightMap.set(wKey, info);
          }
        }
      }
      rec.product = prod;
      rec.weightMap = weightMap;
      const amountText =
        rec.needAmt != null && !isNaN(rec.needAmt)
          ? needText(message.item, rec.needAmt, rec.product, rec.weightMap)
          : '';
      rec.btn.textContent = message.item + amountText;
      updateFinalInfo(message.item, span, img, message.store, prod, weightMap);
    }
  }
});

async function refreshNeeds() {
  await rerenderAll();
}

async function rerenderAll() {
  const scrollTop = window.scrollY;
  const state = await loadPriceCheckerState({ searchText: filterText });
  ({
    needsData,
    consumptionData,
    stockData,
    expirationData,
    consumedYearData,
    mealYearData,
    purchasesData,
    calendarData,
    mealsByCategoryData,
    cookingDaysData,
    densityMap,
    ingredientMapData,
    globalProduceMeasuresData,
    consumptionMap,
    mealPlanMonthMap,
    itemNameToIdMap,
    itemIdToNameMap
  } = state);

  const purchaseMap = state.purchaseMap;
  const itemsContainer = document.getElementById('items');
  itemsContainer.innerHTML = '';
  finalMap.clear();
  renderItemsWithCategoryHeaders(state.sortedNeeds, itemsContainer, item => {
    const li = document.createElement('li');
    const needInfo = lookupByNameOrId(purchaseMap, item.name);
    const needAmt = needInfo ? Math.round(needInfo.toBuy) : null;
    const amountText =
      needInfo && !isNaN(needAmt) ? needText(item.name, needAmt) : '';
    const btn = document.createElement('button');
    btn.textContent = item.name + amountText;
    btn.addEventListener('click', () => {
      openOrFocusWindow(`item.html?item=${encodeURIComponent(item.name)}`);
    });
    li.appendChild(btn);
    const finalSpan = document.createElement('span');
    const finalImg = document.createElement('img');
    finalImg.className = 'final-product-img';
    finalImg.width = 50;
    finalImg.height = 50;
    finalImg.style.display = 'none';
    const match = !filterText || item.name.toLowerCase().includes(filterText.toLowerCase());
    const shouldShow = match && passesNeedFilter(needAmt);
    const hiddenByFilter = !shouldShow;
    setFilterHidden(li, hiddenByFilter);
    const rec = { li, btn, span: finalSpan, img: finalImg, needAmt, product: null, weightMap: null };
    finalMap.set(item.name, rec);
    fetchFinalSelection(item.name).then(async ({ store, product }) => {
      const stores = storeNamesForItem(item.name);
      const weightMap = await buildWeightPackMap(item.name, stores);
      if (product) {
        const pInfo = getPackInfo(product, weightMap, item.name);
        if (pInfo.count > 1) {
          const wKey = weightKey(product, item.name);
          if (
            wKey &&
            (!weightMap.has(wKey) || weightMap.get(wKey).count < pInfo.count)
          ) {
            weightMap.set(wKey, pInfo);
          }
        }
      }
      rec.product = product;
      rec.weightMap = weightMap;
      const amountText =
        rec.needAmt != null && !isNaN(rec.needAmt)
          ? needText(item.name, rec.needAmt, rec.product, rec.weightMap)
          : '';
      btn.textContent = item.name + amountText;
      updateFinalInfo(item.name, finalSpan, finalImg, store, product, weightMap);
    });
    li.appendChild(finalSpan);
    li.appendChild(finalImg);
    return li;
  }, headerState, { applyVisibility: applyRowVisibility });
  window.scrollTo(0, scrollTop);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.currentStock) {
    const newStock = changes.currentStock.newValue || [];
    refreshNeeds(newStock, consumedYearData);
  }
  if (area === 'local' && changes[CONSUMED_PATH]) {
    const newConsumed = changes[CONSUMED_PATH].newValue || [];
    consumedYearData = newConsumed;
    refreshNeeds(stockData, newConsumed);
  }
  if (area === 'local' && changes.purchases) {
    purchasesData = changes.purchases.newValue || {};
    refreshNeeds(stockData, consumedYearData);
  }
  Object.keys(changes).forEach(key => {
    if (key.startsWith('final_') || key.startsWith('final_product_')) {
      const item = decodeURIComponent(key.replace(/^final(_product)?_/, ''));
      const rec = finalMap.get(item);
      if (rec) {
        initReady.then(() =>
          fetchFinalSelection(item).then(async ({ store, product }) => {
            const { span, img, btn } = rec;
            const stores = storeNamesForItem(item);
            const weightMap = await buildWeightPackMap(item, stores);
            rec.product = product;
            rec.weightMap = weightMap;
            const amountText =
              rec.needAmt != null && !isNaN(rec.needAmt)
                ? needText(item, rec.needAmt, rec.product, rec.weightMap)
                : '';
            btn.textContent = item + amountText;
            updateFinalInfo(item, span, img, store, product, weightMap);
          })
        );
      }
    }
  });
  if (
    area === 'local' &&
    (changes.yearlyNeeds ||
      changes.monthlyConsumption ||
      changes.expirationData ||
      changes.mealPlanMonthly ||
      changes.mealPlanYearly ||
      changes.mealPlanMonthlyBreakdown ||
      changes.preparedMealsCalendar ||
      changes.whatToEatCalendar ||
      changes.mealCategories ||
      Object.keys(changes).some(k => k.endsWith('Meals')))
  ) {
    rerenderAll();
  }
});

async function loadCommitData(itemName) {
  return fetchFinalSelection(itemName);
}




async function commitSelections() {
  const commitItems = [];
  const { week: currentWeek, isoDate } = getCurrentWeek();

  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const purchaseInfo = await calculatePurchaseNeeds(
    needsData,
    consumptionData,
    stockData,
    expirationData,
    consumedYearData,
    mealYearData,
    purchasesData,
    currentWeek,
    calendarData,
    mealsByCategoryData,
    !hasCalendar,
    densityMap,
    isoDate
  );
  const normalizedPurchaseInfo = normalizeEntriesByName(purchaseInfo);
  const purchaseMap = mapByResolvedName(normalizedPurchaseInfo);
  const stockLookup = buildStockLookup(stockData);
  const expirationLookup = mapByResolvedName(expirationData);

  const { prepDays, endDate: prepWindowEndDate } = resolveNextPrepWindow(
    cookingDaysData,
    isoDate
  );
  let prepPurchaseMap = null;
  if (prepWindowEndDate) {
    const prepPurchaseInfo = await calculatePurchaseNeeds(
      needsData,
      consumptionData,
      stockData,
      expirationData,
      consumedYearData,
      mealYearData,
      purchasesData,
      currentWeek,
      calendarData,
      mealsByCategoryData,
      !hasCalendar,
      densityMap,
      isoDate,
      prepWindowEndDate
    );
    const normalizedPrepPurchaseInfo = normalizeEntriesByName(prepPurchaseInfo);
    prepPurchaseMap = mapByResolvedName(normalizedPrepPurchaseInfo);
  }
  const hasPrepWindow = prepWindowEndDate != null;

  for (const item of needsData) {
    const needRecord = lookupByNameOrId(purchaseMap, item.name);
    if (!needRecord || needRecord.toBuy <= 0) continue;
    const { store, product } = await loadCommitData(item.name);
    if (!product) continue;
    const info = densityInfoFor(item.name);
    const { count: pack, weightPerPack } = getPackInfo(
      product,
      new Map(),
      item.name
    );

    let perPackHomeQty = pack;
    if (item.home_unit.toLowerCase() !== 'each') {
      const mult = weightPerPack ? 1 : pack;
      let ozQty = null;
      if (product.convertedQty != null) {
        ozQty = product.convertedQty * mult;
      } else if (product.sizeQty != null && product.sizeUnit) {
        ozQty = convertWithDensity(
          product.sizeQty * mult,
          product.sizeUnit,
          'oz',
          { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
        );
      }
      if (ozQty != null) {
        perPackHomeQty = convertWithDensity(
          ozQty,
          'oz',
          item.home_unit,
          { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
        );
      }
    }

    if (!perPackHomeQty || perPackHomeQty <= 0) perPackHomeQty = pack || 1;
    const stockEntries = lookupByNameOrId(stockLookup, item.name) || [];
    const onHandHomeQty = stockEntries.reduce(
      (sum, entry) => sum + normalizeStockAmount(entry, item.home_unit, item.name),
      0
    );

    const weeklyNeed = weeklyNeedForItem(item.name);
    const runwayWeeks = expirationRunwayWeeks(item.name, expirationLookup);
    if (
      runwayWeeks != null &&
      runwayWeeks > 0 &&
      weeklyNeed != null &&
      weeklyNeed > 0 &&
      onHandHomeQty >= weeklyNeed * runwayWeeks
    ) {
      continue;
    }

    const netNeed = Math.max(0, needRecord.toBuy - onHandHomeQty);
    if (netNeed <= 0) continue;

    const packsToBuy = Math.ceil(netNeed / perPackHomeQty);
    if (packsToBuy <= 0) continue;
    const amount = perPackHomeQty * packsToBuy;

    let prepWindowAmount = hasPrepWindow ? 0 : null;
    let prepWindowPacks = hasPrepWindow ? 0 : null;
    if (hasPrepWindow) {
      const prepNeed =
        prepPurchaseMap ? lookupByNameOrId(prepPurchaseMap, item.name)?.toBuy || 0 : 0;
      const prepNeedAfterStock = Math.max(0, prepNeed - onHandHomeQty);
      const cappedPrepNeed = Math.min(netNeed, prepNeedAfterStock);
      if (cappedPrepNeed > 0) {
        prepWindowPacks = Math.ceil(cappedPrepNeed / perPackHomeQty);
        prepWindowAmount = perPackHomeQty * prepWindowPacks;
      }
    }

    const itemId = await getItemId(item.name);
    commitItems.push({
      item: item.name,
      itemId,
      store,
      product,
      amount,
      unit: item.home_unit,
      packs: packsToBuy,
      prepWindowAmount,
      prepWindowPacks
    });
  }
  chrome.storage.local.set({
    lastCommitItems: commitItems,
    pendingCommitWeek: currentWeek,
    lastCommitContext: {
      startDate: isoDate,
      prepWindowEndDate,
      prepDays,
      generatedAt: new Date().toISOString()
    }
  });

  openOrFocusWindow('shoppingList.html');
}

document.getElementById('commit').addEventListener('click', commitSelections);

function openInventory() {
  openOrFocusWindow('inventory.html');
}

document
  .getElementById('editInventory')
  .addEventListener('click', openInventory);

function openConsumption() {
  openOrFocusWindow('consumed.html');
}

document
  .getElementById('editConsumption')
  .addEventListener('click', openConsumption);

function openPlanEditor() {
  openOrFocusWindow('editPlan.html');
}

document
  .getElementById('editPlan')
  .addEventListener('click', openPlanEditor);

function openAddItem() {
  openOrFocusWindow('addItem.html');
}

document.getElementById("addItem").addEventListener("click", openAddItem);

function openRemoveItem() {
  openOrFocusWindow('removeItem.html');
}

document
  .getElementById('removeItem')
  .addEventListener('click', openRemoveItem);

function openCategoryEditor() {
  openOrFocusWindow('editCategory.html');
}

document
  .getElementById('editCategory')
  .addEventListener('click', openCategoryEditor);

function openExpirationEditor() {
  openOrFocusWindow('expiration.html');
}

function openSeasonsEditor() {
  openOrFocusWindow('editSeason.html');
}

document
  .getElementById('editExpirations')
  .addEventListener('click', openExpirationEditor);
document
  .getElementById('editSeasons')
  .addEventListener('click', openSeasonsEditor);

function openCouponManager() {
  openOrFocusWindow('coupon.html');
}

document
  .getElementById('couponBtn')
  .addEventListener('click', openCouponManager);

function openBackupManager() {
  openOrFocusWindow('backup.html', 400, 400);
}

document
  .getElementById('backupBtn')
  .addEventListener('click', openBackupManager);

function openUomChange() {
  openOrFocusWindow('uomChange.html');
}

function openDensityRatios() {
  openOrFocusWindow('densityRatios.html');
}

document
  .getElementById('uomChange')
  .addEventListener('click', openUomChange);

document
  .getElementById('densityRatios')
  .addEventListener('click', openDensityRatios);

function openMealMultiplier() {
  openOrFocusWindow('mealMultiplier.html');
}

document
  .getElementById('mealMultiplier')
  .addEventListener('click', openMealMultiplier);

function openCookingDays() {
  openOrFocusWindow('cookingDays.html');
}

document
  .getElementById('cookingDays')
  .addEventListener('click', openCookingDays);

function openMealChooser() {
  openOrFocusWindow('mealChooser.html');
}

document
  .getElementById('mealChooser')
  .addEventListener('click', openMealChooser);

function openStoreTotals() {
  openOrFocusWindow('storeTotals.html');
}

document
  .getElementById('storeTotals')
  .addEventListener('click', openStoreTotals);

function openEatCalendar() {
  openOrFocusWindow('whatToEatCalendarNew.html');
}

document
  .getElementById('viewCalendar')
  .addEventListener('click', openEatCalendar);

function toggleZeroItems() {
  hideZeroItems = !hideZeroItems;
  const btn = document.getElementById('toggleZero');
  btn.textContent = hideZeroItems ? 'Show Zero Qty' : 'Hide Zero Qty';
  refreshNeeds();
}

document
  .getElementById('toggleZero')
  .addEventListener('click', toggleZeroItems);
document.getElementById('toggleZero').textContent = 'Hide Zero Qty';

document.getElementById('searchBox').addEventListener('input', () => {
  filterText = document.getElementById('searchBox').value;
  refreshNeeds();
});
