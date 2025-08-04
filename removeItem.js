import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArrayWithFallback,
  saveArray,
  loadObjectWithFallback,
  saveObject
} from './utils/itemRegistry.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

let filterText = '';
const headerState = {};
let allItems = [];
let ul;

const loadNeeds = () =>
  loadArrayWithFallback('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () =>
  loadArrayWithFallback('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () =>
  loadArrayWithFallback('currentStock', STOCK_PATH);
const loadExpiration = () =>
  loadArrayWithFallback('expirationData', EXPIRATION_PATH);
const loadStoreSelections = () =>
  loadArrayWithFallback(STORE_SELECTION_KEY, STORE_SELECTION_PATH);

const loadConsumed = () =>
  loadArrayWithFallback('consumedThisYear');
const loadOverrides = () =>
  loadObjectWithFallback('consumptionOverrides');
const loadHistory = () => loadObjectWithFallback('consumedHistory');

const save = (key, value) => saveArray(key, value);
const saveOverrides = overrides => saveObject('consumptionOverrides', overrides);
const saveHistory = history => saveObject('consumedHistory', history);

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

  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}

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
  ul = document.getElementById('items');
  const items = await loadNeeds();
  allItems = sortItemsByCategory(items);

  function render() {
    ul.innerHTML = '';
    const arr = filterText
      ? allItems.filter(it => it.name.toLowerCase().includes(filterText))
      : allItems;
    renderItemsWithCategoryHeaders(arr, ul, it => createListItem(it.name), headerState);
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);
