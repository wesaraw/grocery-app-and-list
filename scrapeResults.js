import { loadJSON } from './utils/dataLoader.js';
import { initUomTable, convert } from './utils/uomConverter.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';

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
const loadMonthlyConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);

let needsData = [];
let consumptionMap = new Map();

function getPackCount(product) {
  let m = product?.name?.match(/(\d+)\s*(?:pack|ct|count)/i);
  if (!m && product?.size) {
    m = product.size.match(/pack\s*of\s*(\d+)/i);
    if (!m) {
      m = product.size.match(/(\d+)\s*(?:pack|ct|count)/i);
    }
  }
  if (!m && product?.unit) {
    m = product.unit.match(/pack\s*of\s*(\d+)/i);
    if (!m) {
      m = product.unit.match(/(\d+)\s*(?:pack|ct|count)/i);
    }
  }
  return m ? parseInt(m[1], 10) : 1;
}

function pricePerHomeUnit(itemName, product) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const pack = getPackCount(product);
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'each') {
    return product.priceNumber != null ? product.priceNumber / pack : null;
  }
  let pricePerOz = product.pricePerUnit;
  if (pricePerOz == null && product.priceNumber != null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * pack;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convert(product.sizeQty * pack, product.sizeUnit, 'oz');
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convert(1, item.home_unit, 'oz');
    if (!isNaN(ozPerUnit) && ozPerUnit > 0) {
      return pricePerOz * ozPerUnit;
    }
  }
  return null;
}

function monthlyCost(itemName, product) {
  const cons = consumptionMap.get(itemName);
  if (!cons) return null;
  const unitPrice = pricePerHomeUnit(itemName, product);
  if (unitPrice == null) return null;
  return unitPrice * (cons.monthly_consumption || 0);
}

function storageKey(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
}

function loadCoupons() {
  return new Promise(resolve => {
    chrome.storage.local.get('coupons', data => {
      resolve(data.coupons || {});
    });
  });
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

function applyCoupon(prod, coupons, week, store) {
  const coupon = (coupons || []).find(
    c =>
      week >= c.startWeek &&
      week <= c.endWeek &&
      (!c.store || c.store === 'ALL' || c.store === store)
  );
  if (!coupon || prod.priceNumber == null) return { ...prod };
  let price = prod.priceNumber;
  if (coupon.type === 'percent') {
    price = price * (1 - coupon.value / 100);
  } else if (coupon.type === 'fixedOff') {
    price = price - coupon.value;
  } else if (coupon.type === 'fixedPrice') {
    price = coupon.value;
  }
  if (price < 0) price = 0;
  const copy = { ...prod };
  copy.priceNumber = price;
  copy.price = `$${price.toFixed(2)}`;

  if (prod.priceNumber != null && prod.pricePerUnit != null) {
    // Preserve any prior unit price adjustments (pack size, home unit, etc.)
    // by scaling the original unit price by the price change ratio.
    copy.pricePerUnit =
      prod.pricePerUnit * (price / prod.priceNumber);
  } else if (copy.convertedQty != null) {
    copy.pricePerUnit = price / copy.convertedQty;
  } else if (copy.sizeQty != null && copy.sizeUnit) {
    const oz = convert(copy.sizeQty, copy.sizeUnit, 'oz');
    if (!isNaN(oz)) {
      copy.convertedQty = oz;
      copy.pricePerUnit = price / oz;
      copy.unit = 'oz';
    }
  }
  return copy;
}

function loadProducts(item, store) {
  return new Promise(resolve => {
    const key = storageKey('scraped', item, store);
    chrome.storage.local.get([key], data => resolve(data[key] || []));
  });
}

function saveSelected(item, store, product) {
  return new Promise(resolve => {
    const key = storageKey('selected', item, store);
    chrome.storage.local.set({ [key]: product }, () => resolve());
  });
}

function nameMatchesProduct(productName, itemName) {
  const itemWords = itemName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const prod = productName.toLowerCase();
  return itemWords.some(w => prod.includes(w));
}

const params = new URLSearchParams(location.search);
const item = params.get('item');
const store = params.get('store');

const title = document.getElementById('title');
const container = document.getElementById('products');

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

title.textContent = `${item} - ${store}`;

async function init() {
  await initUomTable();
  const [products, coupons, needs, consumption] = await Promise.all([
    loadProducts(item, store),
    loadCoupons(),
    loadNeeds(),
    loadMonthlyConsumption()
  ]);

  needsData = needs;
  consumptionMap = new Map(consumption.map(c => [c.name, c]));

  const week = getCurrentWeek();
  const adjusted = products.map(p => applyCoupon(p, coupons[item], week, store));
  const filtered = adjusted.filter(p => nameMatchesProduct(p.name, item));
  if (filtered.length === 0) {
    container.textContent = 'No products found.';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aPrice = a.pricePerUnit ?? Infinity;
    const bPrice = b.pricePerUnit ?? Infinity;
    return aPrice - bPrice;
  });

  sorted.forEach(prod => {
    const div = document.createElement('div');
    div.className = 'product';

    const img = document.createElement('img');
    img.src = prod.image || PLACEHOLDER_IMG;
    img.width = 200;
    img.height = 200;
    img.alt = prod.name;
    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };
    div.appendChild(img);

    let pStr = prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price;
    let qStr = prod.convertedQty != null ? `${prod.convertedQty.toFixed(2)} oz` : prod.size;
    let uStr = prod.pricePerUnit != null
      ? `$${prod.pricePerUnit.toFixed(2)}/${prod.unitType || 'oz'}`
      : prod.unit;
    const cost = monthlyCost(item, prod);
    const costStr = cost != null ? ` - $${cost.toFixed(2)}/mo` : '';
    const info = document.createElement('span');
    info.textContent = `${prod.name} - ${pStr} - ${qStr} - ${uStr}${costStr}`;
    div.appendChild(info);

    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', async () => {
      await saveSelected(item, store, prod);
      chrome.runtime.sendMessage(
        {
          type: 'selectedItem',
          item,
          store,
          product: prod
        },
        () => {
          // Close only after the message is sent
          window.close();
        }
      );
    });
    div.appendChild(document.createElement('br'));
    div.appendChild(btn);
    container.appendChild(div);
  });
}

init();
