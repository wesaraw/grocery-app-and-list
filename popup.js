import { loadJSON } from './utils/dataLoader.js';
import { calculatePurchaseNeeds } from './utils/purchaseCalculator.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { parseUnitPrice, getPriceUnitInfo, sheetSqFtFor } from "./utils/priceUtils.js";
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArray as loadItemArray,
  saveArray,
  convertArrayToNames,
  convertObjectKeysToNames,
  getItemId,
  getItemName
} from './utils/itemRegistry.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const CONSUMED_PATH = 'consumedThisYear';


async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return fromJson;
}

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadMonthlyConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);
const loadStoreSelections = () =>
  loadArray(STORE_SELECTION_KEY, STORE_SELECTION_PATH);

async function loadStock() {
  const arr = await loadItemArray('currentStock');
  if (arr.length > 0) return arr;
  const stock = await loadJSON(STOCK_PATH);
  return stock;
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}


async function loadConsumed() {
  const arr = await loadItemArray(CONSUMED_PATH);
  if (arr.length > 0) return arr;
  const needs = await loadNeeds();
  return needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit }));
}

function loadStoredArray(key) {
  return loadItemArray(key);
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
  const [needs, selections, consumption, stock, expiration, consumed, purchases, mealYear, mealMonth, calendar, meals, dMap] =
    await Promise.all([
      loadNeeds(),
      loadStoreSelections(),
      loadMonthlyConsumption(),
      loadStock(),
      loadExpiration(),
      loadConsumed(),
      loadPurchases(),
      loadStoredArray('mealPlanYearly'),
      loadMealPlanMonth(),
      loadCalendar(),
      loadMealsByCategory(),
      loadDensityMap()
    ]);
  return {
    needs,
    selections,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory: meals,
    density: dMap
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
let filterText = '';
const headerState = {};
let weightPackMap = new Map();
let densityMap = {};
let mealMonthMap = new Map();
let mealPlanMonthMap = new Map();
let selectionsData = [];

let resolveInit;
const initReady = new Promise(resolve => {
  resolveInit = resolve;
});

async function getFinal(itemName) {
  const id = await getItemId(itemName);
  const keyId = `final_${id}`;
  const legacyKey = `final_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([keyId, legacyKey], data => {
      if (data[legacyKey] && !data[keyId]) {
        chrome.storage.local.set({ [keyId]: data[legacyKey] }, () => {
          chrome.storage.local.remove(legacyKey, () => resolve(data[legacyKey]));
        });
      } else {
        if (data[legacyKey]) chrome.storage.local.remove(legacyKey);
        resolve(data[keyId]);
      }
    });
  });
}

async function getFinalProduct(itemName) {
  const id = await getItemId(itemName);
  const keyId = `final_product_${id}`;
  const legacyKey = `final_product_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([keyId, legacyKey], data => {
      if (data[legacyKey] && !data[keyId]) {
        chrome.storage.local.set({ [keyId]: data[legacyKey] }, () => {
          chrome.storage.local.remove(legacyKey, () => resolve(data[legacyKey]));
        });
      } else {
        if (data[legacyKey]) chrome.storage.local.remove(legacyKey);
        resolve(data[keyId]);
      }
    });
  });
}

async function storageKey(type, item, store) {
  const id = await getItemId(item);
  return `${type}_${id}_${encodeURIComponent(store)}`;
}

function loadScraped(item, store) {
  return new Promise(async resolve => {
    const key = await storageKey('scraped', item, store);
    chrome.storage.local.get([key], data => resolve(data[key] || []));
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
    if ((m = s.match(/(\d+)\s*(?:doz|dozen)/i))) {
      return { count: parseInt(m[1], 10) * 12, match: m[0] };
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
  if (product.convertedQty != null) return product.convertedQty.toFixed(2);
  if (product.sizeQty != null && product.sizeUnit) {
    const info = densityMap[itemName] || {};
    const oz = convertWithDensity(
      product.sizeQty,
      product.sizeUnit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(oz)) return oz.toFixed(2);
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

function packsForNeed(itemName, needAmt, product, map = weightPackMap) {
  if (!product || needAmt == null || isNaN(needAmt)) return null;
  const item = needsData.find(n => n.name === itemName);
  if (!item) return null;
  const info = densityMap[itemName] || {};
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
  }
  if (qtyPerPack == null || qtyPerPack <= 0) return null;
  return Math.ceil(needAmt / qtyPerPack);
}

function needText(itemName, needAmt, product = null, map = weightPackMap) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || needAmt == null || isNaN(needAmt)) return '';
  const packs = product ? packsForNeed(itemName, needAmt, product, map) : null;
  const packStr =
    packs != null ? ` \u2026 ${packs} pack${packs > 1 ? 's' : ''}` : '';
  return ` (Need: ${needAmt} ${item.home_unit}${packStr})`;
}

async function buildWeightPackMap(item, stores) {
  const map = new Map();
  for (const s of stores) {
    const arr = await loadScraped(item, s);
    for (const p of arr) {
      let info;
      if (p && p.packCount && p.packCount > 1) {
        info = { count: p.packCount, weightPerPack: false };
      } else {
        info = baseGetPackInfo(p);
      }
      if (info.count > 1) {
        const key = weightKey(p, item);
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
  const sqft = sheetSqFtFor(itemName);
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
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const info = densityMap[itemName] || {};
  const { count: pack, weightPerPack } = getPackInfo(product, map, itemName);
  const mult = weightPerPack ? 1 : pack;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(itemName);
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
    return product.priceNumber != null ? product.priceNumber / pack : null;
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
  const cons = consumptionMap.get(itemName);
  if (!cons) return null;
  const unitPrice = pricePerHomeUnit(itemName, product, map);
  if (unitPrice == null) return null;
  const base = cons.monthly_consumption || 0;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const planned = hasCalendar ? mealPlanMonthMap.get(itemName) || 0 : 0;
  return unitPrice * (base + planned);
}

function homeUnitLabel(itemName) {
  const item = needsData.find(n => n.name === itemName);
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
    let qStr =
      product.convertedQty != null
        ? `${product.convertedQty.toFixed(2)} ${product.unitType || 'oz'}`
        : product.size;
    const unitPrice = pricePerHomeUnit(itemName, product, map);
    const label = homeUnitLabel(itemName) || product.unitType || 'oz';
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
  const {
    needs,
    selections,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory,
    density
  } = await getData();
  needsData = needs;
  densityMap = density;
  selectionsData = selections;
  const sortedNeeds = sortItemsByCategory(needs);
  const consMap = new Map(consumption.map(c => [c.name, c]));
  const hasCalendar = calendar && Object.keys(calendar).length > 0;
  mealMonthMap = new Map(
    (mealMonth || []).map(m => [m.name, m.monthly_consumption])
  );
  mealPlanMonthMap = new Map(
    (mealMonth || []).map(m => [m.name, m.monthly_consumption])
  );
  if (!hasCalendar) {
    (mealMonth || []).forEach(m => {
      const rec = consMap.get(m.name);
      if (rec) rec.monthly_consumption += m.monthly_consumption;
      else
        consMap.set(m.name, {
          name: m.name,
          monthly_consumption: m.monthly_consumption
        });
    });
  }
  consumptionData = Array.from(consMap.values());
  consumptionMap = consMap;
  expirationData = expiration;
  stockData = stock;
  consumedYearData = consumed;
  mealYearData = mealYear;
  purchasesData = purchases;
  calendarData = calendar;
  mealsByCategoryData = mealsByCategory;
  const week = getCurrentWeek();
  const purchaseInfo = await calculatePurchaseNeeds(
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    mealYear,
    purchases,
    week,
    calendar,
    mealsByCategory,
    !hasCalendar,
    densityMap
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const itemsContainer = document.getElementById('items');

  renderItemsWithCategoryHeaders(sortedNeeds, itemsContainer, item => {
    const li = document.createElement('li');
    const needInfo = purchaseMap.get(item.name);
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
    const currentQty = stockMap.get(item.name)?.amount || 0;
    const weeklyNeed = item.total_needed_year ? item.total_needed_year / 52 : 0;
    const showByStock = currentQty < weeklyNeed;
    const showByNeed =
      !hideZeroItems || (needAmt != null && needAmt > 0);
    li.style.display = showByStock && showByNeed ? 'list-item' : 'none';
    const rec = { li, btn, span: finalSpan, img: finalImg, needAmt, product: null, weightMap: null };
    finalMap.set(item.name, rec);
    getFinal(item.name).then(async store => {
      const product = await getFinalProduct(item.name);
      const stores = selections
        .filter(s => s.name === item.name)
        .map(s => s.store);
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
    // rec already stored in finalMap
    return li;
  }, headerState);

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
      const stores = selectionsData
        .filter(s => s.name === message.item)
        .map(s => s.store);
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

async function refreshNeeds(stock = stockData, consumed = consumedYearData) {
  stockData = stock;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const purchaseInfo = await calculatePurchaseNeeds(
    needsData,
    consumptionData,
    stock,
    expirationData,
    consumed,
    mealYearData,
    purchasesData,
    getCurrentWeek(),
    calendarData,
    mealsByCategoryData,
    !hasCalendar,
    densityMap
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const text = filterText.trim().toLowerCase();
  needsData.forEach(item => {
    const rec = finalMap.get(item.name);
    if (rec && rec.btn) {
      const needInfo = purchaseMap.get(item.name);
      const needAmt = needInfo ? Math.round(needInfo.toBuy) : null;
      rec.needAmt = needAmt;
      const amountText =
        needInfo && !isNaN(needAmt)
          ? needText(item.name, needAmt, rec.product, rec.weightMap)
          : '';
      rec.btn.textContent = item.name + amountText;
      const qty = stockMap.get(item.name)?.amount || 0;
      const weekly = item.total_needed_year ? item.total_needed_year / 52 : 0;
      const showByStock = qty < weekly;
      const showByNeed = !hideZeroItems || (needAmt != null && needAmt > 0);
      const match = !text || item.name.toLowerCase().includes(text);
      rec.li.style.display =
        showByStock && showByNeed && match ? 'list-item' : 'none';
    }
  });
}

async function rerenderAll() {
  const scrollTop = window.scrollY;
  const {
    needs,
    selections,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    mealYear,
    mealMonth,
    calendar,
    mealsByCategory
  } = await getData();
  needsData = needs;
  selectionsData = selections;
  const sortedNeeds = sortItemsByCategory(needs);
  const consMap = new Map(consumption.map(c => [c.name, c]));
  const hasCalendar = calendar && Object.keys(calendar).length > 0;
  mealMonthMap = new Map(
    (mealMonth || []).map(m => [m.name, m.monthly_consumption])
  );
  mealPlanMonthMap = new Map(
    (mealMonth || []).map(m => [m.name, m.monthly_consumption])
  );
  if (!hasCalendar) {
    (mealMonth || []).forEach(m => {
      const rec = consMap.get(m.name);
      if (rec) rec.monthly_consumption += m.monthly_consumption;
      else
        consMap.set(m.name, {
          name: m.name,
          monthly_consumption: m.monthly_consumption
        });
    });
  }
  consumptionData = Array.from(consMap.values());
  consumptionMap = consMap;
  expirationData = expiration;
  stockData = stock;
  consumedYearData = consumed;
  mealYearData = mealYear;
  purchasesData = purchases;
  calendarData = calendar;
  mealsByCategoryData = mealsByCategory;
  const week = getCurrentWeek();
  const purchaseInfo = await calculatePurchaseNeeds(
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    mealYear,
    purchases,
    week,
    calendar,
    mealsByCategory,
    !hasCalendar,
    densityMap
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const itemsContainer = document.getElementById('items');
  itemsContainer.innerHTML = '';
  finalMap.clear();
  renderItemsWithCategoryHeaders(sortedNeeds, itemsContainer, item => {
    const li = document.createElement('li');
    const needInfo = purchaseMap.get(item.name);
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
    const currentQty = stockMap.get(item.name)?.amount || 0;
    const weeklyNeed = item.total_needed_year ? item.total_needed_year / 52 : 0;
    const showByStock = currentQty < weeklyNeed;
    const showByNeed = !hideZeroItems || (needAmt != null && needAmt > 0);
    li.style.display = showByStock && showByNeed ? 'list-item' : 'none';
    const rec = { li, btn, span: finalSpan, img: finalImg, needAmt, product: null, weightMap: null };
    finalMap.set(item.name, rec);
    getFinal(item.name).then(async store => {
      const product = await getFinalProduct(item.name);
      const stores = selectionsData
        .filter(s => s.name === item.name)
        .map(s => s.store);
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
    // rec already stored in finalMap
    return li;
  }, headerState);
  window.scrollTo(0, scrollTop);
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.currentStock) {
    const newStock = await convertArrayToNames(changes.currentStock.newValue || []);
    refreshNeeds(newStock, consumedYearData);
  }
  if (area === 'local' && changes[CONSUMED_PATH]) {
    const newConsumed = await convertArrayToNames(changes[CONSUMED_PATH].newValue || []);
    consumedYearData = newConsumed;
    refreshNeeds(stockData, newConsumed);
  }
  if (area === 'local' && changes.purchases) {
    purchasesData = await convertObjectKeysToNames(changes.purchases.newValue || {});
    refreshNeeds(stockData, consumedYearData);
  }
  Object.keys(changes).forEach(key => {
    if (key.startsWith('final_') || key.startsWith('final_product_')) {
      (async () => {
        const idPart = key.replace(/^final(_product)?_/, '');
        const item = await getItemName(decodeURIComponent(idPart));
        const rec = finalMap.get(item);
        if (rec) {
          initReady.then(() =>
            Promise.all([getFinal(item), getFinalProduct(item)]).then(
              async ([store, product]) => {
                const { span, img, btn } = rec;
                const stores = selectionsData
                  .filter(s => s.name === item)
                  .map(s => s.store);
                const weightMap = await buildWeightPackMap(item, stores);
                rec.product = product;
                rec.weightMap = weightMap;
                const amountText =
                  rec.needAmt != null && !isNaN(rec.needAmt)
                    ? needText(item, rec.needAmt, rec.product, rec.weightMap)
                    : '';
                btn.textContent = item + amountText;
                updateFinalInfo(item, span, img, store, product, weightMap);
              }
            )
          );
        }
      })();
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
  const [store, product] = await Promise.all([
    getFinal(itemName),
    getFinalProduct(itemName)
  ]);
  return { store, product };
}




async function commitSelections() {
  const purchases = await loadPurchases();
  const commitItems = [];
  const currentWeek = getCurrentWeek();

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
    densityMap
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));

  for (const item of needsData) {
    const needRecord = purchaseMap.get(item.name);
    if (!needRecord || needRecord.toBuy <= 0) continue;
    const { store, product } = await loadCommitData(item.name);
    if (!product) continue;
    const info = densityMap[item.name] || {};
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
    const packsToBuy = Math.ceil(needRecord.toBuy / perPackHomeQty);
    const amount = perPackHomeQty * packsToBuy;

    if (!purchases[item.name]) purchases[item.name] = [];
    purchases[item.name].push({
      purchase_week: currentWeek,
      quantity_purchased: amount
    });

    commitItems.push({
      item: item.name,
      store,
      product,
      amount,
      unit: item.home_unit,
      packs: packsToBuy
    });
  }
  await savePurchases(purchases);

  const commitItemsForSave = commitItems.map(({ item, ...rest }) => ({
    name: item,
    ...rest
  }));
  await saveArray('lastCommitItems', commitItemsForSave);
  chrome.storage.local.set({ pendingCommitWeek: currentWeek });

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
  openOrFocusWindow('whatToEatCalendar.html');
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
