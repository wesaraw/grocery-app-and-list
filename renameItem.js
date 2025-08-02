import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { canonicalName } from './utils/nameUtils.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

const STORE_LINKS = {
  'Stop & Shop': name =>
    `https://stopandshop.com/product-search/${name.replace(/ /g, '%20')}?searchRef=&semanticSearch=false`,
  Walmart: name =>
    `https://www.walmart.com/search?q=${encodeURIComponent(
      name.replace(/ /g, '+')
    )}&facet=fulfillment_method_in_store%3AIn-store%7C%7Cexclude_oos%3AShow+available+items+only`,
  Amazon: name =>
    `https://www.amazon.com/s?k=${name
      .split(/\s+/)
      .map(encodeURIComponent)
      .join('+')}`,
  Shaws: name =>
    `https://www.shaws.com/shop/search-results.html?q=${name.replace(/ /g, '%20')}`,
  'Roche Bros': name =>
    `https://onlineshopping.rochebros.com/search?searchTerms=${name.replace(/ /g, '%20')}`,
  Hannaford: name =>
    `https://www.hannaford.com/search/product?form_state=searchForm&keyword=${name.replace(/ /g, '+')}&ieDummyTextField=&productTypeId=P`
};

let filterText = '';
const headerState = {};
let allItems = [];
let container;

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
const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArray('currentStock', STOCK_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);
const loadStoreSelections = () => loadArray(STORE_SELECTION_KEY, STORE_SELECTION_PATH);

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

function loadPurchases() {
  return new Promise(resolve => {
    chrome.storage.local.get('purchases', data => resolve(data.purchases || {}));
  });
}

function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function savePurchases(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases: map }, () => resolve());
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
    chrome.storage.local.get(['finalStore', 'selectedStore'], data => {
      const f = data.finalStore || {};
      const s = data.selectedStore || {};
      if (f[oldName] !== undefined) {
        f[newName] = f[oldName];
        delete f[oldName];
      }
      if (s[oldName] !== undefined) {
        s[newName] = s[oldName];
        delete s[oldName];
      }
      chrome.storage.local.set({ finalStore: f, selectedStore: s }, resolve);
    });
  });
}

async function renameItem(oldName, newName) {
  await initializeMealCategories();

  const mealEntries = Object.entries(MEAL_TYPES);
  const mealLists = await Promise.all(
    mealEntries.map(([, info]) => loadMealsForType(info))
  );

  const [needs, consumption, stock, expiration, consumed, selections, purchases, overrides, history, itemSeasons] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
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
  selections.forEach(s => {
    if (canonicalName(s.name) === canonOld) {
      s.name = newName;
      if (STORE_LINKS[s.store]) {
        s.link = STORE_LINKS[s.store](newName);
      }
    }
  });

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
    save(STORE_SELECTION_KEY, selections),
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

async function init() {
  container = document.getElementById('items');
  const needs = await loadNeeds();
  allItems = sortItemsByCategory(needs);

  function render() {
    container.innerHTML = '';
    const arr = filterText
      ? allItems.filter(it => it.name.toLowerCase().includes(filterText))
      : allItems;
    renderItemsWithCategoryHeaders(arr, container, it => createRow(it.name), headerState);
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);
