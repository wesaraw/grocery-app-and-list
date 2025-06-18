import { loadJSON } from './utils/dataLoader.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

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
    `https://shopping.rochebros.com/search?search_term=${name.replace(/ /g, '%20')}`,
  Hannaford: name =>
    `https://www.hannaford.com/search/product?form_state=searchForm&keyword=${name.replace(/ /g, '+')}&ieDummyTextField=&productTypeId=P`
};

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

function loadPurchases() {
  return new Promise(resolve => {
    chrome.storage.local.get('purchases', data => {
      resolve(data.purchases || {});
    });
  });
}

function savePurchases(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases: map }, () => resolve());
  });
}

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

async function commit() {
  const name = document.getElementById('name').value.trim();
  if (!name) return;
  const yearly = parseFloat(document.getElementById('yearly').value) || 0;
  const unit = document.getElementById('unit').value.trim() || 'each';
  const whole = document.getElementById('whole').checked;
  const monthly = parseFloat(document.getElementById('monthly').value) || 0;
  const shelf = parseFloat(document.getElementById('shelf').value) || 12;
  const stockAmt = parseFloat(document.getElementById('stock').value) || 0;
  const week = parseInt(document.getElementById('week').value, 10) || 1;
  const category = document.getElementById('category').value.trim();

  const [needs, consumption, stock, expiration, consumed, storeSelections, purchases] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
    loadPurchases()
  ]);

  needs.push({
    name,
    total_needed_year: yearly,
    home_unit: unit,
    treat_as_whole_unit: whole,
    category
  });
  consumption.push({ name, monthly_consumption: monthly, unit });
  stock.push({ name, amount: stockAmt, unit });
  expiration.push({ name, shelf_life_months: shelf });
  consumed.push({ name, amount: 0, unit });

  storeSelections.push(
    {
      name,
      store: 'Stop & Shop',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Stop & Shop'](name),
      image: null
    },
    {
      name,
      store: 'Walmart',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Walmart'](name),
      image: null
    },
    {
      name,
      store: 'Amazon',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Amazon'](name),
      image: null
    },
    {
      name,
      store: 'Shaws',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Shaws'](name),
      image: null
    },
    {
      name,
      store: 'Roche Bros',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Roche Bros'](name),
      image: null
    },
    {
      name,
      store: 'Hannaford',
      price: null,
      convertedQty: null,
      pricePerUnit: null,
      link: STORE_LINKS['Hannaford'](name),
      image: null
    }
  );

  if (!purchases[name]) purchases[name] = [];
  purchases[name].push({
    purchase_week: week,
    quantity_purchased: stockAmt,
    date_added: new Date().toISOString()
  });

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock),
    save('expirationData', expiration),
    save('consumedThisYear', consumed),
    save(STORE_SELECTION_KEY, storeSelections),
    savePurchases(purchases)
  ]);

  window.close();
}

document.getElementById('commit').addEventListener('click', commit);
