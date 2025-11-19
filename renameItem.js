import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { canonicalName, titleCaseName } from './utils/nameUtils.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';

let filterText = '';
const headerState = {};
let allItems = [];
let container;
let renderList = () => {};

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
function loadMealsForType({ key, path }) {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      resolve(arr || []);
    });
  });
}

function loadConsumed() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumedThisYear', data => {
      resolve(data.consumedThisYear || []);
    });
  });
}

function loadOverrides() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumptionOverrides', data => {
      resolve(data.consumptionOverrides || {});
    });
  });
}

function loadHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumedHistory', data => {
      resolve(data.consumedHistory || {});
    });
  });
}


function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}


function saveOverrides(overrides) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumptionOverrides: overrides }, () => resolve());
  });
}

function saveHistory(history) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumedHistory: history }, () => resolve());
  });
}

function renameFinalKeys(oldName, newName) {
  return new Promise(resolve => {
    const oldFinal = `final_${encodeURIComponent(oldName)}`;
    const oldProd = `final_product_${encodeURIComponent(oldName)}`;
    chrome.storage.local.get([oldFinal, oldProd], data => {
      const setObj = {};
      if (data[oldFinal] !== undefined) {
        setObj[`final_${encodeURIComponent(newName)}`] = data[oldFinal];
      }
      if (data[oldProd] !== undefined) {
        setObj[`final_product_${encodeURIComponent(newName)}`] = data[oldProd];
      }
      chrome.storage.local.set(setObj, () => {
        chrome.storage.local.remove([oldFinal, oldProd], resolve);
      });
    });
  });
}

async function renameItem(oldName, newName) {
  await initializeMealCategories();

  const mealEntries = Object.entries(MEAL_TYPES);
  const mealLists = await Promise.all(
    mealEntries.map(([, info]) => loadMealsForType(info))
  );

  const [needs, consumption, stock, expiration, consumed, purchases, overrides, history, itemSeasons] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadPurchases(),
    loadOverrides(),
    loadHistory(),
    loadItemSeasons()
  ]);

  const mealsByType = {};
  mealEntries.forEach(([type], idx) => {
    mealsByType[type] = mealLists[idx];
  });

  const canonOld = canonicalName(oldName);

  const renameInArray = arr => {
    arr.forEach(it => {
      if (canonicalName(it.name) === canonOld) {
        it.name = newName;
      }
    });
  };

  [needs, consumption, stock, expiration, consumed].forEach(renameInArray);
  const renameKeys = obj => {
    Object.keys(obj).forEach(k => {
      if (canonicalName(k) === canonOld) {
        obj[newName] = obj[k];
        delete obj[k];
      }
    });
  };
  renameKeys(purchases);
  renameKeys(overrides);
  renameKeys(history);
  renameKeys(itemSeasons);

  // rename ingredient references across all meals
  Object.values(mealsByType).forEach(meals => {
    meals.forEach(meal => {
      (meal.ingredients || []).forEach(ing => {
        if (canonicalName(ing.name) === canonOld) {
          ing.name = newName;
        }
      });
    });
  });

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    savePurchases(purchases),
    saveOverrides(overrides),
    saveHistory(history),
    saveItemSeasons(itemSeasons),
    ...mealEntries.map(([type, info]) => save(info.key, mealsByType[type]))
  ]);

  await renameFinalKeys(oldName, newName);

  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}
}

function createRow(name) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = name;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'New name';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.display = 'none';

  input.addEventListener('input', () => {
    saveBtn.style.display = input.value.trim() ? '' : 'none';
  });

  async function commit() {
    const newName = input.value.trim();
    if (!newName || newName === name) return;
    if (allItems.some(it => it.name.toLowerCase() === newName.toLowerCase())) {
      input.value = '';
      saveBtn.style.display = 'none';
      return;
    }
    await renameItem(name, newName);
    await calculateAndSaveMealNeeds();
    span.textContent = newName;
    name = newName;
    input.value = '';
    saveBtn.style.display = 'none';
  }

  saveBtn.addEventListener('click', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });

  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(saveBtn);
  return div;
}

function buildRenameQueue() {
  const normalizedOwners = new Map();
  allItems.forEach(item => {
    const normalized = titleCaseName(item.name);
    const canon = canonicalName(item.name);
    if (!normalized || !canon) return;
    const key = normalized.toLowerCase();
    if (!normalizedOwners.has(key)) {
      normalizedOwners.set(key, canon);
    }
  });

  const buckets = new Map();
  allItems.forEach(item => {
    const normalized = titleCaseName(item.name);
    const canon = canonicalName(item.name);
    if (!normalized || !canon) return;
    if (normalized === item.name) return;

    const normalizedKey = normalized.toLowerCase();
    const owner = normalizedOwners.get(normalizedKey);
    if (owner && owner !== canon) {
      return;
    }

    if (!buckets.has(canon)) {
      buckets.set(canon, { oldName: item.name, newName: normalized });
    }
  });

  return Array.from(buckets.values());
}

async function refreshItems() {
  const needs = await loadNeeds();
  allItems = sortItemsByCategory(needs);
  renderList();
}

async function fixMealIngredientCasing() {
  await initializeMealCategories();
  const mealEntries = Object.entries(MEAL_TYPES);
  let updatedIngredients = 0;

  for (const [, info] of mealEntries) {
    const meals = await loadMealsForType(info);
    let changed = false;

    meals.forEach(meal => {
      (meal.ingredients || []).forEach(ing => {
        const normalized = titleCaseName(ing.name);
        if (!normalized || normalized === ing.name) return;
        ing.name = normalized;
        changed = true;
        updatedIngredients += 1;
      });
    });

    if (changed) {
      await save(info.key, meals);
    }
  }

  return updatedIngredients;
}

async function runBulkCasingFix(button) {
  if (!button || button.disabled) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Fixing casing...';

  try {
    const renameQueue = buildRenameQueue();
    let renamedCount = 0;

    for (let i = 0; i < renameQueue.length; i += 1) {
      const job = renameQueue[i];
      button.textContent = `Fixing casing (${i + 1}/${renameQueue.length})`;
      await renameItem(job.oldName, job.newName);
      renamedCount += 1;
    }

    button.textContent = 'Updating meals...';
    const ingredientUpdates = await fixMealIngredientCasing();

    button.textContent = 'Recalculating needs...';
    await calculateAndSaveMealNeeds();

    await refreshItems();

    alert(`Fixed casing for ${renamedCount} item groups and ${ingredientUpdates} meal ingredients.`);
  } catch (err) {
    console.error('Failed to fix casing', err);
    alert('Failed to fix casing. Check the console for details.');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function init() {
  container = document.getElementById('items');
  const needs = await loadNeeds();
  allItems = sortItemsByCategory(needs);

  renderList = function render() {
    container.innerHTML = '';
    const arr = filterText
      ? allItems.filter(it => it.name.toLowerCase().includes(filterText))
      : allItems;
    renderItemsWithCategoryHeaders(arr, container, it => createRow(it.name), headerState);
  };

  renderList();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    renderList();
  });

  const fixButton = document.getElementById('fixCasingButton');
  if (fixButton) {
    fixButton.addEventListener('click', () => runBulkCasingFix(fixButton));
  }
}

document.addEventListener('DOMContentLoaded', init);
