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

function bulkRenameFinalKeys(renameQueue) {
  return new Promise(resolve => {
    if (!renameQueue.length) {
      resolve();
      return;
    }

    const keysToFetch = [];
    renameQueue.forEach(({ oldName }) => {
      keysToFetch.push(`final_${encodeURIComponent(oldName)}`);
      keysToFetch.push(`final_product_${encodeURIComponent(oldName)}`);
    });

    chrome.storage.local.get(keysToFetch, data => {
      const setObj = {};
      const keysToRemove = new Set();

      renameQueue.forEach(({ oldName, newName }) => {
        const oldFinal = `final_${encodeURIComponent(oldName)}`;
        const oldProd = `final_product_${encodeURIComponent(oldName)}`;
        const newFinal = `final_${encodeURIComponent(newName)}`;
        const newProd = `final_product_${encodeURIComponent(newName)}`;

        if (data[oldFinal] !== undefined) {
          setObj[newFinal] = data[oldFinal];
          keysToRemove.add(oldFinal);
        }
        if (data[oldProd] !== undefined) {
          setObj[newProd] = data[oldProd];
          keysToRemove.add(oldProd);
        }
      });

      const doRemove = () => {
        if (keysToRemove.size === 0) {
          resolve();
          return;
        }
        chrome.storage.local.remove(Array.from(keysToRemove), resolve);
      };

      if (Object.keys(setObj).length === 0) {
        doRemove();
        return;
      }

      chrome.storage.local.set(setObj, doRemove);
    });
  });
}

async function bulkRenameItems(renameQueue, progressCallback = () => {}) {
  const jobs = renameQueue.filter(job => job && job.oldName && job.newName && job.oldName !== job.newName);
  if (!jobs.length) {
    return { renamedCount: 0 };
  }

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

  const renameByCanon = new Map();
  const normalizedOwners = new Map();

  jobs.forEach((job, index) => {
    const canonOld = canonicalName(job.oldName);
    const normalizedTarget = job.newName.toLowerCase();
    if (!canonOld || !normalizedTarget) {
      return;
    }

    const existingTargetOwner = normalizedOwners.get(normalizedTarget);
    if (existingTargetOwner && existingTargetOwner !== canonOld) {
      throw new Error(`Cannot rename "${job.oldName}" to "${job.newName}" because another canonical item already maps to that casing.`);
    }
    normalizedOwners.set(normalizedTarget, canonOld);

    const existing = renameByCanon.get(canonOld);
    if (existing && existing !== job.newName) {
      throw new Error(`Conflicting rename instructions for ${job.oldName}.`);
    }
    renameByCanon.set(canonOld, job.newName);

    progressCallback(index + 1, jobs.length);
  });

  if (!renameByCanon.size) {
    return { renamedCount: 0 };
  }

  const renameInArray = arr => {
    arr.forEach(it => {
      const replacement = renameByCanon.get(canonicalName(it.name));
      if (replacement) {
        it.name = replacement;
      }
    });
  };

  [needs, consumption, stock, expiration, consumed].forEach(renameInArray);

  const renameKeys = obj => {
    const updates = [];
    Object.keys(obj).forEach(k => {
      const replacement = renameByCanon.get(canonicalName(k));
      if (replacement && replacement !== k) {
        updates.push({ oldKey: k, newKey: replacement });
      }
    });
    updates.forEach(({ oldKey, newKey }) => {
      obj[newKey] = obj[oldKey];
      delete obj[oldKey];
    });
  };

  renameKeys(purchases);
  renameKeys(overrides);
  renameKeys(history);
  renameKeys(itemSeasons);

  Object.values(mealsByType).forEach(meals => {
    meals.forEach(meal => {
      (meal.ingredients || []).forEach(ing => {
        const replacement = renameByCanon.get(canonicalName(ing.name));
        if (replacement) {
          ing.name = replacement;
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

  await bulkRenameFinalKeys(jobs);

  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}

  return { renamedCount: renameByCanon.size };
}

async function renameItem(oldName, newName) {
  await bulkRenameItems([{ oldName, newName }]);
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
    if (!renameQueue.length) {
      alert('All items are already using the preferred casing.');
      return;
    }

    const normalizedTargets = new Map();
    let conflict = null;
    renameQueue.forEach(job => {
      const normalizedKey = job.newName.toLowerCase();
      const canon = canonicalName(job.oldName);
      if (!normalizedKey || !canon || conflict) return;
      const owner = normalizedTargets.get(normalizedKey);
      if (owner && owner !== canon) {
        conflict = job;
      }
      normalizedTargets.set(normalizedKey, canon);
    });

    if (conflict) {
      alert(`Cannot fix casing because another item already claims ${conflict.newName}.`);
      return;
    }

    let renamedCount = 0;
    button.textContent = `Fixing casing (0/${renameQueue.length})`;
    const result = await bulkRenameItems(renameQueue, (completed, total) => {
      button.textContent = `Fixing casing (${completed}/${total})`;
      renamedCount = completed;
    });
    if (result && result.renamedCount !== undefined) {
      renamedCount = result.renamedCount;
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
