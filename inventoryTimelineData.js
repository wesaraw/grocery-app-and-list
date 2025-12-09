import { WEEKS_PER_MONTH } from './utils/constants.js';
import { canonicalName } from './utils/nameUtils.js';
import { loadPurchases } from './utils/purchaseStorage.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { formatQuantity } from './utils/quantityFormat.js';

async function loadJSON(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return res.json();
}

async function loadOverrides() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('consumptionOverrides', (data) => {
        resolve(data.consumptionOverrides || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

async function loadFinalProducts(names) {
  return new Promise((resolve) => {
    try {
      const keys = names.map((n) => `final_product_${encodeURIComponent(n)}`);
      chrome.storage.local.get(keys, (data) => {
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

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return convertArrayToNames(fromJson);
}

function sortItemsByCategory(arr) {
  return arr.slice().sort((a, b) => {
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();
    if (catA === catB) {
      return a.name.localeCompare(b.name);
    }
    return catA.localeCompare(catB);
  });
}

function loadStoredArray(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data[key] || []));
  });
}

function loadStoredObj(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data[key] || {}));
  });
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

async function loadData() {
  const [needs, expiration, stock, consumption, mealYear, mealMonth, mealBreakdown] = await Promise.all([
    loadArray('yearlyNeeds', 'Required for grocery app/yearly_needs_with_manual_flags.json'),
    loadArray('expirationData', 'Required for grocery app/expiration_times_full.json'),
    loadArray('currentStock', 'Required for grocery app/current_stock_table.json'),
    loadArray('monthlyConsumption', 'Required for grocery app/monthly_consumption_table.json'),
    loadStoredArray('mealPlanYearly'),
    loadStoredArray('mealPlanMonthly'),
    loadStoredObj('mealPlanMonthlyBreakdown'),
  ]);
  return { needs, expiration, stock, consumption, mealYear, mealMonth, mealBreakdown };
}

function buildItemMap(needs, expiration, stock, consumption, mealMonth, mealBreakdown = {}) {
  const expMap = {};
  expiration.forEach((e) => {
    expMap[canonicalName(e.name)] = e.shelf_life_months * WEEKS_PER_MONTH;
  });
  const stockMap = {};
  stock.forEach((s) => {
    stockMap[canonicalName(s.name)] = s.amount;
  });

  const baseMap = {};
  consumption.forEach((c) => {
    baseMap[canonicalName(c.name)] = c.monthly_consumption;
  });
  const mealMap = {};
  (mealMonth || []).forEach((m) => {
    const key = canonicalName(m.name);
    mealMap[key] = (mealMap[key] || 0) + m.monthly_consumption;
  });
  const consMap = {};
  Object.keys(baseMap).forEach((k) => {
    consMap[k] = (consMap[k] || 0) + baseMap[k];
  });
  Object.keys(mealMap).forEach((k) => {
    consMap[k] = (consMap[k] || 0) + mealMap[k];
  });

  return needs.map((n) => {
    const key = canonicalName(n.name);
    const base = baseMap[key] || 0;
    const meal = mealMap[key] || 0;
    const total = consMap[key] || 0;
    const breakdown = mealBreakdown[key] || {};
    return {
      name: n.name,
      category: n.category || '',
      home_unit: n.home_unit || '',
      units_per_purchase: 1,
      base_monthly_consumption: base,
      meal_monthly_consumption: meal,
      meal_breakdown: breakdown,
      weekly_consumption: total / WEEKS_PER_MONTH,
      expiration_weeks: expMap[key] || 52,
      starting_stock: stockMap[key] || 0,
      purchases: [],
    };
  });
}

function simulateItem(item, overrides) {
  const incoming = [];
  const active = [];
  if (item.starting_stock > 0) {
    incoming.push({ start: 1, qty: item.starting_stock, exp: 1 + item.expiration_weeks });
  }
  item.purchases.forEach((p) => {
    const exp = p.manual_expiration_override || item.expiration_weeks;
    incoming.push({ start: p.purchase_week, qty: p.quantity_purchased, exp: p.purchase_week + exp });
  });
  incoming.sort((a, b) => a.start - b.start);

  const weeks = [];
  let runoutWeek = null;
  for (let w = 1; w <= 52; w += 1) {
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    active.sort((a, b) => a.exp - b.exp);

    for (let i = 0; i < active.length; ) {
      if (active[i].qty >= 0) {
        i += 1;
        continue;
      }
      let neg = -active[i].qty;
      active.splice(i, 1);
      while (neg > 0 && active.length) {
        if (active[0].qty > neg) {
          active[0].qty -= neg;
          neg = 0;
        } else {
          neg -= active[0].qty;
          active.shift();
        }
      }
      if (neg > 0) {
        active.length = 0;
        neg = 0;
      }
    }

    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    const qtyBefore = active.reduce((s, b) => s + b.qty, 0);
    let cls = 'green';
    const closestExp = active.length ? Math.min(...active.map((b) => b.exp)) : w;
    const weeksToExpiration = closestExp - w;
    if (qtyBefore <= 0 || weeksToExpiration <= 0) cls = 'red';
    else if (qtyBefore < item.weekly_consumption * 2 || weeksToExpiration < item.expiration_weeks * 0.1) {
      cls = 'yellow';
    }
    weeks.push({ qty: formatQuantity(qtyBefore), rawQty: qtyBefore, weeksToExpiration: Math.floor(weeksToExpiration), cls });
    const cons = (overrides[w] !== undefined ? overrides[w] : 1) * item.weekly_consumption;
    let remaining = cons;
    while (active.length && remaining > 0) {
      if (active[0].qty > remaining) {
        active[0].qty -= remaining;
        remaining = 0;
      } else {
        remaining -= active[0].qty;
        active.shift();
      }
    }
    const qty = active.reduce((sum, b) => sum + b.qty, 0);
    if (qty < 0) {
      active.length = 0;
    }
    if (qty <= 0 && runoutWeek === null) runoutWeek = w;
  }
  return weeks;
}

async function loadTimelineItems() {
  const data = await loadData();
  const sortedNeeds = sortItemsByCategory(data.needs);
  const items = buildItemMap(sortedNeeds, data.expiration, data.stock, data.consumption, data.mealMonth, data.mealBreakdown);
  const [savedMap, overridesMap, finalMap] = await Promise.all([
    loadPurchases(),
    loadOverrides(),
    loadFinalProducts(sortedNeeds.map((n) => n.name)),
  ]);
  items.forEach((it) => {
    if (savedMap[it.name]) {
      it.purchases = savedMap[it.name];
    }
    const data = overridesMap[it.name] || {};
    const weekMap = {};
    Object.keys(data).forEach((w) => {
      const diff = data[w];
      weekMap[w] = it.weekly_consumption ? 1 + diff / it.weekly_consumption : 1;
    });
    it.overrideWeeks = weekMap;
    it.finalProduct = finalMap[it.name] || null;
  });
  return items;
}

export {
  buildItemMap,
  getCurrentWeek,
  loadTimelineItems,
  simulateItem,
  sortItemsByCategory,
};
