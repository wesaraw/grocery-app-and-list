import { loadJSON } from './utils/dataLoader.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

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

async function removeItem(name) {
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

  const filter = arr => arr.filter(i => i.name !== name);
  const newNeeds = filter(needs);
  const newConsumption = filter(consumption);
  const newStock = filter(stock);
  const newExpiration = filter(expiration);
  const newConsumed = filter(consumed);
  const newSelections = selections.filter(s => s.name !== name);
  delete purchases[name];
  delete overrides[name];
  delete history[name];

  await Promise.all([
    save('yearlyNeeds', newNeeds),
    save('monthlyConsumption', newConsumption),
    save('currentStock', newStock),
    save('expirationData', newExpiration),
    save('consumedThisYear', newConsumed),
    save(STORE_SELECTION_KEY, newSelections),
    savePurchases(purchases),
    saveOverrides(overrides),
    saveHistory(history)
  ]);

  chrome.storage.local.remove([
    `final_${encodeURIComponent(name)}`,
    `final_product_${encodeURIComponent(name)}`
  ]);
}

function createListItem(name) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = name;
  li.appendChild(btn);

  btn.addEventListener('click', () => {
    if (li.querySelector('.confirm')) return;
    const div = document.createElement('div');
    div.className = 'confirm';
    const del = document.createElement('button');
    del.textContent = 'Delete';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    div.appendChild(del);
    div.appendChild(cancel);
    li.appendChild(div);

    cancel.addEventListener('click', () => {
      li.removeChild(div);
    });
    del.addEventListener('click', async () => {
      await removeItem(name);
      li.remove();
    });
  });

  return li;
}

async function init() {
  const items = await loadNeeds();
  const ul = document.getElementById('items');
  items.forEach(it => {
    ul.appendChild(createListItem(it.name));
  });
}

document.addEventListener('DOMContentLoaded', init);
