import { WEEKS_PER_MONTH } from './utils/constants.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { canonicalName } from './utils/nameUtils.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArray as loadItemArray,
  loadObject as loadItemObject,
  convertObjectKeysToNames,
  getItemId,
  getItemName
} from './utils/itemRegistry.js';
import { loadItemDetails } from './utils/itemDetails.js';

async function loadJSON(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return res.json();
}

async function loadOverrides() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('consumptionOverrides', data => {
        resolve(data.consumptionOverrides || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

async function loadFinalProducts(names) {
  try {
    const ids = await Promise.all(names.map(n => getItemId(n)));
    const details = await loadItemDetails(ids);
    const map = {};
    names.forEach((n, idx) => {
      map[n] = details[ids[idx]] || null;
    });
    return map;
  } catch (e) {
    return {};
  }
}

function loadArray(key, path) {
  return new Promise(async resolve => {
    const arr = await loadItemArray(key);
    if (arr.length > 0) resolve(arr);
    else resolve(await loadJSON(path));
  });
}

function sortItemsByCategory(arr) {
  return arr.slice().sort((a, b) => {
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();
    if (catA === catB) {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }
    return catA.localeCompare(catB);
  });
}

function loadStoredArray(key) {
  return loadItemArray(key);
}

function loadStoredObj(key) {
  return loadItemObject(key);
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
    loadStoredObj('mealPlanMonthlyBreakdown')
  ]);
  return { needs, expiration, stock, consumption, mealYear, mealMonth, mealBreakdown };
}

function buildItemMap(needs, expiration, stock, consumption, mealMonth, mealBreakdown = {}) {
  const expMap = {};
  expiration.forEach(e => {
    expMap[canonicalName(e.name)] = e.shelf_life_months * WEEKS_PER_MONTH;
  });
  const stockMap = {};
  stock.forEach(s => {
    stockMap[canonicalName(s.name)] = s.amount;
  });

  const baseMap = {};
  consumption.forEach(c => {
    baseMap[canonicalName(c.name)] = c.monthly_consumption;
  });
  const mealMap = {};
  (mealMonth || []).forEach(m => {
    const key = canonicalName(m.name);
    mealMap[key] = (mealMap[key] || 0) + m.monthly_consumption;
  });
  const consMap = {};
  Object.keys(baseMap).forEach(k => {
    consMap[k] = (consMap[k] || 0) + baseMap[k];
  });
  Object.keys(mealMap).forEach(k => {
    consMap[k] = (consMap[k] || 0) + mealMap[k];
  });

  return needs.map(n => {
    const key = canonicalName(n.name);
    const base = baseMap[key] || 0;
    const meal = mealMap[key] || 0;
    const total = consMap[key] || 0;
    const breakdown = mealBreakdown[key] || {};
    return {
      name: n.name,
      category: n.category || '',
      units_per_purchase: 1,
      base_monthly_consumption: base,
      meal_monthly_consumption: meal,
      meal_breakdown: breakdown,
      weekly_consumption: total / WEEKS_PER_MONTH,
      expiration_weeks: expMap[key] || 52,
      starting_stock: stockMap[key] || 0,
      purchases: []
    };
  });
}

function simulateItem(item, overrides) {
  const incoming = [];
  const active = [];
  // initial stock treated as purchase at week 1
  if (item.starting_stock > 0) {
    incoming.push({ start: 1, qty: item.starting_stock, exp: 1 + item.expiration_weeks });
  }
  item.purchases.forEach(p => {
    const exp = p.manual_expiration_override || item.expiration_weeks;
    incoming.push({ start: p.purchase_week, qty: p.quantity_purchased, exp: p.purchase_week + exp });
  });
  incoming.sort((a,b)=>a.start-b.start);

  const weeks = [];
  let runoutWeek = null;
  for (let w=1; w<=52; w++) {
    // move incoming purchases into active inventory
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    // sort by soonest expiration for processing
    active.sort((a,b)=>a.exp-b.exp);

    // apply negative purchases immediately
    for (let i = 0; i < active.length; ) {
      if (active[i].qty >= 0) { i++; continue; }
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
    }

    // remove expired batches
    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    const qtyBefore = active.reduce((s,b) => s + b.qty, 0);
    let qty = qtyBefore;
    const closestExp = active.length ? Math.min(...active.map(b => b.exp)) : w;
    const weeksToExpiration = closestExp - w;
    let cls = 'green';
    if (qtyBefore <= 0 || weeksToExpiration <= 0) cls = 'red';
    else if (qtyBefore < item.weekly_consumption * 2 ||
             weeksToExpiration < item.expiration_weeks * 0.1) {
      cls = 'yellow';
    }
    weeks.push({
      qty: qtyBefore.toFixed(1),
      weeksToExpiration: Math.floor(weeksToExpiration),
      cls
    });
    const cons = (overrides[w]!==undefined ? overrides[w] : 1) * item.weekly_consumption;
    let remaining = cons;
    while (active.length && remaining>0) {
      if (active[0].qty > remaining) {
        active[0].qty -= remaining;
        remaining = 0;
      } else {
        remaining -= active[0].qty;
        active.shift();
      }
    }
    qty = active.reduce((sum,b)=>sum+b.qty,0);
    if (qty < 0) {
      qty = 0;
      active.length = 0;
    }
    if (qty <= 0 && runoutWeek===null) runoutWeek = w;
  }
  return weeks;
}

function buildGrid(items, headerState = {}, startWeek = 1) {
  const grid = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  const imgHead = document.createElement('th');
  imgHead.className = 'item-image image-header';
  header.appendChild(imgHead);
  const firstTh = document.createElement('th');
  firstTh.textContent = 'Item';
  firstTh.className = 'item-label';
  header.appendChild(firstTh);
  for (let w = startWeek; w <= 52; w++) {
    const th = document.createElement('th');
    th.textContent = w;
    header.appendChild(th);
  }
  thead.appendChild(header);
  grid.appendChild(thead);
  const tbody = document.createElement('tbody');

  let lastCat = null;
  let headerRow = null;
  let itemRows = [];

  function finalizeHeader(cat, row, rows) {
    if (!row) return;
    const hidden = headerState[cat] !== undefined ? headerState[cat] : true;
    row.dataset.hidden = hidden ? 'true' : 'false';
    rows.forEach(r => {
      r.style.display = hidden ? 'none' : '';
    });
    const cells = row.querySelectorAll('.category-header, .category-spacer');
    cells.forEach(cell => {
      cell.style.cursor = 'pointer';
      const associatedRows = rows.slice();
      cell.addEventListener('click', () => {
        const isHidden = row.dataset.hidden === 'true';
        row.dataset.hidden = isHidden ? 'false' : 'true';
        associatedRows.forEach(r => {
          r.style.display = isHidden ? '' : 'none';
        });
        headerState[cat] = !isHidden;
      });
    });
  }

  items.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, headerRow, itemRows);
      lastCat = cat;
      headerRow = document.createElement('tr');
      const thImg = document.createElement('th');
      thImg.className = 'category-header item-image';
      headerRow.appendChild(thImg);
      const thCat = document.createElement('th');
      thCat.className = 'category-header item-label';
      thCat.textContent = cat;
      headerRow.appendChild(thCat);
      const thFill = document.createElement('th');
      thFill.colSpan = 52 - startWeek + 1;
      thFill.className = 'category-spacer';
      headerRow.appendChild(thFill);
      tbody.appendChild(headerRow);
      itemRows = [];
    }
    const overrides = {};
    if (item.overrideWeeks) Object.assign(overrides, item.overrideWeeks);
    const weeks = simulateItem(item, overrides);
    const row = document.createElement('tr');
    const imgTd = document.createElement('td');
    imgTd.className = 'item-image';
    if (item.finalProduct && item.finalProduct.image) {
      const img = document.createElement('img');
      img.src = item.finalProduct.image;
      img.alt = item.finalProduct.name || item.name;
      imgTd.appendChild(img);
    }
    row.appendChild(imgTd);
    const th = document.createElement('th');
    th.className = 'item-label';
    th.innerHTML = `${item.name}<br/><span class="exp-weeks">${item.expiration_weeks}w</span>` +
      `<br/><span class="weekly-cons">${item.weekly_consumption.toFixed(2)}/wk</span>`;
    const span = th.querySelector('.weekly-cons');
    if (span) {
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => {
        const params = new URLSearchParams({
          item: item.name,
          base: item.base_monthly_consumption ?? 0,
          meal: item.meal_monthly_consumption ?? 0,
          weekly: item.weekly_consumption,
          wpm: WEEKS_PER_MONTH
        });
        openOrFocusWindow(`weeklyNeedDebug.html?${params.toString()}`, 320, 240);
      });
    }
    row.appendChild(th);
    weeks.forEach((w, idx) => {
      const weekNum = idx + 1;
      if (weekNum < startWeek) return;
      const td = document.createElement('td');
      td.className = w.cls;
      td.innerHTML = `${w.qty}<br/>⏰ ${w.weeksToExpiration}`;
      row.appendChild(td);
    });
    tbody.appendChild(row);
    itemRows.push(row);
  });
  finalizeHeader(lastCat, headerRow, itemRows);
  grid.appendChild(tbody);
  return grid;
}

function buildPurchaseList(items) {
  const container = document.createElement('div');
  items.forEach(item => {
    if (!item.purchases.length) return;
    const header = document.createElement('h3');
    header.textContent = item.name;
    container.appendChild(header);
    const ul = document.createElement('ul');
    item.purchases.forEach((p, idx) => {
      const li = document.createElement('li');
      const date = new Date(p.date_added).toLocaleDateString();
      li.textContent = `Week ${p.purchase_week} - Qty ${p.quantity_purchased} - ${date} `;
      const btn = document.createElement('button');
      btn.textContent = 'X';
      btn.addEventListener('click', () => {
        item.purchases.splice(idx, 1);
        saveAllPurchases(items);
        showPurchaseHistory();
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    container.appendChild(ul);
  });
  return container;
}

function saveAllPurchases(items) {
  const map = {};
  items.forEach(it => { if (it.purchases.length) map[it.name] = it.purchases; });
  savePurchases(map);
}

let showingHistory = false;
let globalItems = [];
let gridContainer;
const headerState = {};
let currentOnly = false;

async function fetchItems() {
  const data = await loadData();
  const sortedNeeds = sortItemsByCategory(data.needs);
  const items = buildItemMap(
    sortedNeeds,
    data.expiration,
    data.stock,
    data.consumption,
    data.mealMonth,
    data.mealBreakdown
  );
  const [savedMap, overridesMap, finalMap] = await Promise.all([
    loadPurchases(),
    loadOverrides(),
    loadFinalProducts(sortedNeeds.map(n => n.name))
  ]);
  items.forEach(it => {
    if (savedMap[it.name]) {
      it.purchases = savedMap[it.name];
    }
    const data = overridesMap[it.name] || {};
    const weekMap = {};
    Object.keys(data).forEach(w => {
      const diff = data[w];
      weekMap[w] = it.weekly_consumption
        ? 1 + diff / it.weekly_consumption
        : 1;
    });
    it.overrideWeeks = weekMap;
    it.finalProduct = finalMap[it.name] || null;
  });
  return items;
}

async function refreshItems() {
  globalItems = await fetchItems();
  const datalist = document.getElementById('item-list');
  if (datalist) {
    datalist.innerHTML = '';
    globalItems.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.name;
      datalist.appendChild(opt);
    });
  }
  if (showingHistory) {
    showPurchaseHistory();
  } else {
    const text = filterText.trim();
    if (text) {
      const filtered = globalItems.filter(it =>
        it.name.toLowerCase().includes(text)
      );
      showGrid(filtered);
    } else {
      showGrid();
    }
  }
}

function resizeWindowToContent() {
  try {
    const width = Math.min(
      screen.availWidth,
      document.documentElement.scrollWidth + 20
    );
    const height = Math.min(
      screen.availHeight,
      document.documentElement.scrollHeight + 20
    );
    chrome.windows.getCurrent(win => {
      chrome.windows.update(win.id, { width, height });
    });
  } catch (e) {
    // ignore if chrome APIs are unavailable
  }
}

let filterText = '';

function showGrid(items = globalItems) {
  showingHistory = false;
  document.getElementById('view-purchases').textContent = 'Purchase History';
  gridContainer.innerHTML = '';
  const startWeek = currentOnly ? getCurrentWeek() : 1;
  gridContainer.appendChild(buildGrid(items, headerState, startWeek));
  resizeWindowToContent();
}

function showPurchaseHistory() {
  showingHistory = true;
  document.getElementById('view-purchases').textContent = 'Timeline View';
  gridContainer.innerHTML = '';
  gridContainer.appendChild(buildPurchaseList(globalItems));
  resizeWindowToContent();
}

async function init() {
  gridContainer = document.getElementById('grid-container');
  await refreshItems();

  function applyFilter() {
    filterText = document.getElementById('purchase-item').value.trim().toLowerCase();
    if (showingHistory) return;
    const items = filterText
      ? globalItems.filter(it => it.name.toLowerCase().includes(filterText))
      : globalItems;
    showGrid(items);
  }

  document.getElementById('view-purchases').addEventListener('click', () => {
    if (showingHistory) {
      showGrid();
      if (filterText.trim()) applyFilter();
    } else {
      showPurchaseHistory();
    }
  });

  document.getElementById('current-view').addEventListener('click', () => {
    currentOnly = !currentOnly;
    const btn = document.getElementById('current-view');
    btn.textContent = currentOnly ? 'Full Year' : 'Current View';
    if (!showingHistory) {
      applyFilter();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (
      changes.yearlyNeeds ||
      changes.expirationData ||
      changes.currentStock ||
      changes.monthlyConsumption ||
      changes.mealPlanMonthly ||
      changes.mealPlanYearly
    ) {
      await refreshItems();
      return;
    }

    let updated = false;
    if (changes.purchases) {
      const map = await convertObjectKeysToNames(changes.purchases.newValue || {});
      globalItems.forEach(it => {
        it.purchases = map[it.name] || [];
      });
      updated = true;
    }
    if (changes.consumptionOverrides || changes.consumedThisYear) {
      const overridesMap = await loadOverrides();
      globalItems.forEach(it => {
        const data = overridesMap[it.name] || {};
        const weekMap = {};
        Object.keys(data).forEach(w => {
          const diff = data[w];
          weekMap[w] = it.weekly_consumption
            ? 1 + diff / it.weekly_consumption
            : 1;
        });
        it.overrideWeeks = weekMap;
      });
      updated = true;
    }
    for (const k of Object.keys(changes)) {
      if (k === 'itemDetails') {
        const newDetails = changes.itemDetails.newValue || {};
        const oldDetails = changes.itemDetails.oldValue || {};
        const ids = new Set([
          ...Object.keys(newDetails),
          ...Object.keys(oldDetails)
        ]);
        for (const id of ids) {
          const name = await getItemName(id);
          const item = globalItems.find(i => i.name === name);
          if (item) {
            item.finalProduct = newDetails[id] || null;
            updated = true;
          }
        }
      }
    }
    if (updated) {
      if (showingHistory) {
        showPurchaseHistory();
      } else {
        applyFilter();
      }
    }
  });

  try {
    chrome.runtime.onMessage.addListener(async msg => {
      if (!msg) return;
      if (msg.type === 'inventory-updated') {
        await refreshItems();
      } else if (msg.type === 'finalSelection') {
        const name = await getItemName(msg.itemId);
        const item = globalItems.find(i => i.name === name);
        if (item) {
          item.finalProduct = msg.product || null;
          applyFilter();
        }
      }
    });
  } catch (_) {}

  document.getElementById('add-purchase').addEventListener('click', () => {
    const name = document.getElementById('purchase-item').value;
    const week = parseInt(document.getElementById('purchase-week').value,10);
    const qty = parseFloat(document.getElementById('purchase-qty').value);
    const item = globalItems.find(i => i.name===name);
    if (!item) return;
    item.purchases.push({ purchase_week: week, quantity_purchased: qty, date_added: new Date().toISOString() });
    saveAllPurchases(globalItems);
    if (showingHistory) {
      showPurchaseHistory();
    } else {
      applyFilter();
    }
  });

  document.getElementById('purchase-item').addEventListener('input', applyFilter);

  document.getElementById('commit').addEventListener('click', () => {
    openOrFocusWindow('shoppingList.html');
  });
  document.getElementById('editInventory').addEventListener('click', () => {
    openOrFocusWindow('inventory.html');
  });
  document.getElementById('editConsumption').addEventListener('click', () => {
    openOrFocusWindow('consumed.html');
  });
  document.getElementById('editPlan').addEventListener('click', () => {
    openOrFocusWindow('editPlan.html');
  });
  document.getElementById('addItem').addEventListener('click', () => {
    openOrFocusWindow('addItem.html');
  });
  document.getElementById('removeItem').addEventListener('click', () => {
    openOrFocusWindow('removeItem.html');
  });
  document.getElementById('editCategory').addEventListener('click', () => {
    openOrFocusWindow('editCategory.html');
  });
  document.getElementById('editNames').addEventListener('click', () => {
    openOrFocusWindow('renameItem.html');
  });
  document.getElementById('editExpirations').addEventListener('click', () => {
    openOrFocusWindow('expiration.html');
  });
  document.getElementById('couponBtn').addEventListener('click', () => {
    openOrFocusWindow('coupon.html');
  });
  document.getElementById('backupBtn').addEventListener('click', () => {
    openOrFocusWindow('backup.html', 400, 400);
  });
  document.getElementById('uomChange').addEventListener('click', () => {
    openOrFocusWindow('uomChange.html');
  });
  document.getElementById('densityRatios').addEventListener('click', () => {
    openOrFocusWindow('densityRatios.html');
  });
  document.getElementById('mealMultiplier').addEventListener('click', () => {
    openOrFocusWindow('mealMultiplier.html');
  });
  document.getElementById('cookingDays').addEventListener('click', () => {
    openOrFocusWindow('cookingDays.html');
  });
  document.getElementById('mealPlanner').addEventListener('click', () => {
    openOrFocusWindow('mealPlanner.html');
  });
}

document.addEventListener('DOMContentLoaded', init);
