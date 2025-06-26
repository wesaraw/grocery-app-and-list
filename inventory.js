import { loadJSON } from './utils/dataLoader.js';
import { getStockBeforeWeek } from './utils/timeline.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { normalizeName } from './utils/nameUtils.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

async function loadPurchases() {
  return new Promise(resolve => {
    chrome.storage.local.get('purchases', data => {
      resolve(data.purchases || {});
    });
  });
}

function savePurchases(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases: map }, () => resolve());
  });
}

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

function loadStoredArray(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadMealPlanMonth = () => loadStoredArray('mealPlanMonthly');
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);
const loadNeeds = () => loadArray('yearlyNeeds', NEEDS_PATH);

function buildTimelineItems(stock, consumption, expiration, mealMonth) {
  const consMap = new Map(consumption.map(c => [normalizeName(c.name), c]));
  (mealMonth || []).forEach(m => {
    const key = normalizeName(m.name);
    const rec = consMap.get(key);
    if (rec) rec.monthly_consumption += m.monthly_consumption;
    else consMap.set(key, { name: m.name, monthly_consumption: m.monthly_consumption });
  });
  const expMap = new Map(expiration.map(e => [normalizeName(e.name), e]));
  return stock.map(s => {
    const key = normalizeName(s.name);
    return {
      name: s.name,
      weekly_consumption:
        (consMap.get(key)?.monthly_consumption || 0) / WEEKS_PER_MONTH,
      expiration_weeks:
        (expMap.get(key)?.shelf_life_months || 12) * WEEKS_PER_MONTH,
      starting_stock: s.amount
    };
  });
}
function createItemRow(name, amount, unit, purchasesMap, week) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${name} - ${amount.toFixed(2)} ${unit}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'New';
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
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  return div;
}

let baseStock = [];
let purchasesMap = {};
let consumptionData = [];
let mealMonthData = [];
let expirationData = [];
let categoryMap = new Map();
let needsData = [];
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
    return createItemRow(item.name, amt, item.unit, purchasesMap, week);
  }, headerState);
}

async function init() {
  const weekInput = document.getElementById('week-number');
  [baseStock, purchasesMap, consumptionData, mealMonthData, expirationData, needsData] = await Promise.all([
    loadStock(),
    loadPurchases(),
    loadConsumption(),
    loadMealPlanMonth(),
    loadExpiration(),
    loadNeeds()
  ]);
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
