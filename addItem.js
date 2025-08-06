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
  saveArray,
  saveObject
} from './utils/itemRegistry.js';
import { setSearchResult } from './utils/searchResults.js';

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
const STORE_LINKS = {
  'Stop & Shop': name =>
    `https://stopandshop.com/product-search/${name
      .replace(/ /g, '%20')}?searchRef=&semanticSearch=false`,
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
  return fromJson;
}

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArray('currentStock', STOCK_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);


async function loadConsumed() {
  const arr = await loadItemArray('consumedThisYear');
  if (arr.length > 0) return arr;
  const needs = await loadNeeds();
  return needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit }));
}

function highlightError(el) {
  el.classList.add('error');
  setTimeout(() => el.classList.remove('error'), 1000);
}

async function commit() {
  const nameEl = document.getElementById('name');
  const stockEl = document.getElementById('stock');
  const categoryEl = document.getElementById('category');

  const name = nameEl.value.trim();
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

  const [needs, consumption, stock, expiration, consumed] = await Promise.all([
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

  const defaultStores = {

    'Stop & Shop': {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Stop & Shop'](name),
      image: null
    },
    Walmart: {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Walmart'](name),
      image: null
    },
    Amazon: {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Amazon'](name),
      image: null
    },
    Shaws: {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Shaws'](name),
      image: null
    },
    'Roche Bros': {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Roche Bros'](name),
      image: null
    },
    Hannaford: {
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Hannaford'](name),
      image: null
    }
  };

  for (const [store, data] of Object.entries(defaultStores)) {
    await setSearchResult(id, store, data);
  }


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
    saveArray('yearlyNeeds', needs),
    saveArray('monthlyConsumption', consumption),
    saveArray('currentStock', stock),
    saveArray('expirationData', expiration),
    saveArray('consumedThisYear', consumed),
    savePurchases(purchases),
    saveDensityMap(densityMap),
    saveItemSeasons(itemSeasons)
  ]);

  window.close();
}

document.getElementById('commit').addEventListener('click', commit);
