import { WEEKS_PER_MONTH } from './utils/constants.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { canonicalName } from './utils/nameUtils.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { formatQuantity } from './utils/quantityFormat.js';

import {
  ensureIngredientRecordForItem,
  isIngredientRecordStale,
  searchFdcFoods,
  rankCandidates,
  MissingFdcApiKeyError
} from './utils/fdcClient.js';
import {
  getIngredientMap,
  isIngredientNutritionExempt,
  clearIngredientNutritionExempt
} from './utils/ingredientStorage.js';
import { getFdcApiKey } from './utils/apiKeyStorage.js';
import {
  getPendingMatch,
  getPendingMatches,
  setPendingMatch,
  removePendingMatch,
  setActivePendingMatchEntry,
  clearActivePendingMatchEntry
} from './utils/nutritionMatching.js';

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


async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
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
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

function loadStoredObj(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || {}));
  });
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

async function loadData() {
  const [needs, expiration, stock, consumption, mealYear, mealMonth, mealBreakdown] = await Promise.all([
    loadArray('yearlyNeeds', 'data/required-for-grocery-app/yearly_needs_with_manual_flags.json'),
    loadArray('expirationData', 'data/required-for-grocery-app/expiration_times_full.json'),
    loadArray('currentStock', 'data/required-for-grocery-app/current_stock_table.json'),
    loadArray('monthlyConsumption', 'data/required-for-grocery-app/monthly_consumption_table.json'),
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
      home_unit: n.home_unit || '',
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
      qty: formatQuantity(qtyBefore),
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
    const metaDiv = document.createElement('div');
    metaDiv.innerHTML = `${item.name}<br/><span class="exp-weeks">${item.expiration_weeks}w</span>` +
      `<br/><span class="weekly-cons">${formatQuantity(item.weekly_consumption)}/wk</span>`;
    th.appendChild(metaDiv);
    const span = metaDiv.querySelector('.weekly-cons');
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
    const nutritionRow = document.createElement('div');
    nutritionRow.className = 'nutrition-button-row';
    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'nutrition-info-button';
    infoBtn.textContent = 'Nutrition Info';
    infoBtn.addEventListener('click', () => {
      openOrFocusWindow(`nutritionInfo.html?item=${encodeURIComponent(item.name)}`, 420, 520);
    });
    nutritionRow.appendChild(infoBtn);

    const nutritionBtn = document.createElement('button');
    nutritionBtn.type = 'button';
    nutritionBtn.className = 'nutrition-sync-button';
    nutritionBtn.textContent = 'Sync Nutrition';
    nutritionBtn.addEventListener('click', async () => {
      const state = nutritionBtn.dataset.state;
      if (state === 'pending') {
        await queueNutritionConfirmForItem(item.name, { prioritize: true });
        return;
      }
      if (state === 'editable' || state === 'stale') {
        await beginNutritionEdit(item);
        return;
      }
      if (state === 'exempt') {
        const shouldReenable = confirm(
          'This item is marked as not requiring nutrition data. Re-enable nutrition syncing?'
        );
        if (!shouldReenable) return;
        try {
          await clearIngredientNutritionExempt(item.name);
        } catch (err) {
          console.error('Unable to clear nutrition exemption', err);
        }
        enqueueNutritionItem(item.name, { force: true, matchOptions: { force: true } });
        nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
        if (!processingNutrition) {
          processNutritionQueue();
        }
        return;
      }
      enqueueNutritionItem(item.name, { force: false });
      nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
      if (!processingNutrition) {
        processNutritionQueue();
      }
    });
    nutritionRow.appendChild(nutritionBtn);
    th.appendChild(nutritionRow);
    nutritionButtons.set(item.name, { info: infoBtn, sync: nutritionBtn });
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

const nutritionButtons = new Map();
const nutritionQueue = [];
const queuedNutritionNames = new Set();
const nutritionRetryCounts = new Map();
const pendingConfirmQueue = [];
let activeConfirmItem = null;
const NUTRITION_RETRY_LIMIT = 3;
const NUTRITION_MIN_DELAY_MS = 350;
const NUTRITION_MAX_DELAY_MS = 5000;
let nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
let processingNutrition = false;
let nutritionStatusEl = null;
let missingApiKeyWarningShown = false;
let nutritionTransientTimer = null;

function publishActivePendingMatch(entry) {
  if (entry && entry.itemName && entry.normalizedName) {
    setActivePendingMatchEntry(entry).catch(err => {
      console.error('Unable to set active pending match', err);
    });
  } else {
    clearActivePendingMatchEntry().catch(err => {
      console.error('Unable to clear active pending match', err);
    });
  }
}

function setNutritionStatus(message, type = 'info') {
  if (!nutritionStatusEl) return;
  if (!message) {
    if (nutritionTransientTimer) {
      clearTimeout(nutritionTransientTimer);
      nutritionTransientTimer = null;
    }
    nutritionStatusEl.textContent = '';
    nutritionStatusEl.className = 'nutrition-status';
    nutritionStatusEl.style.display = 'none';
    return;
  }
  nutritionStatusEl.textContent = message;
  nutritionStatusEl.className = `nutrition-status ${type}`.trim();
  nutritionStatusEl.style.display = 'block';
}

function showTransientNutritionStatus(message, type = 'info', duration = 6000) {
  if (!nutritionStatusEl) return;
  if (nutritionTransientTimer) {
    clearTimeout(nutritionTransientTimer);
    nutritionTransientTimer = null;
  }
  setNutritionStatus(message, type);
  nutritionTransientTimer = setTimeout(() => {
    nutritionTransientTimer = null;
    updateNutritionStatusBanner();
  }, duration);
}

function openNextPendingConfirm() {
  if (activeConfirmItem) return;
  while (pendingConfirmQueue.length) {
    const nextEntry = pendingConfirmQueue.shift();
    if (!nextEntry || !nextEntry.itemName) continue;
    activeConfirmItem = { ...nextEntry };
    publishActivePendingMatch(activeConfirmItem);
    openOrFocusWindow('nutritionConfirm.html', 520, 600);
    return;
  }
  activeConfirmItem = null;
  publishActivePendingMatch(null);
}

function queueNutritionConfirmEntry(entry, { prioritize = false } = {}) {
  if (!entry) return;
  const itemName = entry.itemName || '';
  const normalizedName = entry.normalizedName || canonicalName(itemName);
  if (!itemName || !normalizedName) return;

  const normalizedEntry = { ...entry, itemName, normalizedName };

  if (activeConfirmItem && activeConfirmItem.normalizedName === normalizedName) {
    activeConfirmItem = { ...normalizedEntry };
    publishActivePendingMatch(activeConfirmItem);
    openOrFocusWindow('nutritionConfirm.html', 520, 600);
    return;
  }

  const existingIndex = pendingConfirmQueue.findIndex(
    queued => queued && queued.normalizedName === normalizedName
  );
  if (existingIndex !== -1) {
    pendingConfirmQueue[existingIndex] = { ...normalizedEntry };
    if (prioritize && existingIndex !== 0) {
      const [existing] = pendingConfirmQueue.splice(existingIndex, 1);
      pendingConfirmQueue.unshift(existing);
    }
  } else if (prioritize) {
    pendingConfirmQueue.unshift({ ...normalizedEntry });
  } else {
    pendingConfirmQueue.push({ ...normalizedEntry });
  }

  openNextPendingConfirm();
}

async function beginNutritionEdit(item) {
  if (!item || !item.name) return;

  try {
    const pending = await getPendingMatch(item.name);
    if (pending) {
      queueNutritionConfirmEntry(pending, { prioritize: true });
      return;
    }
  } catch (err) {
    console.error('Unable to load pending match for edit', err);
  }

  const unitDefault = item.home_unit || item.unit_default || item.unit || 'g';

  let foods;
  try {
    foods = await searchFdcFoods(item.name, { pageSize: 25 });
  } catch (error) {
    if (error instanceof MissingFdcApiKeyError || error?.code === 'MISSING_FDC_API_KEY') {
      if (!missingApiKeyWarningShown) {
        missingApiKeyWarningShown = true;
      }
      setNutritionStatus('Set your FDC website API key to enable nutrition syncing.', 'warning');
    } else {
      const message = error?.message ? ` ${error.message}` : '';
      showTransientNutritionStatus(`USDA search failed for ${item.name}.${message}`, 'error');
    }
    return;
  }

  const ranked = rankCandidates(item.name, foods);
  if (!ranked.length) {
    showTransientNutritionStatus(`No USDA FDC matches found for ${item.name}.`, 'warning');
    return;
  }

  const candidates = ranked.map(candidate => {
    const { _original, ...rest } = candidate;
    return rest;
  });

  try {
    await setPendingMatch(item.name, {
      candidates,
      unitDefault,
      source: 'manual-edit',
      lastSearchQuery: item.name
    });
    const pendingEntry = await getPendingMatch(item.name);
    if (pendingEntry) {
      queueNutritionConfirmEntry(pendingEntry, { prioritize: true });
    }
    await updateNutritionButtons();
  } catch (err) {
    console.error('Unable to stage nutrition edit', err);
    const message = err?.message ? ` ${err.message}` : '';
    showTransientNutritionStatus(`Unable to prepare nutrition edit for ${item.name}.${message}`, 'error');
  }
}

async function queueNutritionConfirmForItem(name, options = {}) {
  if (!name) return;
  try {
    const pending = await getPendingMatch(name);
    if (pending) {
      queueNutritionConfirmEntry(pending, options);
    } else {
      openOrFocusWindow('nutritionConfirm.html', 520, 600);
    }
  } catch (err) {
    console.error('Unable to open nutrition confirmation window', err);
    openOrFocusWindow('nutritionConfirm.html', 520, 600);
  }
}

async function updateNutritionStatusBanner() {
  if (nutritionTransientTimer) return;
  const [apiKey, pending] = await Promise.all([getFdcApiKey(), getPendingMatches()]);
  const messages = [];
  if (!apiKey) {
    messages.push('Add your FDC website API key to enable nutrition sync.');
  }
  const pendingCount = Object.keys(pending || {}).length;
  if (pendingCount) {
    messages.push(`${pendingCount} item${pendingCount === 1 ? '' : 's'} need nutrition match confirmation.`);
  }
  if (messages.length) {
    const type = !apiKey ? 'warning' : 'info';
    setNutritionStatus(messages.join(' '), type);
  } else {
    setNutritionStatus('');
  }
}

async function updateNutritionButtons() {
  const [pending, ingredientMap] = await Promise.all([
    getPendingMatches(),
    getIngredientMap()
  ]);
  const pendingKeys = new Set(Object.keys(pending));
  for (const [name, buttons] of nutritionButtons.entries()) {
    const button = buttons?.sync;
    if (!button) continue;
    const normalized = canonicalName(name);
    const record = ingredientMap[normalized];
    const hasData = record && record.perGramVector && Object.keys(record.perGramVector).length;
    const stale = record ? isIngredientRecordStale(record) : false;
    const nutritionExempt = isIngredientNutritionExempt(record);
    if (buttons?.info) {
      buttons.info.title = nutritionExempt
        ? 'Nutrition data not required for this item'
        : hasData
          ? 'View stored nutrition information'
          : 'No nutrition data stored yet';
    }
    if (nutritionExempt) {
      button.textContent = 'Nutrition Not Needed';
      button.classList.remove('pending');
      button.classList.remove('sync-needed');
      button.dataset.state = 'exempt';
    } else if (pendingKeys.has(normalized)) {
      button.textContent = 'Review Match';
      button.classList.add('pending');
      button.classList.remove('sync-needed');
      button.dataset.state = 'pending';
    } else if (hasData) {
      button.textContent = 'Edit Nutrition';
      button.classList.remove('pending');
      if (stale) {
        button.classList.add('sync-needed');
        button.dataset.state = 'stale';
      } else {
        button.classList.remove('sync-needed');
        button.dataset.state = 'editable';
      }
    } else {
      button.textContent = 'Sync Nutrition';
      button.classList.add('sync-needed');
      button.classList.remove('pending');
      button.dataset.state = 'missing';
    }
  }
}

function enqueueNutritionItem(name, { force = false, matchOptions } = {}) {
  if (!name) return;
  if (!force && queuedNutritionNames.has(name)) return;
  if (force) {
    queuedNutritionNames.delete(name);
  }
  queuedNutritionNames.add(name);
  const normalizedOptions =
    matchOptions && typeof matchOptions === 'object'
      ? { ...matchOptions }
      : {};
  nutritionQueue.push({ name, matchOptions: normalizedOptions });
}

async function processNutritionQueue() {
  if (!nutritionQueue.length) {
    processingNutrition = false;
    return;
  }
  processingNutrition = true;
  const entry = nutritionQueue.shift();
  if (!entry || !entry.name) {
    setTimeout(processNutritionQueue, nutritionDelayMs);
    return;
  }
  const { name, matchOptions = {} } = entry;
  queuedNutritionNames.delete(name);
  const item = globalItems.find(it => it.name === name);
  if (!item) {
    nutritionRetryCounts.delete(name);
    setTimeout(processNutritionQueue, nutritionDelayMs);
    return;
  }

  let success = true;
  let shouldRetry = false;
  let errorMessage = '';

  try {
    const result = await ensureIngredientRecordForItem(item, matchOptions);
    if (result.status === 'needs-confirmation') {
      if (result.reason === 'missing-fdc-record') {
        showTransientNutritionStatus(
          `The USDA record previously matched to ${item.name} is no longer available. Please select a new match or mark it as nutrition-exempt.`,
          'warning'
        );
      }
      let pendingEntry = await getPendingMatch(item.name);
      const pendingPayload = {
        ...(pendingEntry || {}),
        candidates: result.candidates,
        unitDefault: item.home_unit || item.unit_default || 'g',
        source: pendingEntry?.source || 'timeline',
        reason: result.reason || pendingEntry?.reason || null,
        missingFdcId: result.missingFdcId || pendingEntry?.missingFdcId || null
      };
      await setPendingMatch(item.name, pendingPayload);
      pendingEntry = await getPendingMatch(item.name);
      if (pendingEntry) {
        queueNutritionConfirmEntry(pendingEntry, { prioritize: true });
      }
    } else if (result.status === 'missing-api-key') {
      if (!missingApiKeyWarningShown) {
        missingApiKeyWarningShown = true;
        setNutritionStatus('Set your FDC website API key to enable nutrition syncing.', 'warning');
      }
      nutritionQueue.length = 0;
      queuedNutritionNames.clear();
      nutritionRetryCounts.clear();
      nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
      processingNutrition = false;
      return;
    } else if (result.status === 'no-results') {
      showTransientNutritionStatus(`No USDA FDC matches found for ${item.name}.`, 'warning');
    } else if (result.status === 'nutrition-exempt') {
      showTransientNutritionStatus(
        `${item.name} marked as not requiring nutrition data.`,
        'info'
      );
    } else if (result.status === 'error') {
      success = false;
      errorMessage = result.error?.message || 'Unknown error';
    }
  } catch (err) {
    success = false;
    errorMessage = err?.message || 'Unknown error';
    console.error('Failed to sync nutrition for', name, err);
  }

  if (!success) {
    const retries = (nutritionRetryCounts.get(name) || 0) + 1;
    if (retries <= NUTRITION_RETRY_LIMIT) {
      nutritionRetryCounts.set(name, retries);
      shouldRetry = true;
    } else {
      nutritionRetryCounts.delete(name);
    }
    if (errorMessage) {
      const normalizedError = String(errorMessage || 'Unknown error');
      const trimmedError =
        normalizedError.length > 140 ? `${normalizedError.slice(0, 137)}…` : normalizedError;
      showTransientNutritionStatus(
        `Nutrition sync failed for ${item.name}. ${trimmedError}`,
        'error'
      );
    }
  } else {
    nutritionRetryCounts.delete(name);
  }

  if (shouldRetry) {
    enqueueNutritionItem(name, { force: true, matchOptions });
  }

  updateNutritionButtons();
  updateNutritionStatusBanner();

  nutritionDelayMs = success
    ? NUTRITION_MIN_DELAY_MS
    : Math.min(NUTRITION_MAX_DELAY_MS, Math.floor(nutritionDelayMs * 1.5));

  setTimeout(processNutritionQueue, nutritionDelayMs);
}

async function scheduleNutritionBackfill(items = []) {
  try {
    const [ingredientMap, pendingMatches] = await Promise.all([
      getIngredientMap(),
      getPendingMatches()
    ]);
    const pendingKeys = new Set(Object.keys(pendingMatches || {}));
    items.forEach(item => {
      if (!item || !item.name) return;
      const normalized = canonicalName(item.name);
      if (!normalized) return;
      if (pendingKeys.has(normalized)) return;
      const record = ingredientMap[normalized];
      const hasVector = record && record.perGramVector && Object.keys(record.perGramVector).length;
      const stale = record ? isIngredientRecordStale(record) : true;
      if (isIngredientNutritionExempt(record)) return;
      if (!hasVector || stale) {
        enqueueNutritionItem(item.name);
      }
    });
  } catch (error) {
    console.error('Unable to schedule nutrition backfill', error);
  }
  if (!processingNutrition) {
    processNutritionQueue();
  }
}

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
  updateNutritionStatusBanner();
  scheduleNutritionBackfill(globalItems);
  updateNutritionButtons();
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
  nutritionButtons.clear();
  const startWeek = currentOnly ? getCurrentWeek() : 1;
  gridContainer.appendChild(buildGrid(items, headerState, startWeek));
  updateNutritionButtons();
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
  nutritionStatusEl = document.getElementById('nutrition-status');
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
      const map = changes.purchases.newValue || {};
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
    Object.keys(changes).forEach(k => {
      if (k.startsWith('final_product_')) {
        const name = decodeURIComponent(k.slice('final_product_'.length));
        const item = globalItems.find(i => i.name === name);
        if (item) {
          item.finalProduct = changes[k].newValue || null;
          updated = true;
        }
      }
    });
    if (changes.ingredientRecords) {
      updateNutritionButtons();
      updateNutritionStatusBanner();
      scheduleNutritionBackfill(globalItems);
    }
    if (changes.pendingIngredientMatches) {
      updateNutritionButtons();
      updateNutritionStatusBanner();
      const newMap = changes.pendingIngredientMatches.newValue || {};
      const oldMap = changes.pendingIngredientMatches.oldValue || {};
      const oldKeys = new Set(Object.keys(oldMap || {}));
      const newKeys = new Set(Object.keys(newMap || {}));

      for (let i = pendingConfirmQueue.length - 1; i >= 0; i--) {
        const queued = pendingConfirmQueue[i];
        if (!queued || !newKeys.has(queued.normalizedName)) {
          pendingConfirmQueue.splice(i, 1);
        } else {
          pendingConfirmQueue[i] = { ...newMap[queued.normalizedName] };
        }
      }

      if (activeConfirmItem) {
        if (!newKeys.has(activeConfirmItem.normalizedName)) {
          activeConfirmItem = null;
        } else {
          activeConfirmItem = { ...newMap[activeConfirmItem.normalizedName] };
        }
      }

      Object.values(newMap).forEach(entry => {
        if (!entry || !entry.normalizedName || !entry.itemName) return;
        if (!oldKeys.has(entry.normalizedName)) {
          queueNutritionConfirmEntry(entry);
        }
      });

      if (!activeConfirmItem) {
        openNextPendingConfirm();
      } else {
        publishActivePendingMatch(activeConfirmItem);
      }
      if (!activeConfirmItem && !pendingConfirmQueue.length) {
        publishActivePendingMatch(null);
      }
    }
    if (changes.fdcApiKey) {
      missingApiKeyWarningShown = false;
      updateNutritionStatusBanner();
      scheduleNutritionBackfill(globalItems);
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
        const item = globalItems.find(i => i.name === msg.item);
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
  const mergeItemsBtn = document.getElementById('mergeItems');
  if (mergeItemsBtn) {
    mergeItemsBtn.addEventListener('click', () => {
      openOrFocusWindow('mergeItems.html');
    });
  }
  document.getElementById('editExpirations').addEventListener('click', () => {
    openOrFocusWindow('expiration.html');
  });
  document.getElementById('editSeasons').addEventListener('click', () => {
    openOrFocusWindow('editSeason.html');
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
  const apiKeysBtn = document.getElementById('apiKeysBtn');
  if (apiKeysBtn) {
    apiKeysBtn.addEventListener('click', () => {
      openOrFocusWindow('apiKeys.html', 380, 240);
    });
  }

  const redoNutritionBtn = document.getElementById('redoNutrition');
  if (redoNutritionBtn) {
    redoNutritionBtn.addEventListener('click', async () => {
      if (!globalItems.length) return;
      const shouldRedo = confirm(
        'Redo USDA nutrition pairing for every item? This may take a few minutes.'
      );
      if (!shouldRedo) return;

      let ingredientMap = {};
      try {
        ingredientMap = await getIngredientMap();
      } catch (err) {
        console.error('Unable to load ingredient records before redo', err);
      }
      let scheduled = 0;
      globalItems.forEach(item => {
        if (!item?.name) return;
        const normalized = canonicalName(item.name);
        if (normalized) {
          const record = ingredientMap?.[normalized];
          if (isIngredientNutritionExempt(record)) {
            return;
          }
        }
        enqueueNutritionItem(item.name, {
          force: true,
          matchOptions: { force: true }
        });
        scheduled += 1;
      });

      if (!scheduled) {
        showTransientNutritionStatus('No items available for nutrition reprocessing.', 'info');
        return;
      }

      nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
      const message = `Redoing nutrition pairing for ${scheduled} item${scheduled === 1 ? '' : 's'}.`;
      setNutritionStatus(message, 'info');
      showTransientNutritionStatus('Full nutrition re-sync has started in the background.', 'info');

      if (!processingNutrition) {
        processNutritionQueue();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
