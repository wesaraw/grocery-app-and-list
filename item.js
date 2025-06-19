import { loadJSON } from './utils/dataLoader.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';

// Grey placeholder used until real product images load
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

function key(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
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

async function loadStoreSelections() {
  return new Promise(async resolve => {
    chrome.storage.local.get(STORE_SELECTION_KEY, async data => {
      if (data[STORE_SELECTION_KEY]) {
        resolve(data[STORE_SELECTION_KEY]);
      } else {
        const arr = await loadJSON(STORE_SELECTION_PATH);
        resolve(arr);
      }
    });
  });
}

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

async function getStoreEntries(itemName) {
  const all = await loadStoreSelections();
  return all.filter(e => e.name === itemName);
}

async function loadSelected(item, store) {
  const k = key('selected', item, store);
  const data = await getStorage([k]);
  return data[k] || null;
}


async function loadFinal(item) {
  const k = `final_${encodeURIComponent(item)}`;
  const data = await getStorage([k]);
  return data[k] || null;
}

async function saveFinal(item, store, product) {
  const storeKey = `final_${encodeURIComponent(item)}`;
  const productKey = `final_product_${encodeURIComponent(item)}`;
  await setStorage({ [storeKey]: store, [productKey]: product });
}

function nameMatchesProduct(productName, itemName) {
  const itemWords = itemName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const prod = productName.toLowerCase();
  return itemWords.some(w => prod.includes(w));
}


async function init() {
  await initUomTable();
  const params = new URLSearchParams(location.search);
  const itemName = params.get('item');

  const [needs, consumption] = await Promise.all([
    loadNeeds(),
    loadConsumption()
  ]);
  needsData = needs;
  consumptionMap = new Map(consumption.map(c => [c.name, c]));
  document.getElementById('itemName').textContent = itemName;
  document.getElementById('back').addEventListener('click', () => {
    window.close();
  });

  const stores = await getStoreEntries(itemName);
  const storesContainer = document.getElementById('stores');
  const storeMap = new Map();

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
      const product = rec ? rec.selectedProduct : null;
      await saveFinal(itemName, entry.store, product);
      chrome.runtime.sendMessage({
        type: 'finalSelection',
        item: itemName,
        store: entry.store,
        product
      });
      window.close();
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
      let pStr = selected.priceNumber != null ? `$${selected.priceNumber.toFixed(2)}` : selected.price;
      let qStr = selected.convertedQty != null ? `${selected.convertedQty.toFixed(2)} oz` : selected.size;
      let uStr = selected.pricePerUnit != null
        ? `$${selected.pricePerUnit.toFixed(2)}/${selected.unitType || 'oz'}`
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
      const rec = storeMap.get(message.store);
      if (rec) {
        const selected = message.product;
        let pStr =
          selected.priceNumber != null
            ? `$${selected.priceNumber.toFixed(2)}`
            : selected.price;
        let qStr =
          selected.convertedQty != null
            ? `${selected.convertedQty.toFixed(2)} oz`
            : selected.size;
        let uStr =
          selected.pricePerUnit != null
            ? `$${selected.pricePerUnit.toFixed(2)}/${selected.unitType || 'oz'}`
            : selected.unit;
        const cost = monthlyCost(itemName, selected);
        const costStr = cost != null ? ` - $${cost.toFixed(2)}/mo` : '';
        rec.info.textContent = `${selected.name} - ${pStr} - ${qStr} - ${uStr}${costStr}`;
        rec.img.src = selected.image || PLACEHOLDER_IMG;
        rec.img.alt = selected.name;
        rec.img.style.display = 'block';
        rec.finalBtn.style.display = 'inline';
        rec.selectedProduct = selected;
      }
    }
  });

  // Listener updates store info when a product is chosen in the results window
}

init();
