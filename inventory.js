import { loadJSON } from './utils/dataLoader.js';
import { getStockBeforeWeek } from './utils/timeline.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

async function loadPurchases() {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get('purchases', data => {
        resolve(data.purchases || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

function savePurchases(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ purchases: map }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

async function loadStock() {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get('currentStock', async data => {
        if (data.currentStock) {
          resolve(data.currentStock);
        } else {
          const stock = await loadJSON(STOCK_PATH);
          resolve(stock);
        }
      });
    } catch (e) {
      const stock = await loadJSON(STOCK_PATH);
      resolve(stock);
    }
  });
}

function loadArray(key, path) {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get(key, async data => {
        if (data[key]) {
          resolve(data[key]);
        } else {
          const arr = await loadJSON(path);
          resolve(arr);
        }
      });
    } catch (e) {
      const arr = await loadJSON(path);
      resolve(arr);
    }
  });
}

function loadStoredArray(key) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(key, data => resolve(data[key] || []));
    } catch (e) {
      resolve([]);
    }
  });
}

const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadMealPlanMonth = () => loadStoredArray('mealPlanMonthly');
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);
const loadNeeds = () => loadArray('yearlyNeeds', NEEDS_PATH);

async function loadFinalProducts(names) {
  return new Promise(resolve => {
    try {
      const keys = names.map(n => `final_product_${encodeURIComponent(n)}`);
      chrome.storage.local.get(keys, data => {
        const map = {};
        names.forEach((n, idx) => {
          map[n] = data[keys[idx]] || null;
        });
        resolve(map);
      });
    } catch (e) {
      resolve({});
    }
  });
}

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

function getPackInfo(product) {
  return baseGetPackInfo(product);
}

function buildTimelineItems(stock, consumption, expiration, mealMonth) {
  const consMap = new Map(consumption.map(c => [c.name, c]));
  (mealMonth || []).forEach(m => {
    const rec = consMap.get(m.name);
    if (rec) rec.monthly_consumption += m.monthly_consumption;
    else consMap.set(m.name, { name: m.name, monthly_consumption: m.monthly_consumption });
  });
  const expMap = new Map(expiration.map(e => [e.name, e]));
  return stock.map(s => ({
    name: s.name,
    weekly_consumption:
      (consMap.get(s.name)?.monthly_consumption || 0) / WEEKS_PER_MONTH,
    expiration_weeks:
      (expMap.get(s.name)?.shelf_life_months || 12) * WEEKS_PER_MONTH,
    starting_stock: s.amount
  }));
}
function createItemRow(name, amount, unit, purchasesMap, week, product, dMap) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${name} - ${amount.toFixed(2)} ${unit}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'New';

  const packInput = document.createElement('input');
  packInput.type = 'number';
  packInput.placeholder = 'Pack qty';
  async function commitPack() {
    const val = parseFloat(packInput.value);
    if (!isNaN(val) && product) {
      let add = val;
      if (unit.toLowerCase() === 'each') {
        const { count } = getPackInfo(product, new Map(), name);
        add = val * count;
      } else {
        const info = dMap[name] || {};
        let ozQty = null;
        if (product.convertedQty != null) {
          ozQty = product.convertedQty * val;
        } else if (product.sizeQty != null && product.sizeUnit) {
          ozQty = convertWithDensity(
            product.sizeQty * val,
            product.sizeUnit,
            'oz',
            { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
          );
        }
        if (ozQty != null) {
          add = convertWithDensity(
            ozQty,
            'oz',
            unit,
            { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
          );
        }
      }
      if (!isNaN(add) && add !== 0) {
        amount += add;
        if (!purchasesMap[name]) purchasesMap[name] = [];
        purchasesMap[name].push({
          purchase_week: week,
          quantity_purchased: add,
          date_added: new Date().toISOString()
        });
        await savePurchases(purchasesMap);
        try {
          chrome.runtime.sendMessage({ type: 'inventory-updated' });
        } catch (_) {}
        span.textContent = `${name} - ${amount.toFixed(2)} ${unit}`;
      }
      packInput.value = '';
    }
  }
  async function commitChange() {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      const diff = val - amount;
      if (diff !== 0) {
        if (!purchasesMap[name]) purchasesMap[name] = [];
        purchasesMap[name].push({
          purchase_week: week,
          quantity_purchased: diff,
          date_added: new Date().toISOString()
        });
        await savePurchases(purchasesMap);
        try {
          chrome.runtime.sendMessage({ type: 'inventory-updated' });
        } catch (_) {}
        amount = val;
      }
      span.textContent = `${name} - ${amount.toFixed(2)} ${unit}`;
      input.value = '';
    }
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commitChange();
  });
  input.addEventListener('blur', commitChange);
  packInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') commitPack();
  });
  packInput.addEventListener('blur', commitPack);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(packInput);

  return div;
}

let baseStock = [];
let purchasesMap = {};
let consumptionData = [];
let mealMonthData = [];
let expirationData = [];
let categoryMap = new Map();
let needsData = [];
let finalProductMap = {};
let densityMap = {};
let filterText = '';
const headerState = {};

function renderWeek(week) {
  const container = document.getElementById('inventory');
  container.innerHTML = '';
  const timelineItems = buildTimelineItems(
    baseStock,
    consumptionData,
    expirationData,
    mealMonthData
  );
  const stockArr = getStockBeforeWeek(timelineItems, purchasesMap, week);
  const stockForWeek = new Map(stockArr.map(i => [i.name, i.amount]));
  const sortedStock = sortItemsByCategory(
    baseStock.map(it => ({ ...it, category: categoryMap.get(it.name) || '' }))
  );
  const filtered = filterText
    ? sortedStock.filter(it => it.name.toLowerCase().includes(filterText))
    : sortedStock;
  renderItemsWithCategoryHeaders(filtered, container, item => {
    const amt = stockForWeek.get(item.name) || 0;
    return createItemRow(
      item.name,
      amt,
      item.unit,
      purchasesMap,
      week,
      finalProductMap[item.name],
      densityMap
    );
  }, headerState);
}

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000) + 1;
  return Math.ceil((dayOfYear + start.getDay()) / 7);
}

async function init() {
  const weekInput = document.getElementById('week-number');
  weekInput.value = getCurrentWeek();
  [
    baseStock,
    purchasesMap,
    consumptionData,
    mealMonthData,
    expirationData,
    needsData,
    densityMap
  ] = await Promise.all([
    loadStock(),
    loadPurchases(),
    loadConsumption(),
    loadMealPlanMonth(),
    loadExpiration(),
    loadNeeds(),
    loadDensityMap()
  ]);
  finalProductMap = await loadFinalProducts(baseStock.map(s => s.name));
  categoryMap = new Map(needsData.map(n => [n.name, n.category || '']));

  renderWeek(parseInt(weekInput.value, 10) || 1);

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    renderWeek(parseInt(weekInput.value, 10) || 1);
  });

  weekInput.addEventListener('change', () => {
    const w = parseInt(weekInput.value, 10) || 1;
    renderWeek(w);
  });
}

document.addEventListener('DOMContentLoaded', init);
