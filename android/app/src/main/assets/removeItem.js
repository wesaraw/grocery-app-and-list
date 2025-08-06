import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArrayWithFallback,
  saveArray,
  loadObjectWithFallback,
  saveObject,
  getItemId,
  loadObject
} from './utils/itemRegistry.js';
import { deleteHistoryForItem } from './utils/historyStorage.js';
import { removeItemDetail } from './utils/itemDetails.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const SEARCH_RESULTS_KEY = 'searchResults';

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
const loadSearchResults = () => loadObject(SEARCH_RESULTS_KEY);

const loadConsumed = () => loadArrayWithFallback('consumedThisYear');
const loadOverrides = () =>
  loadObjectWithFallback('consumptionOverrides');

const save = (key, value) => saveArray(key, value);
const saveOverrides = overrides =>
  saveObject('consumptionOverrides', overrides);

async function removeItem(name) {
  const [needs, consumption, stock, expiration, consumed, searchResults, purchases, overrides] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadSearchResults(),
    loadPurchases(),
    loadOverrides()
  ]);

  const filter = arr => arr.filter(i => i.name !== name);
  const newNeeds = filter(needs);
  const newConsumption = filter(consumption);
  const newStock = filter(stock);
  const newExpiration = filter(expiration);
  const newConsumed = filter(consumed);
  const newResults = { ...searchResults };
  delete newResults[name];
  delete purchases[name];
  delete overrides[name];

  await Promise.all([
    save('yearlyNeeds', newNeeds),
    save('monthlyConsumption', newConsumption),
    save('currentStock', newStock),
    save('expirationData', newExpiration),
    save('consumedThisYear', newConsumed),
    saveObject(SEARCH_RESULTS_KEY, newResults),
    savePurchases(purchases),
    saveOverrides(overrides)
  ]);

  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}

  const id = await getItemId(name);
  await deleteHistoryForItem(id);
  await removeItemDetail(id);
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
