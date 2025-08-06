import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { canonicalName } from './utils/nameUtils.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import {
  loadArrayWithFallback,
  saveArray,
  loadObjectWithFallback,
  saveObject,
  getItemId,
  loadObject
} from './utils/itemRegistry.js';
import { renameItemDetail } from './utils/itemDetails.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const SEARCH_RESULTS_KEY = 'searchResults';

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
const loadHistory = () => loadObjectWithFallback('consumedHistory');

const save = (key, value) => saveArray(key, value);
const saveOverrides = overrides =>
  saveObject('consumptionOverrides', overrides);
const saveHistory = history => saveObject('consumedHistory', history);

async function renameItem(oldName, newName) {
  const [needs, consumption, stock, expiration, consumed, searchResults, purchases, overrides, history] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadSearchResults(),
    loadPurchases(),
    loadOverrides(),
    loadHistory()
  ]);

  const canonOld = canonicalName(oldName);

  const renameInArray = arr => {
    arr.forEach(it => {
      if (canonicalName(it.name) === canonOld) {
        it.name = newName;
      }
    });
  };

  [needs, consumption, stock, expiration, consumed].forEach(renameInArray);
  Object.keys(searchResults).forEach(k => {
    if (canonicalName(k) === canonOld) {
      searchResults[newName] = searchResults[k];
      delete searchResults[k];
    }
  });
  if (searchResults[newName]) {
    for (const [store, data] of Object.entries(searchResults[newName])) {
      if (STORE_LINKS[store]) {
        data.link = STORE_LINKS[store](newName);
      }
    }
  }

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

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    saveObject(SEARCH_RESULTS_KEY, searchResults),
    savePurchases(purchases),
    saveOverrides(overrides),
    saveHistory(history)
  ]);

  const id = await getItemId(newName);
  await renameItemDetail(id, newName);

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
