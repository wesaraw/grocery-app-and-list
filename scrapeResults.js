import { loadJSON } from './utils/dataLoader.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { parseUnitPrice, getPriceUnitInfo, sheetSqFtFor } from "./utils/priceUtils.js";
import { nameMatchesProduct } from './utils/nameUtils.js';

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

function loadStoredArray(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

const loadMealPlanMonth = () => loadStoredArray('mealPlanMonthly');

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadMonthlyConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);

let needsData = [];
let consumptionMap = new Map();
let weightPackMap = new Map();

function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  let m = product?.name?.match(/(\d+)\s*(?:pk|pack|ct|count|rolls?)/i);
  if (!m) {
    m = product?.name?.match(/(\d+)\s*[-x\u00d7]\s*\d+/i);
  }
  if (!m && product?.size) {
    m = product.size.match(/pack\s*of\s*(\d+)/i);
    if (!m) {
      m = product.size.match(/(\d+)\s*(?:pk|pack|ct|count|rolls?)/i);
      if (!m) {
        m = product.size.match(/(\d+)\s*[-x\u00d7]\s*\d+/i);
      }
    }
  }
  if (!m && product?.unit) {
    m = product.unit.match(/pack\s*of\s*(\d+)/i);
    if (!m) {
      m = product.unit.match(/(\d+)\s*(?:pk|pack|ct|count|rolls?)/i);
      if (!m) {
        m = product.unit.match(/(\d+)\s*[-x\u00d7]\s*\d+/i);
      }
    }
  }

  if (m) {
    const count = parseInt(m[1], 10);
    const source = product.name + ' ' + (product.size || '') + ' ' + (product.unit || '');
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(m[0]);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

function weightKey(product) {
  if (product.convertedQty != null) return product.convertedQty.toFixed(2);
  if (product.sizeQty != null && product.sizeUnit) {
    const oz = convert(product.sizeQty, product.sizeUnit, 'oz');
    if (!isNaN(oz)) return oz.toFixed(2);
  }
  return null;
}

function getPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product);
  if (key && weightPackMap.has(key)) {
    return weightPackMap.get(key);
  }
  return base;
}

function getPackCount(product) {
  return getPackInfo(product).count;
}


function extractSheetCount(itemName, product) {
  const sqft = sheetSqFtFor(itemName);
  const fields = [product?.name, product?.size, product?.unit];
  for (const f of fields) {
    if (!f) continue;
    const m = f.match(/(\d[\d,]*)\s*sheets?/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    const sq = f.match(/(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|sf)/i);
    if (sq) return Math.round(parseInt(sq[1].replace(/,/g, ''), 10) / sqft);
  }
  const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
  if (ppu != null && ut && /^(?:sf|sqft)$/.test(ut) && product.priceNumber != null) {
    const totalSqFt = product.priceNumber / ppu;
    return Math.round(totalSqFt / sqft);
  }
  return null;
}

function pricePerHomeUnit(itemName, product) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const { count: pack, weightPerPack } = getPackInfo(product);
  const mult = weightPerPack ? 1 : pack;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(itemName);
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) {
        return ppu * sheetSqFt;
      }
      if (/ct|count|sheet/.test(ut)) {
        return ppu;
      }
    }
    const totalSheets = extractSheetCount(itemName, product);
    if (totalSheets && product.priceNumber != null) {
      return product.priceNumber / totalSheets;
    }
  }
  if (unit === 'each') {
    return product.priceNumber != null ? product.priceNumber / pack : null;
  }
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null && product.priceNumber != null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * mult;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convert(product.sizeQty * mult, product.sizeUnit, 'oz');
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

function homeUnitLabel(itemName) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !item.home_unit) return null;
  const u = item.home_unit.toLowerCase();
  return u === 'each' ? 'ea' : u;
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

function buildWeightPackMap(products) {
  const map = new Map();
  for (const p of products) {
    let info;
    if (p && p.packCount && p.packCount > 1) {
      info = { count: p.packCount, weightPerPack: false };
    } else {
      info = baseGetPackInfo(p);
    }
    if (info.count > 1) {
      const key = weightKey(p);
      if (key && (!map.has(key) || map.get(key).count < info.count)) {
        map.set(key, info);
      }
    }
  }
  weightPackMap = map;
}

function saveSelected(item, store, product) {
  return new Promise(resolve => {
    const key = storageKey('selected', item, store);
    chrome.storage.local.set({ [key]: product }, () => resolve());
  });
}


const params = new URLSearchParams(location.search);
const item = params.get('item');
const store = params.get('store');

const title = document.getElementById('title');
const container = document.getElementById('products');

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

const imagesToRetry = [];

title.textContent = `${item} - ${store}`;

async function init() {
  await initUomTable();
  const [products, coupons, needs, consumption, mealMonth] = await Promise.all([
    loadProducts(item, store),
    loadCoupons(),
    loadNeeds(),
    loadMonthlyConsumption(),
    loadMealPlanMonth()
  ]);

  needsData = needs;
  const consMap = new Map(consumption.map(c => [c.name, c]));
  (mealMonth || []).forEach(m => {
    const rec = consMap.get(m.name);
    if (rec) rec.monthly_consumption += m.monthly_consumption;
    else consMap.set(m.name, { name: m.name, monthly_consumption: m.monthly_consumption });
  });
  consumptionMap = consMap;

  const week = getCurrentWeek();
  const adjusted = products.map(p => applyCoupon(p, coupons[item], week, store));
  const filtered = adjusted.filter(p => nameMatchesProduct(p.name, item));
  buildWeightPackMap(filtered);
  if (filtered.length === 0) {
    container.textContent = 'No products found.';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aPrice = pricePerHomeUnit(item, a);
    const bPrice = pricePerHomeUnit(item, b);
    return (aPrice ?? Infinity) - (bPrice ?? Infinity);
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
    imagesToRetry.push({ img, url: prod.image });

    let pStr = prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price;
    let qStr = prod.convertedQty != null ? `${prod.convertedQty.toFixed(2)} oz` : prod.size;
    const unitPrice = pricePerHomeUnit(item, prod);
    const label = homeUnitLabel(item) || prod.unit;
    let uStr = unitPrice != null ? `$${unitPrice.toFixed(2)}/${label}` : prod.unit;
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

  async function retryMissingImages() {
    let anyMissing = false;
    for (const rec of imagesToRetry) {
      if (rec.url && rec.img.src === PLACEHOLDER_IMG) {
        rec.img.src = rec.url;
        anyMissing = true;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (imagesToRetry.some(r => r.url && r.img.src === PLACEHOLDER_IMG)) {
      setTimeout(retryMissingImages, anyMissing ? 1000 : 0);
    }
  }

  retryMissingImages();
}

init();
