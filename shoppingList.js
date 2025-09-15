import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { getItemName } from './utils/itemStorage.js';

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data));
  });
}

async function fetchFinalInfo(itemName) {
  const storeKey = `final_${encodeURIComponent(itemName)}`;
  const productKey = `final_product_${encodeURIComponent(itemName)}`;
  const data = await storageGet([storeKey, productKey]);
  return { store: data[storeKey], product: data[productKey] };
}

async function resolveItemName(entry) {
  if (!entry) return null;
  if (entry.item != null && entry.item !== '') {
    return await getItemName(String(entry.item));
  }
  if (entry.itemId != null) {
    return await getItemName(String(entry.itemId));
  }
  if (entry.id != null) {
    return await getItemName(String(entry.id));
  }
  if (entry.name != null && entry.name !== '') {
    return await getItemName(String(entry.name));
  }
  return null;
}

function productNeedsExpansion(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return true;
  const keys = Object.keys(product);
  if (keys.length === 0) return true;
  if (
    product.name ||
    product.price ||
    product.priceNumber != null ||
    product.size ||
    product.convertedQty != null
  ) {
    return false;
  }
  return true;
}

async function expandCommitEntry(entry) {
  if (!entry) return null;
  const itemName = await resolveItemName(entry);
  if (!itemName) return null;
  let store = entry.store;
  let product = entry.product;

  let finalInfo = null;
  const needsFinalStore =
    !store ||
    (typeof store === 'string' && (!store.trim() || /^\d+$/.test(store.trim())));
  const needsFinalProduct = productNeedsExpansion(product);

  if (needsFinalStore || needsFinalProduct) {
    finalInfo = await fetchFinalInfo(itemName);
  }

  if (needsFinalStore && finalInfo && finalInfo.store) {
    store = finalInfo.store;
  }

  if (needsFinalProduct && finalInfo && finalInfo.product) {
    product = finalInfo.product;
  }

  const unit = entry.unit || entry.home_unit || null;

  return {
    ...entry,
    item: itemName,
    store,
    product,
    unit
  };
}

async function expandCommitItems(entries = []) {
  const expanded = await Promise.all(entries.map(expandCommitEntry));
  return expanded.filter(it => it && it.item);
}

async function loadCommitItems() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get('lastCommitItems', result => {
      resolve(result.lastCommitItems || []);
    });
  });
  return expandCommitItems(data);
}


function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000) + 1;
  return Math.ceil((dayOfYear + start.getDay()) / 7);
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

const STORE_LINKS = {
  'Roche Bros': name =>
    `https://onlineshopping.rochebros.com/search?searchTerms=${name.replace(/ /g, '%20')}`
};

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('list');
  const itemsNodes = [];
  const items = await loadCommitItems();
  if (items.length === 0) {
    container.textContent = 'No items committed.';
    return;
  }
  const byStore = {};
  items.forEach(it => {
    const store = it.store || 'Unknown';
    if (!byStore[store]) byStore[store] = [];
    byStore[store].push(it);
  });
  Object.keys(byStore)
    .sort()
    .forEach(store => {
      const h = document.createElement('h2');
      h.textContent = store;
      container.appendChild(h);
      const ul = document.createElement('ul');
      byStore[store].forEach(it => {
        const li = document.createElement('li');
        const img = new Image();
        img.src = (it.product && it.product.image) || PLACEHOLDER_IMG;
        img.alt = it.product?.name || '';
        li.appendChild(img);
        const span = document.createElement('span');
        let pStr = it.product?.priceNumber != null ? `$${it.product.priceNumber.toFixed(2)}` : it.product?.price || '';
        let qStr =
          it.product?.convertedQty != null
            ? `${it.product.convertedQty.toFixed(2)} ${it.product.unitType || 'oz'}`
            : it.product?.size || '';
        let uStr =
          it.product?.pricePerUnit != null
            ? `$${it.product.pricePerUnit.toFixed(2)}/${it.product.unitType || 'oz'}`
            : it.product?.unit || '';
        const packStr =
          it.packs != null ? `${it.packs} pack${it.packs > 1 ? 's' : ''}` : '';
        const amt = it.amount != null ? `${it.amount.toFixed(2)} ${it.unit}` : '';
        span.textContent = `${it.item} - ${it.product?.name || ''} - ${pStr} - ${qStr} - ${uStr} - ${packStr} - ${amt}`;
        li.appendChild(span);
        const storeName = (it.store || '').toLowerCase().replace(/\./g, '').trim();
        if (
          (storeName.startsWith('roche bros') || storeName.startsWith('roche brothers')) &&
          it.product?.addToCartId
        ) {
          const btn = document.createElement('button');
          btn.textContent = 'Add to Cart';
          btn.addEventListener('click', () => {
            chrome.runtime.sendMessage(
              {
                type: 'openStoreTab',
                url: STORE_LINKS['Roche Bros'](it.item),
                item: it.item,
                store: 'Roche Bros'
              },
              response => {
                const tabId = response.tabId;
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, {
                    type: 'simulateClick',
                    selector: `#${it.product.addToCartId}`
                  });
                }, 3000);
              }
            );
          });
          li.appendChild(btn);
        } else if (it.product && it.product.link) {
          const btn = document.createElement('button');
          btn.textContent = 'View';
          btn.addEventListener('click', () => {
            chrome.windows.create({ url: it.product.link, type: 'popup', width: 800, height: 800 });
          });
          li.appendChild(btn);
        }
        ul.appendChild(li);
        itemsNodes.push({ el: li, name: it.item });
      });
      container.appendChild(ul);
    });

  const search = document.getElementById('searchBox');
  if (search) {
    search.addEventListener('input', () => {
      const text = search.value.trim().toLowerCase();
      itemsNodes.forEach(({ el, name }) => {
        el.style.display =
          !text || name.toLowerCase().includes(text) ? 'flex' : 'none';
      });
    });
  }

  const confirmBtn = document.getElementById('confirmAdd');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const purchases = await loadPurchases();
      const data = await new Promise(resolve =>
        chrome.storage.local.get(['lastCommitItems', 'pendingCommitWeek'], resolve)
      );
      const { lastCommitItems = [], pendingCommitWeek } = data;
      if (pendingCommitWeek == null) {
        window.close();
        return;
      }
      const expandedItems = await expandCommitItems(lastCommitItems);
      for (const it of expandedItems) {
        if (!it.item) continue;
        if (!purchases[it.item]) purchases[it.item] = [];
        purchases[it.item].push({
          purchase_week: pendingCommitWeek,
          quantity_purchased: it.amount
        });
      }
      await savePurchases(purchases);
      chrome.storage.local.remove('pendingCommitWeek', () => {
        window.close();
      });
    });
  }
});
