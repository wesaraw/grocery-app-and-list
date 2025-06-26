import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

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
  const [needs, consumption, stock, expiration, consumed, selections, purchases, overrides, history] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
    loadPurchases(),
    loadOverrides(),
    loadHistory()
  ]);

  const renameInArray = arr => {
    const rec = arr.find(i => i.name === oldName);
    if (rec) rec.name = newName;
  };
  [needs, consumption, stock, expiration, consumed].forEach(renameInArray);
  selections.forEach(s => { if (s.name === oldName) s.name = newName; });

  if (purchases[oldName]) {
    purchases[newName] = purchases[oldName];
    delete purchases[oldName];
  }
  if (overrides[oldName]) {
    overrides[newName] = overrides[oldName];
    delete overrides[oldName];
  }
  if (history[oldName]) {
    history[newName] = history[oldName];
    delete history[oldName];
  }

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    save(STORE_SELECTION_KEY, selections),
    savePurchases(purchases),
    saveOverrides(overrides),
    saveHistory(history)
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
