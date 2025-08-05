import { initUomTable, convert } from './utils/uomConverter.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { parseUnitPrice, getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import {
  loadArray,
  loadArrayWithFallback,
  getItemId,
  loadObject,
  saveObject
} from './utils/itemRegistry.js';

const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';

// Grey placeholder used until real product images load
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

async function key(type, item, store) {
  const id = await getItemId(item);
  return `${type}_${id}_${encodeURIComponent(store)}`;
}

function getStorage(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data));
  });
}

function setStorage(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set(obj, () => resolve());
  });
}
const loadStoreSelections = () =>
  loadArrayWithFallback(STORE_SELECTION_KEY, STORE_SELECTION_PATH);

const loadMealPlanMonth = () => loadArray('mealPlanMonthly');

const loadNeeds = () => loadArrayWithFallback('yearlyNeeds', YEARLY_NEEDS_PATH);
const loadConsumption = () =>
  loadArrayWithFallback('monthlyConsumption', CONSUMPTION_PATH);

let needsData = [];
let consumptionMap = new Map();

// Keep global order of stores and selected product info
let storeOrder = [];
let storeMapGlobal = new Map();
let weightPackMap = new Map();
let densityMap = {};

// Examples that should return 12:
//   "12 pack"
//   "12 pk"
//   "12-pk"
//   "12‑pk"       (non-breaking hyphen)
//   "12&nbsp;pk"    (HTML entity)
//   "pack of 12"
//   "<span>12</span> pack"
// The function strips simple HTML tags and handles various punctuation between
// the number and the pack keyword.
function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const sanitize = str =>
    str
      ?.replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    let m;
    if ((m = s.match(/(\d+)\s*(?:doz|dozen)/i))) {
      return { count: parseInt(m[1], 10) * 12, match: m[0] };
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
    const source = `${product?.name || ''} ${product?.size || ''} ${product?.unit || ''}`;
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(match);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

function weightKey(product, itemName) {
  if (product.convertedQty != null) return product.convertedQty.toFixed(2);
  if (product.sizeQty != null && product.sizeUnit) {
    const info = densityMap[itemName] || {};
    const oz = convertWithDensity(
      product.sizeQty,
      product.sizeUnit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(oz)) return oz.toFixed(2);
  }
  return null;
}

function getPackInfo(product, map = weightPackMap, itemName = null) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product, itemName);
  if (key && map && map.has(key)) {
    return map.get(key);
  }
  return base;
}

function getPackCount(product, map = weightPackMap, itemName = null) {
  return getPackInfo(product, map, itemName).count;
}


function extractSheetCount(itemName, product) {
  const sqft = sheetSqFtFor(itemName);
  const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
  if (ppu != null && ut && /^(?:sf|sqft)$/.test(ut) && product.priceNumber != null) {
    const totalSqFt = product.priceNumber / ppu;
    return Math.round(totalSqFt / sqft);
  }
  const fields = [product?.name, product?.size, product?.unit];
  for (const f of fields) {
    if (!f) continue;
    const m = f.match(/(\d[\d,]*)\s*sheets?/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    const sq = f.match(/(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|sf)/i);
    if (sq) return Math.round(parseInt(sq[1].replace(/,/g, ''), 10) / sqft);
  }
  return null;
}

function pricePerHomeUnit(itemName, product, map = weightPackMap) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const info = densityMap[itemName] || {};
  const { count: pack, weightPerPack } = getPackInfo(product, map, itemName);
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
      return product.priceNumber / (totalSheets * mult);
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
      ozQty = convertWithDensity(
        product.sizeQty * mult,
        product.sizeUnit,
        'oz',
        {
          convert_volume_to_weight: info.convert,
          custom_density_ratio: info.ratio
        }
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

function monthlyCost(itemName, product, map = weightPackMap) {
  const cons = consumptionMap.get(itemName);
  if (!cons) return null;
  const unitPrice = pricePerHomeUnit(itemName, product, map);
  if (unitPrice == null) return null;
  return unitPrice * (cons.monthly_consumption || 0);
}

async function getStoreEntries(itemName) {
  const all = await loadStoreSelections();
  return all.filter(e => e.name === itemName);
}

async function loadSelected(item, store) {
  const k = await key('selected', item, store);
  const nameKey = `selected_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
  const data = await getStorage([k, nameKey]);
  return data[k] || data[nameKey] || null;
}

async function loadScraped(item, store) {
  const k = await key('scraped', item, store);
  const nameKey = `scraped_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
  const data = await getStorage([k, nameKey]);
  return data[k] || data[nameKey] || [];
}

async function buildWeightPackMap(item, stores) {
  const map = new Map();
  for (const s of stores) {
    const arr = await loadScraped(item, s);
    for (const p of arr) {
      const baseInfo = baseGetPackInfo(p);
      let count = baseInfo.count;
      let weightPerPack = baseInfo.weightPerPack;
      if (p && p.packCount && p.packCount > count) {
        count = p.packCount;
        weightPerPack = false;
      }
      const info = { count, weightPerPack };
      if (info.count > 1) {
        const key = weightKey(p, item);
        if (key && (!map.has(key) || map.get(key).count < info.count)) {
          map.set(key, info);
        }
      }
    }
  }
  weightPackMap = map;
  return map;
}


async function loadFinal(item) {
  const id = await getItemId(item);
  const idKey = `final_${id}`;
  const nameKey = `final_${encodeURIComponent(item)}`;
  const data = await getStorage([idKey, nameKey]);
  return data[idKey] || data[nameKey] || null;
}

async function saveFinal(item, store, product) {
  const id = await getItemId(item);
  const storeKey = `final_${id}`;
  const productKey = `final_product_${id}`;
  const nameProdKey = `final_product_${encodeURIComponent(item)}`;
  const existingData = await getStorage([productKey, nameProdKey]);
  const existingProd = existingData[productKey] || existingData[nameProdKey] || null;

  let image = product?.image || '';
  if (!image && existingProd && existingProd.image) {
    image = existingProd.image;
  }
  if (!image) {
    for (const s of storeOrder) {
      if (s === store) continue;
      const rec = storeMapGlobal.get(s);
      if (rec && rec.selectedProduct && rec.selectedProduct.image) {
        image = rec.selectedProduct.image;
        break;
      }
      const scraped = await loadScraped(item, s);
      const candidate = scraped.find(p => p.image);
      if (candidate) {
        image = candidate.image;
        break;
      }
    }
  }

  if (product) {
    const packInfo = getPackInfo(product, weightPackMap, item);
    const updated = { ...product, image: image || '' };
    if (packInfo.count && packInfo.count > 1) {
      updated.packCount = packInfo.count;
    }
    product = updated;
  }

  await setStorage({ [storeKey]: store, [productKey]: product });
  return product;
}



async function init() {
  await initUomTable();
  const params = new URLSearchParams(location.search);
  const itemName = params.get('item');

  const [needs, consumption, mealMonth, dMap] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadMealPlanMonth(),
    loadDensityMap()
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
  document.getElementById('itemName').textContent = itemName;
  document.getElementById('back').addEventListener('click', () => {
    window.close();
  });

  const stores = await getStoreEntries(itemName);
  storeOrder = stores.map(s => s.store);
  await buildWeightPackMap(itemName, storeOrder);
  const storesContainer = document.getElementById('stores');
  const storeMap = new Map();
  storeMapGlobal = storeMap;

  for (const entry of stores) {
    const div = document.createElement('div');
    div.className = 'store';
    const header = document.createElement('div');
    const openBtn = document.createElement('button');
    openBtn.textContent = entry.store;
    openBtn.addEventListener('click', () => {
      let link = entry.link;
      if (entry.store === 'Walmart') {
        link = link.replace(/%2B/g, '+');
      }
      chrome.runtime.sendMessage({
        type: 'openStoreTab',
        url: link,
        item: itemName,
        store: entry.store
      }, response => {
        const rec = storeMap.get(entry.store);
        if (rec) rec.tabId = response.tabId;
      });
    });
    header.appendChild(openBtn);

    const scrapeBtn = document.createElement('button');
    scrapeBtn.textContent = 'Scrape';
    scrapeBtn.addEventListener('click', () => {
      const rec = storeMap.get(entry.store);
      if (rec && rec.tabId) {
        chrome.tabs.sendMessage(rec.tabId, { type: 'triggerScrape' });
      }
      const path = `scrapeResults.html?item=${encodeURIComponent(itemName)}&store=${encodeURIComponent(entry.store)}`;
      setTimeout(() => {
        openOrFocusWindow(path);
      }, 1000);
    });
    header.appendChild(scrapeBtn);

    const finalBtn = document.createElement('button');
    finalBtn.textContent = 'Final Selection';
    finalBtn.style.display = 'none';
    finalBtn.addEventListener('click', async () => {
      const rec = storeMap.get(entry.store);
      let product = rec ? rec.selectedProduct : null;
      product = await saveFinal(itemName, entry.store, product);
      chrome.runtime.sendMessage({
        type: 'finalSelection',
        item: itemName,
        store: entry.store,
        product
      });
    });
    header.appendChild(finalBtn);
    div.appendChild(header);

    const info = document.createElement('div');
    info.textContent = 'No item selected';
    div.appendChild(info);

    const img = document.createElement('img');
    img.className = 'selected-product-img';
    img.src = PLACEHOLDER_IMG;
    img.width = 200;
    img.height = 200;
    img.alt = '';
    img.style.display = 'none';
    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };
    div.appendChild(img);

    const selected = await loadSelected(itemName, entry.store);
    if (selected) {
      const info = getPackInfo(selected, weightPackMap, itemName);
      if (info.count > 1) {
        if (!selected.packCount) {
          selected.packCount = info.count;
        }
        const wKey = weightKey(selected, itemName);
        if (wKey && (!weightPackMap.has(wKey) || weightPackMap.get(wKey).count < info.count)) {
          weightPackMap.set(wKey, info);
        }
      }
      let pStr = selected.priceNumber != null ? `$${selected.priceNumber.toFixed(2)}` : selected.price;
      let qStr = selected.convertedQty != null
        ? `${selected.convertedQty.toFixed(2)} ${selected.unitType || 'oz'}`
        : selected.size;
      const unitPrice = pricePerHomeUnit(itemName, selected);
      const label = homeUnitLabel(itemName) || selected.unitType || 'oz';
      let uStr = unitPrice != null
        ? `$${unitPrice.toFixed(2)}/${label}`
        : selected.unit;
      const cost = monthlyCost(itemName, selected);
      const costStr = cost != null ? ` - $${cost.toFixed(2)}/mo` : '';
      info.textContent = `${selected.name} - ${pStr} - ${qStr} - ${uStr}${costStr}`;
      img.src = selected.image || PLACEHOLDER_IMG;
      img.alt = selected.name;
      img.style.display = 'block';
      finalBtn.style.display = 'inline';
    }

    // Previously scraped results are no longer shown in this window

    storesContainer.appendChild(div);
    storeMap.set(entry.store, {
      div,
      info,
      img,
      tabId: null,
      finalBtn,
      selectedProduct: selected || null
    });
  }



  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'selectedItem' && message.item === itemName) {
      (async () => {
        const rec = storeMap.get(message.store);
        if (rec) {
          const selected = message.product;

          // Rebuild the weight pack map to include newly scraped products
          await buildWeightPackMap(itemName, storeOrder);

          const info = getPackInfo(selected, weightPackMap, itemName);
          if (info.count > 1) {
            if (!selected.packCount) {
              selected.packCount = info.count;
            }
            const wKey = weightKey(selected, itemName);
            if (wKey && (!weightPackMap.has(wKey) || weightPackMap.get(wKey).count < info.count)) {
              weightPackMap.set(wKey, info);
            }
          }
          let pStr =
            selected.priceNumber != null
              ? `$${selected.priceNumber.toFixed(2)}`
              : selected.price;
          let qStr =
            selected.convertedQty != null
              ? `${selected.convertedQty.toFixed(2)} ${selected.unitType || 'oz'}`
              : selected.size;
          const unitPrice = pricePerHomeUnit(itemName, selected);
          const label = homeUnitLabel(itemName) || selected.unitType || 'oz';
          let uStr =
            unitPrice != null
              ? `$${unitPrice.toFixed(2)}/${label}`
              : selected.unit;
          const cost = monthlyCost(itemName, selected);
          const costStr = cost != null ? ` - $${cost.toFixed(2)}/mo` : '';
          rec.info.textContent = `${selected.name} - ${pStr} - ${qStr} - ${uStr}${costStr}`;
          rec.img.src = selected.image || PLACEHOLDER_IMG;
          rec.img.alt = selected.name;
          rec.img.style.display = 'block';
          rec.finalBtn.style.display = 'inline';
          rec.selectedProduct = selected;
          sendResponse({ success: true });
        }
      })();
      return true;
    }
  });

  // Listener updates store info when a product is chosen in the results window
}

init();
