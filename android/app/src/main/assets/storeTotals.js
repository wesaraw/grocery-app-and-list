import { loadJSON } from './utils/dataLoader.js';
import { calculatePurchaseNeeds } from './utils/purchaseCalculator.js';
import { initUomTable } from './utils/uomConverter.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import { loadPurchases } from './utils/purchaseStorage.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const CONSUMED_PATH = 'consumedThisYear';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

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
  const arr = await loadItemArray('currentStock');
  if (arr.length > 0) return arr;
  const stock = await loadJSON(STOCK_PATH);
  return await convertArrayToNames(stock);
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
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

const loadMealPlanMonth = () => loadStoredArray('mealPlanMonthly');

function key(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
}

async function loadStoreSelections() {
  const arr = await loadItemArray(STORE_SELECTION_KEY);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(STORE_SELECTION_PATH);
  return await convertArrayToNames(fromJson);
}

function loadSelected(item, store) {
  return new Promise(resolve => {
    const k = key('selected', item, store);
    chrome.storage.local.get([k], data => resolve(data[k] || null));
  });
}

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
  const [needs, consumption, stock, expiration, consumed, purchases, mealYear, mealMonth, calendar, meals, dMap, selections] =
    await Promise.all([
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
      loadStoreSelections()
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
    selections
  };
}


let needsData = [];
let consumptionMap = new Map();
let densityMap = {};
let mealPlanMonthMap = new Map();
let calendarData = {};

function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const sanitize = str =>
    str?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    let m;
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:doz|dozen)/i))) {
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

function getPackInfo(product) {
  return baseGetPackInfo(product);
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

function pricePerHomeUnit(itemName, product) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const info = densityMap[itemName] || {};
  const { count: pack, weightPerPack } = getPackInfo(product);
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

function monthlyCost(itemName, product) {
  const cons = consumptionMap.get(itemName);
  if (!cons) return null;
  const unitPrice = pricePerHomeUnit(itemName, product);
  if (unitPrice == null) return null;
  const base = cons.monthly_consumption || 0;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const planned = hasCalendar ? mealPlanMonthMap.get(itemName) || 0 : 0;
  return unitPrice * (base + planned);
}

async function renderTotals() {
  await initUomTable();
  const { needs, consumption, stock, expiration, consumed, purchases, mealYear, mealMonth, calendar, mealsByCategory, density, selections } = await getData();
  needsData = needs;
  densityMap = density;
  calendarData = calendar;
  const consMap = new Map(consumption.map(c => [c.name, c]));
  const hasCalendar = calendar && Object.keys(calendar).length > 0;
  mealPlanMonthMap = new Map((mealMonth || []).map(m => [m.name, m.monthly_consumption]));
  if (!hasCalendar) {
    (mealMonth || []).forEach(m => {
      const rec = consMap.get(m.name);
      if (rec) rec.monthly_consumption += m.monthly_consumption;
      else consMap.set(m.name, { name: m.name, monthly_consumption: m.monthly_consumption });
    });
  }
  consumptionMap = consMap;

  const week = getCurrentWeek();
  const purchaseInfo = await calculatePurchaseNeeds(
    needs,
    Array.from(consMap.values()),
    stock,
    expiration,
    consumed,
    mealYear,
    purchases,
    week,
    calendar,
    mealsByCategory,
    !hasCalendar,
    density
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const totals = {};
  for (const item of needs) {
    const stores = selections.filter(s => s.name === item.name).map(s => s.store);
    for (const store of stores) {
      const product = await loadSelected(item.name, store);
      if (!product) continue;
      const qty = purchaseMap.get(item.name)?.toBuy || 0;
      if (!qty) continue;
      const unitPrice = pricePerHomeUnit(item.name, product);
      if (unitPrice == null) continue;
      const cost = unitPrice * qty;
      const month = monthlyCost(item.name, product);
      if (!totals[store]) totals[store] = { purchase: 0, monthly: 0, items: [] };
      totals[store].purchase += cost;
      if (month != null) totals[store].monthly += month;
      totals[store].items.push({ name: item.name, purchase: cost, monthly: month });
    }
  }

  const container = document.getElementById('totals');
  container.innerHTML = '';
  Object.keys(totals)
    .sort()
    .forEach(store => {
      const header = document.createElement('h3');
      header.className = 'store-header';
      header.textContent = `${store} - Purchase: $${totals[store].purchase.toFixed(2)} - Monthly: $${totals[store].monthly.toFixed(2)}`;
      container.appendChild(header);
      const list = document.createElement('ul');
      list.className = 'item-list';
      totals[store].items.forEach(it => {
        const li = document.createElement('li');
        const monthlyText = it.monthly != null ? ` - Monthly: $${it.monthly.toFixed(2)}` : '';
        li.textContent = `${it.name} - Purchase: $${it.purchase.toFixed(2)}${monthlyText}`;
        list.appendChild(li);
      });
      list.style.display = 'none';
      header.addEventListener('click', () => {
        list.style.display = list.style.display === 'none' ? 'block' : 'none';
      });
      container.appendChild(list);
    });
}

function init() {
  renderTotals();
  chrome.storage.onChanged.addListener(() => {
    renderTotals();
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'selectedItem' || msg.type === 'finalSelection') {
      renderTotals();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
