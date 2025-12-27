import { loadJSON } from './utils/dataLoader.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import { getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { formatQuantity, roundQuantity } from './utils/quantityFormat.js';
import {
  DEFAULT_ORDER_CAP,
  loadCategoryCaps,
  loadItemCaps
} from './utils/orderCapStorage.js';

const YEARLY_NEEDS_PATH = 'data/required-for-grocery-app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'data/required-for-grocery-app/monthly_consumption_table.json';

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
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
let densityMap = {};
const EPSILON = 1e-4;

function categoryKey(name) {
  return name && name.trim() ? name : 'Other';
}

function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const sanitize = str =>
    str?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    let m;
    if ((m = s.match(/(\d+)\s*\/\s*(\d+)\s*(?:doz|dozen)/i))) {
      const numerator = parseInt(m[1], 10);
      const denominator = parseInt(m[2], 10);
      if (denominator) {
        return { count: Math.round((numerator / denominator) * 12), match: m[0] };
      }
    }
    if (!s.includes('/') && (m = s.match(/(\d+(?:\.\d+)?)\s*(?:doz|dozen)/i))) {
      return { count: Math.round(parseFloat(m[1]) * 12), match: m[0] };
    }
    if ((m = s.match(/(?:half|1\/2)\s*-?\s*doz(?:en)?/i))) {
      return { count: 6, match: m[0] };
    }
    if ((m = s.match(/\bdoz(?:en)?\b/i))) {
      return { count: 12, match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/pack\s*of\s*(\d+)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*-\s*\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    return null;
  };

  let m = matchPack(product?.name);
  if (!m) m = matchPack(product?.size);
  if (!m) m = matchPack(product?.unit);

  if (m) {
    const { count, match } = m;
    const source = product.name + ' ' + (product.size || '') + ' ' + (product.unit || '');
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(match);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

function weightKey(product, itemName) {
  if (product.convertedQty != null) {
    const clamped = roundQuantity(product.convertedQty);
    if (Number.isFinite(clamped)) {
      return clamped.toFixed(2);
    }
  }
  if (product.sizeQty != null && product.sizeUnit) {
    const info = densityMap[itemName] || {};
    const oz = convertWithDensity(
      product.sizeQty,
      product.sizeUnit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (Number.isFinite(oz)) {
      const rounded = roundQuantity(oz);
      if (Number.isFinite(rounded)) {
        return rounded.toFixed(2);
      }
    }
  }
  return null;
}

function getPackInfo(product, itemName = null) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product, itemName);
  if (key && weightPackMap.has(key)) {
    return weightPackMap.get(key);
  }
  return base;
}

  function getPackCount(product, itemName = null) {
    return getPackInfo(product, itemName).count;
  }

  function weightBasedEachCount(item, product, info, mult) {
    const gramsPerEach = item?.averageEachWeight?.gramsPerEach;
    if (!(gramsPerEach > 0)) return null;

    let grams = null;
    if (product.convertedQty != null) {
      grams = convertWithDensity(product.convertedQty * mult, 'oz', 'g', {
        convert_volume_to_weight: info.convert,
        custom_density_ratio: info.ratio
      });
    } else if (product.sizeQty != null && product.sizeUnit) {
      grams = convertWithDensity(product.sizeQty * mult, product.sizeUnit, 'g', {
        convert_volume_to_weight: info.convert,
        custom_density_ratio: info.ratio
      });
    }

    if (!(grams > 0)) return null;
    const count = grams / gramsPerEach;
    return Number.isFinite(count) && count > 0 ? count : null;
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
  const info = densityMap[itemName] || {};
  const { count: pack, weightPerPack } = getPackInfo(product, itemName);
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
      const eachCount = weightBasedEachCount(item, product, info, mult) || pack;
      return product.priceNumber != null ? product.priceNumber / eachCount : null;
    }
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null && product.priceNumber != null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * mult;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * mult,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convertWithDensity(
      1,
      item.home_unit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
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

function findItemRecord(itemName) {
  return needsData.find(n => n.name === itemName);
}

function monthlyNeedFor(itemName) {
  const cons = consumptionMap.get(itemName);
  if (cons && Number.isFinite(cons.monthly_consumption) && cons.monthly_consumption > 0) {
    return cons.monthly_consumption;
  }
  const itemRecord = findItemRecord(itemName);
  if (itemRecord && Number.isFinite(itemRecord.total_needed_year) && itemRecord.total_needed_year > 0) {
    return itemRecord.total_needed_year / 12;
  }
  return null;
}

function resolveCapMultiplier(itemName, categoryCaps, itemCaps) {
  if (itemCaps && itemCaps[itemName] != null) {
    return itemCaps[itemName];
  }
  const itemRecord = findItemRecord(itemName);
  const category = categoryKey(itemRecord?.category);
  if (categoryCaps && categoryCaps[category] != null) {
    return categoryCaps[category];
  }
  return DEFAULT_ORDER_CAP;
}

function normalizeUnit(unit) {
  return typeof unit === 'string' ? unit.trim().toLowerCase() : '';
}

function convertQuantity(qty, fromUnit, toUnit, info = {}) {
  if (qty == null) return null;
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return qty;
  const converted = convertWithDensity(qty, from, to, {
    convert_volume_to_weight: info.convert,
    custom_density_ratio: info.ratio
  });
  if (Number.isFinite(converted)) {
    return converted;
  }
  const plain = convert(qty, from, to);
  if (Number.isFinite(plain)) {
    return plain;
  }
  return null;
}

function tryConvertProductQuantity(product, multiplier, targetUnit, info) {
  if (targetUnit === 'each') {
    return multiplier;
  }
  const target = normalizeUnit(targetUnit);
  if (!target) return null;
  if (product.convertedQty != null) {
    const sourceUnit = normalizeUnit(product.unitType || product.unit || 'oz');
    const converted = convertQuantity(
      product.convertedQty * multiplier,
      sourceUnit || 'oz',
      target,
      info
    );
    if (converted != null) return converted;
  }
  if (product.sizeQty != null && product.sizeUnit) {
    const converted = convertQuantity(
      product.sizeQty * multiplier,
      product.sizeUnit,
      target,
      info
    );
    if (converted != null) return converted;
  }
  const { unitType, pricePerUnit } = getPriceUnitInfo(product);
  if (pricePerUnit != null && product.priceNumber != null && unitType) {
    const totalUnits = product.priceNumber / pricePerUnit;
    const converted = convertQuantity(totalUnits, unitType, target, info);
    if (converted != null) return converted;
  }
  return null;
}

function totalHomeUnits(itemName, product) {
  const itemRecord = findItemRecord(itemName);
  if (!itemRecord) return null;
  const info = densityMap[itemName] || {};
  const { count, weightPerPack } = getPackInfo(product, itemName);
  const multiplier = weightPerPack ? 1 : count;
  const homeUnit = normalizeUnit(itemRecord.home_unit || 'each');

  if (homeUnit === 'each') {
    return multiplier;
  }
  if (homeUnit === 'sheets') {
    const sheets = extractSheetCount(itemName, product);
    if (sheets != null) {
      return sheets;
    }
    return null;
  }

  const direct = tryConvertProductQuantity(product, multiplier, homeUnit, info);
  if (direct != null) {
    return direct;
  }

  const totalOz = tryConvertProductQuantity(product, multiplier, 'oz', info);
  if (totalOz != null) {
    const converted = convertQuantity(totalOz, 'oz', homeUnit, info);
    if (converted != null) {
      return converted;
    }
  }

  return null;
}

function computeCapLimit(baseNeed, multiplier, treatWhole, minPurchasable) {
  const capMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DEFAULT_ORDER_CAP;
  let base = null;
  if (Number.isFinite(baseNeed) && baseNeed > 0) {
    const candidate = baseNeed * capMultiplier;
    if (Number.isFinite(candidate) && candidate > 0) {
      base = candidate;
    }
  }

  // Always allow at least the smallest purchasable size so we do not filter out
  // the only viable options when the calculated cap is below market packaging.
  if (Number.isFinite(minPurchasable) && minPurchasable > 0) {
    base = base == null ? minPurchasable : Math.max(base, minPurchasable);
  }

  if (treatWhole) {
    const minimum = Number.isFinite(minPurchasable) && minPurchasable > 0 ? minPurchasable : 1;
    if (base == null || base < minimum) {
      return minimum;
    }
    return base;
  }

  return base;
}

function minPurchasableUnits(itemName, products) {
  let min = Infinity;
  for (const prod of products) {
    const units = totalHomeUnits(itemName, prod);
    if (Number.isFinite(units) && units > 0 && units < min) {
      min = units;
    }
  }
  return min === Infinity ? null : min;
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
    const info = densityMap[item] || {};
    const oz = convertWithDensity(
      copy.sizeQty,
      copy.sizeUnit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(oz)) {
      copy.convertedQty = oz;
      copy.pricePerUnit = price / oz;
      copy.unit = 'oz';
    }
  }
  return copy;
}

function extractScrapedProducts(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object' && Array.isArray(entry.products)) {
    return entry.products;
  }
  return [];
}

function loadProducts(item, store) {
  return new Promise(resolve => {
    const key = storageKey('scraped', item, store);
    chrome.storage.local.get([key], data => resolve(extractScrapedProducts(data[key])));
  });
}

function buildWeightPackMap(products, itemName) {
  const map = new Map();
  for (const p of products) {
    let info;
    if (p && p.packCount && p.packCount > 1) {
      info = { count: p.packCount, weightPerPack: false };
    } else {
      info = baseGetPackInfo(p);
    }
    if (info.count > 1) {
      const key = weightKey(p, itemName);
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
  const [
    products,
    coupons,
    needs,
    consumption,
    mealMonth,
    dMap,
    categoryCaps,
    itemCapMap
  ] = await Promise.all([
    loadProducts(item, store),
    loadCoupons(),
    loadNeeds(),
    loadMonthlyConsumption(),
    loadMealPlanMonth(),
    loadDensityMap(),
    loadCategoryCaps(),
    loadItemCaps()
  ]);

  needsData = needs;
  densityMap = dMap;
  const consMap = new Map(consumption.map(c => [c.name, c]));
  (mealMonth || []).forEach(m => {
    const rec = consMap.get(m.name);
    if (rec) rec.monthly_consumption += m.monthly_consumption;
    else consMap.set(m.name, { name: m.name, monthly_consumption: m.monthly_consumption });
  });
  consumptionMap = consMap;

  const week = getCurrentWeek();
  const adjusted = products.map(p => applyCoupon(p, coupons[item], week, store));
  buildWeightPackMap(adjusted, item);

  const itemRecord = findItemRecord(item);
  const monthlyNeed = monthlyNeedFor(item);
  const multiplier = resolveCapMultiplier(item, categoryCaps, itemCapMap);
  const minUnits = minPurchasableUnits(item, adjusted);
  const capLimit = computeCapLimit(
    monthlyNeed,
    multiplier,
    itemRecord?.treat_as_whole_unit,
    minUnits
  );

  const filtered =
    capLimit == null
      ? adjusted
      : adjusted.filter(prod => {
          const totalUnits = totalHomeUnits(item, prod);
          if (totalUnits == null) return true;
          return totalUnits <= capLimit + EPSILON;
        });

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

    let pStr =
      prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price;
    const { unitType: normalizedUnitType } = getPriceUnitInfo(prod);
    const displayUnit = normalizedUnitType || prod.unitType || 'oz';
    let qStr =
      prod.convertedQty != null
        ? `${formatQuantity(prod.convertedQty)} ${displayUnit}`
        : prod.size;
    const unitPrice = pricePerHomeUnit(item, prod);
    const label = homeUnitLabel(item) || displayUnit || 'oz';
    let uStr =
      unitPrice != null ? `$${unitPrice.toFixed(2)}/${label}` : prod.unit;
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
