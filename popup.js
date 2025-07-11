import { loadJSON } from './utils/dataLoader.js';
import { calculatePurchaseNeeds } from './utils/purchaseCalculator.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { parseUnitPrice, getPriceUnitInfo, sheetSqFtFor } from "./utils/priceUtils.js";

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const CONSUMED_PATH = 'consumedThisYear';

async function loadPurchases() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('purchases', data => {
        resolve(data.purchases || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

function loadArray(key, path) {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      if (data[key]) {
        resolve(data[key]);
      } else {
        const arr = await loadJSON(path);
        resolve(arr);
      }
    });
  });
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

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
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
  const [needs, selections, consumption, stock, expiration, consumed, purchases, mealYear, mealMonth, calendar, meals] =
    await Promise.all([
      loadNeeds(),
      loadJSON(STORE_SELECTION_PATH),
      loadMonthlyConsumption(),
      loadStock(),
      loadExpiration(),
      loadConsumed(),
      loadPurchases(),
      loadStoredArray('mealPlanYearly'),
      loadMealPlanMonth(),
      loadCalendar(),
      loadMealsByCategory()
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
    mealsByCategory: meals
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
let mealMonthMap = new Map();
let mealPlanMonthMap = new Map();
let selectionsData = [];

let resolveInit;
const initReady = new Promise(resolve => {
  resolveInit = resolve;
});

function getFinal(itemName) {
  const key = `final_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([key], data => resolve(data[key]));
  });
}

function getFinalProduct(itemName) {
  const key = `final_product_${encodeURIComponent(itemName)}`;
  return new Promise(resolve => {
    chrome.storage.local.get([key], data => resolve(data[key]));
  });
}

function storageKey(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
}

function loadScraped(item, store) {
  return new Promise(resolve => {
    const key = storageKey('scraped', item, store);
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
    return (
      s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
      s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
      s.match(/pack\s*of\s*(\d+)/i) ||
      s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i) ||
      s.match(/(\d+)\s*-\s*\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i)
    );
  };

  let m = matchPack(product?.name);
  if (!m) m = matchPack(product?.size);
  if (!m) m = matchPack(product?.unit);
  if (m) {
    const count = parseInt(m[1], 10);
    const source = `${product?.name || ''} ${product?.size || ''} ${product?.unit || ''}`;
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(m[0]);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

function weightKey(product) {
  if (product.convertedQty != null) return product.convertedQty.toFixed(2);
  if (product.sizeQty != null && product.sizeUnit) {
    const oz = convert(product.sizeQty, product.sizeUnit, 'oz');
    if (!isNaN(oz)) return oz.toFixed(2);
  }
  return null;
}

function getPackInfo(product, map = weightPackMap) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product);
  if (key && map && map.has(key)) {
    return map.get(key);
  }
  return base;
}

function getPackCount(product, map = weightPackMap) {
  return getPackInfo(product, map).count;
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
        const key = weightKey(p);
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
  const { count: pack, weightPerPack } = getPackInfo(product, map);
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
      ozQty = convert(product.sizeQty * mult, product.sizeUnit, 'oz');
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convert(1, item.home_unit, 'oz');
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
    const info = getPackInfo(product, map);
    if (info.count > 1) {
      const wKey = weightKey(product);
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
  const purchaseInfo = calculatePurchaseNeeds(
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
    !hasCalendar
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const itemsContainer = document.getElementById('items');

  renderItemsWithCategoryHeaders(sortedNeeds, itemsContainer, item => {
    const li = document.createElement('li');
    const info = purchaseMap.get(item.name);
    const needAmt = info ? Math.round(info.toBuy) : null;
    const amountText =
      info && !isNaN(needAmt) ? ` (Need: ${needAmt} ${info.home_unit})` : '';
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
    getFinal(item.name).then(async store => {
      const product = await getFinalProduct(item.name);
      const stores = selections
        .filter(s => s.name === item.name)
        .map(s => s.store);
      const weightMap = await buildWeightPackMap(item.name, stores);
      if (product) {
        const info = getPackInfo(product, weightMap);
        if (info.count > 1) {
          const wKey = weightKey(product);
          if (
            wKey &&
            (!weightMap.has(wKey) || weightMap.get(wKey).count < info.count)
          ) {
            weightMap.set(wKey, info);
          }
        }
      }
      updateFinalInfo(item.name, finalSpan, finalImg, store, product, weightMap);
    });
    li.appendChild(finalSpan);
    li.appendChild(finalImg);
    finalMap.set(item.name, { li, btn, span: finalSpan, img: finalImg });
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
      const { span, img } = rec;
      const prod = message.product;
      const stores = selectionsData
        .filter(s => s.name === message.item)
        .map(s => s.store);
      const weightMap = await buildWeightPackMap(message.item, stores);
      if (prod) {
        const info = getPackInfo(prod, weightMap);
        if (info.count > 1) {
          const wKey = weightKey(prod);
          if (wKey && (!weightMap.has(wKey) || weightMap.get(wKey).count < info.count)) {
            weightMap.set(wKey, info);
          }
        }
      }
      updateFinalInfo(message.item, span, img, message.store, prod, weightMap);
    }
  }
});

async function refreshNeeds(stock = stockData, consumed = consumedYearData) {
  stockData = stock;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const purchaseInfo = calculatePurchaseNeeds(
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
    !hasCalendar
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const text = filterText.trim().toLowerCase();
  needsData.forEach(item => {
    const rec = finalMap.get(item.name);
    if (rec && rec.btn) {
      const info = purchaseMap.get(item.name);
      const needAmt = info ? Math.round(info.toBuy) : null;
      const amountText =
        info && !isNaN(needAmt) ? ` (Need: ${needAmt} ${info.home_unit})` : '';
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
  const purchaseInfo = calculatePurchaseNeeds(
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
    !hasCalendar
  );
  const purchaseMap = new Map(purchaseInfo.map(p => [p.name, p]));
  const stockMap = new Map(stock.map(i => [i.name, i]));
  const itemsContainer = document.getElementById('items');
  itemsContainer.innerHTML = '';
  finalMap.clear();
  renderItemsWithCategoryHeaders(sortedNeeds, itemsContainer, item => {
    const li = document.createElement('li');
    const info = purchaseMap.get(item.name);
    const needAmt = info ? Math.round(info.toBuy) : null;
    const amountText =
      info && !isNaN(needAmt) ? ` (Need: ${needAmt} ${info.home_unit})` : '';
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
    getFinal(item.name).then(async store => {
      const product = await getFinalProduct(item.name);
      const stores = selectionsData
        .filter(s => s.name === item.name)
        .map(s => s.store);
      const weightMap = await buildWeightPackMap(item.name, stores);
      if (product) {
        const info = getPackInfo(product, weightMap);
        if (info.count > 1) {
          const wKey = weightKey(product);
          if (
            wKey &&
            (!weightMap.has(wKey) || weightMap.get(wKey).count < info.count)
          ) {
            weightMap.set(wKey, info);
          }
        }
      }
      updateFinalInfo(item.name, finalSpan, finalImg, store, product, weightMap);
    });
    li.appendChild(finalSpan);
    li.appendChild(finalImg);
    finalMap.set(item.name, { li, btn, span: finalSpan, img: finalImg });
    return li;
  }, headerState);
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
          Promise.all([
            getFinal(item),
            getFinalProduct(item)
          ]).then(async ([store, product]) => {
            const { span, img } = rec;
            const stores = selectionsData
              .filter(s => s.name === item)
              .map(s => s.store);
            const weightMap = await buildWeightPackMap(item, stores);
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
  const [store, product] = await Promise.all([
    getFinal(itemName),
    getFinalProduct(itemName)
  ]);
  return { store, product };
}



async function savePurchases(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases: map }, () => resolve());
  });
}

async function commitSelections() {
  const purchases = await loadPurchases();
  const commitItems = [];
  const currentWeek = getCurrentWeek();

  for (const item of needsData) {
    const { store, product } = await loadCommitData(item.name);
    if (!product) continue;
    const { count: pack, weightPerPack } = getPackInfo(product, new Map());

    let amount = pack;
    if (item.home_unit.toLowerCase() !== 'each') {
      const mult = weightPerPack ? 1 : pack;
      let ozQty = null;
      if (product.convertedQty != null) {
        ozQty = product.convertedQty * mult;
      } else if (product.sizeQty != null && product.sizeUnit) {
        ozQty = convert(product.sizeQty * mult, product.sizeUnit, 'oz');
      }
      if (ozQty != null) {
        amount = convert(ozQty, 'oz', item.home_unit);
      }
    }

    if (!purchases[item.name]) purchases[item.name] = [];
    purchases[item.name].push({
      purchase_week: currentWeek,
      quantity_purchased: amount
    });

    commitItems.push({ item: item.name, store, product, amount, unit: item.home_unit });
  }

  await savePurchases(purchases);
  chrome.storage.local.set({ lastCommitItems: commitItems });

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

document
  .getElementById('editExpirations')
  .addEventListener('click', openExpirationEditor);

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

document
  .getElementById('uomChange')
  .addEventListener('click', openUomChange);

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
