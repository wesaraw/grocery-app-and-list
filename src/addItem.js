import { loadJSON } from './utils/dataLoader.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  getItemId,
  convertArrayToIds,
  convertObjectKeysToIds,
  loadArray as loadItemArray,
  convertArrayToNames
} from './utils/itemStorage.js';
import { titleCaseName } from './utils/nameUtils.js';

import { ensureIngredientRecordForItem } from './utils/fdcClient.js';
import { getPendingMatch, setPendingMatch, setActivePendingMatchEntry } from './utils/nutritionMatching.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const DEFAULTS = {
  yearly: 0,
  unit: 'oz',
  monthly: 0,
  shelf: 26 // weeks
};

const commitButton = document.getElementById('commit');
const nutritionStatusEl = document.getElementById('nutritionStatus');
const apiKeyHintEl = document.getElementById('apiKeyHint');
const openApiKeyButton = document.getElementById('openApiKey');

let commitInProgress = false;
let itemPersisted = false;

if (openApiKeyButton) {
  openApiKeyButton.addEventListener('click', () => {
    openOrFocusWindow('apiKeys.html', 420, 240);
  });
}

function clearNutritionStatus() {
  if (!nutritionStatusEl) return;
  nutritionStatusEl.textContent = '';
  nutritionStatusEl.className = 'nutrition-status';
  nutritionStatusEl.style.display = 'none';
}

function updateNutritionStatus(type, message) {
  if (!nutritionStatusEl) return;
  const allowed = new Set(['loading', 'success', 'error', 'info', 'warning']);
  const statusType = allowed.has(type) ? type : 'info';
  nutritionStatusEl.textContent = message;
  nutritionStatusEl.className = `nutrition-status ${statusType}`;
  nutritionStatusEl.style.display = 'block';
}

function hideApiKeyHint() {
  if (apiKeyHintEl) {
    apiKeyHintEl.style.display = 'none';
  }
}

function showApiKeyHint() {
  if (apiKeyHintEl) {
    apiKeyHintEl.style.display = 'block';
  }
}

function scheduleClose(delayMs = 400) {
  window.setTimeout(() => window.close(), delayMs);
}

function monthsFromWeeks(weeks) {
  return weeks / WEEKS_PER_MONTH;
}

function addSeasonRow(start = '', end = '') {
  const row = document.createElement('div');
  row.className = 'season-row';
  const s = document.createElement('input');
  s.type = 'number';
  s.min = '1';
  s.max = '12';
  s.className = 'season-start';
  if (start) s.value = start;
  const e = document.createElement('input');
  e.type = 'number';
  e.min = '1';
  e.max = '12';
  e.className = 'season-end';
  if (end) e.value = end;
  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Remove';
  del.addEventListener('click', () => row.remove());
  row.appendChild(s);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(e);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(del);
  document.getElementById('seasonContainer').appendChild(row);
}

const DENSITY_KEY = "densityRatios";

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('yearly').placeholder = DEFAULTS.yearly;
  document.getElementById('unit').placeholder = DEFAULTS.unit;
  document.getElementById('monthly').placeholder = DEFAULTS.monthly;
  document.getElementById('shelf').placeholder = DEFAULTS.shelf;
  document.getElementById('week').placeholder = getCurrentWeek();

  const params = new URLSearchParams(location.search);
  const name = params.get('name');
  if (name) {
    document.getElementById('name').value = name;
    const nameEl = document.getElementById('name');
    nameEl.focus();
  }

  addSeasonRow();
  document
    .getElementById('addSeasonBtn')
    .addEventListener('click', () => addSeasonRow());
});

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArray('currentStock', STOCK_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);

function loadConsumed() {
  return new Promise(async resolve => {
    chrome.storage.local.get('consumedThisYear', async data => {
      if (data.consumedThisYear) {
        resolve(data.consumedThisYear);
      } else {
        const needs = await loadNeeds();
        resolve(needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit })));
      }
    });
  });
}

function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function highlightError(el) {
  el.classList.add('error');
  setTimeout(() => el.classList.remove('error'), 1000);
}

async function commit() {
  if (commitInProgress) return;
  if (itemPersisted) {
    if (apiKeyHintEl && apiKeyHintEl.style.display === 'block') {
      openOrFocusWindow('apiKeys.html', 420, 240);
    }
    return;
  }

  const nameEl = document.getElementById('name');
  const stockEl = document.getElementById('stock');
  const categoryEl = document.getElementById('category');

  const formattedName = titleCaseName(nameEl.value);
  nameEl.value = formattedName;
  const name = formattedName;
  const stockVal = stockEl.value.trim();
  const category = categoryEl.value.trim();

  let hasError = false;
  if (!name) {
    highlightError(nameEl);
    hasError = true;
  }
  if (!stockVal) {
    highlightError(stockEl);
    hasError = true;
  }
  if (!category) {
    highlightError(categoryEl);
    hasError = true;
  }
  if (hasError) {
    document.getElementById('warning').style.display = 'block';
    return;
  }
  document.getElementById('warning').style.display = 'none';
  clearNutritionStatus();
  hideApiKeyHint();
  commitInProgress = true;
  if (commitButton) {
    commitButton.disabled = true;
  }
  updateNutritionStatus('loading', 'Saving item and syncing nutrition data…');

  const yearly = parseFloat(document.getElementById('yearly').value) || DEFAULTS.yearly;
  const unit = document.getElementById('unit').value.trim() || DEFAULTS.unit;
  const whole = document.getElementById('whole').checked;
  const ratioText = document.getElementById('ratio').value.trim() || '1:1';
  const monthly = parseFloat(document.getElementById('monthly').value) || DEFAULTS.monthly;
  const shelfWeeks = parseFloat(document.getElementById('shelf').value) || DEFAULTS.shelf;
  const shelf = monthsFromWeeks(shelfWeeks);
  const stockAmt = parseFloat(stockVal);
  const week = parseInt(document.getElementById('week').value, 10) || getCurrentWeek();

  function parseRatio(text) {
    const m1 = text.match(/^([0-9.]+)\s*:\s*1$/);
    if (m1) return parseFloat(m1[1]);
    const m2 = text.match(/^1\s*:\s*([0-9.]+)$/);
    if (m2) return 1 / parseFloat(m2[1]);
    return 1;
  }
  const densityRatio = parseRatio(ratioText);

  const [
    needsRaw,
    consumptionRaw,
    stockRaw,
    expirationRaw,
    consumedRaw,
    purchasesRaw,
    densityMapRaw,
    itemSeasonsRaw
  ] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadPurchases(),
    loadDensityMap(),
    loadItemSeasons()
  ]);

  const [
    needs,
    consumption,
    stock,
    expiration,
    consumed
  ] = await Promise.all([
    convertArrayToIds(needsRaw),
    convertArrayToIds(consumptionRaw),
    convertArrayToIds(stockRaw),
    convertArrayToIds(expirationRaw),
    convertArrayToIds(consumedRaw)
  ]);

  const purchases = await convertObjectKeysToIds(purchasesRaw);
  const densityMap = await convertObjectKeysToIds(densityMapRaw);
  const itemSeasons = await convertObjectKeysToIds(itemSeasonsRaw);

  const id = await getItemId(name);

  needs.push({
    id,
    total_needed_year: yearly,
    home_unit: unit,
    treat_as_whole_unit: whole,
    category
  });
  consumption.push({ id, monthly_consumption: monthly, unit });
  // keep item in currentStock list without treating the initial quantity
  // as starting stock (which would create a week 1 purchase)
  stock.push({ id, amount: 0, unit });
  expiration.push({ id, shelf_life_months: shelf });
  consumed.push({ id, amount: 0, unit });

  densityMap[id] = { convert: false, ratio: densityRatio };

  if (!purchases[id]) purchases[id] = [];
  purchases[id].push({
    purchase_week: week,
    quantity_purchased: stockAmt,
    date_added: new Date().toISOString()
  });

  const seasonRows = Array.from(document.querySelectorAll('.season-row'));
  const seasons = seasonRows
    .map(r => {
      const start = parseInt(r.querySelector('.season-start').value, 10);
      const end = parseInt(r.querySelector('.season-end').value, 10);
      if (!isNaN(start) && !isNaN(end)) return { start, end };
      return null;
    })
    .filter(Boolean);
  itemSeasons[id] = seasons;

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    savePurchases(purchases),
    saveDensityMap(densityMap),
    saveItemSeasons(itemSeasons)
  ]);

  itemPersisted = true;

  try {
    const result = await ensureIngredientRecordForItem({
      name,
      home_unit: unit,
      category
    });
    if (result.status === 'needs-confirmation') {
      updateNutritionStatus('info', 'Confirm the nutrition match in the new window.');
      await setPendingMatch(name, {
        candidates: result.candidates,
        unitDefault: unit || 'g',
        source: 'add-item'
      });
      const pendingEntry = await getPendingMatch(name);
      if (pendingEntry) {
        await setActivePendingMatchEntry(pendingEntry);
      }
      openOrFocusWindow('nutritionConfirm.html', 520, 600);
      scheduleClose(600);
    } else if (result.status === 'missing-api-key') {
      updateNutritionStatus(
        'warning',
        'Item saved. Add your FDC website API key to finish syncing nutrition data.'
      );
      showApiKeyHint();
      commitInProgress = false;
      return;
    } else if (result.status === 'no-results') {
      updateNutritionStatus('info', 'Item saved, but no nutrition matches were found.');
      scheduleClose(1200);
    } else if (result.status === 'nutrition-exempt') {
      updateNutritionStatus('success', 'Item saved. Nutrition data is not required.');
      scheduleClose(800);
    } else if (result.status === 'matched' || result.status === 'updated' || result.status === 'exists') {
      updateNutritionStatus('success', 'Nutrition data synced successfully.');
      scheduleClose(600);
    } else if (result.status === 'error') {
      updateNutritionStatus('error', 'Item saved, but syncing nutrition data failed.');
      commitInProgress = false;
      return;
    } else {
      updateNutritionStatus('info', 'Item saved. Nutrition data will sync shortly.');
      scheduleClose(800);
    }
  } catch (err) {
    console.error('Unable to sync nutrition data for new item', err);
    updateNutritionStatus('error', 'Item saved, but syncing nutrition data failed.');
    commitInProgress = false;
    return;
  }

  commitInProgress = false;
}

if (commitButton) {
  commitButton.addEventListener('click', commit);
}
