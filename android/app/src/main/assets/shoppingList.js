import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { getItemName } from './utils/itemStorage.js';
import { getPriceUnitInfo } from './utils/priceUtils.js';
import { formatQuantity } from './utils/quantityFormat.js';
import { formatDateLabel } from './utils/dateLabel.js';
import { getStoreLink } from './utils/storeCatalog.js';

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

async function loadCommitData() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['lastCommitItems', 'lastCommitContext', 'pendingCommitWeek'], resolve);
  });
  const { lastCommitItems = [], lastCommitContext = null, pendingCommitWeek } = data || {};
  const items = await expandCommitItems(lastCommitItems);
  return { items, context: lastCommitContext, pendingCommitWeek };
}


function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000) + 1;
  return Math.ceil((dayOfYear + start.getDay()) / 7);
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

const state = {
  viewMode: 'full',
  hasPrepWindow: false,
  searchText: '',
  stores: [],
  records: [],
  expandedItems: [],
  pendingCommitWeek: null,
  context: null,
  emptyMessageEl: null
};

function getEffectiveMode() {
  return state.hasPrepWindow ? state.viewMode : 'full';
}

function extractNumeric(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function getActiveAmount(item, mode) {
  if (mode === 'prep' && state.hasPrepWindow) {
    return extractNumeric(item.prepWindowAmount);
  }
  return extractNumeric(item.amount);
}

function getActivePacks(item, mode) {
  if (mode === 'prep' && state.hasPrepWindow) {
    return extractNumeric(item.prepWindowPacks);
  }
  return extractNumeric(item.packs);
}

function isPositiveNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value) && value > 1e-6;
}

function updateRowText(record) {
  const { data, textSpan } = record;
  if (!textSpan) return;
  const mode = getEffectiveMode();
  const activeAmount = getActiveAmount(data, mode);
  const activePacks = getActivePacks(data, mode);

  const priceText =
    data.product?.priceNumber != null
      ? `$${data.product.priceNumber.toFixed(2)}`
      : data.product?.price || '';
  const unitInfo = data.product ? getPriceUnitInfo(data.product) : { pricePerUnit: null, unitType: null };
  const displayUnit = unitInfo.unitType || data.product?.unitType || 'oz';
  const qtyText =
    data.product?.convertedQty != null
      ? `${formatQuantity(data.product.convertedQty)} ${displayUnit}`
      : data.product?.size || '';
  const unitText =
    unitInfo.pricePerUnit != null
      ? `$${unitInfo.pricePerUnit.toFixed(2)}/${displayUnit}`
      : data.product?.unit || '';

  const packValue = isPositiveNumber(activePacks) ? Math.max(1, Math.round(activePacks)) : null;
  const packText = packValue != null ? `${packValue} pack${packValue > 1 ? 's' : ''}` : '';
  const amountText = isPositiveNumber(activeAmount)
    ? `${formatQuantity(activeAmount)} ${data.unit || ''}`.trim()
    : '';

  const parts = [
    data.item,
    data.product?.name || '',
    priceText,
    qtyText,
    unitText,
    packText,
    amountText
  ].filter(Boolean);
  textSpan.textContent = parts.join(' - ');
}

function updateAllRowText() {
  state.records.forEach(updateRowText);
}

function refreshVisibility() {
  const mode = getEffectiveMode();
  let anyVisible = false;
  state.stores.forEach(store => {
    store.visibleCount = 0;
  });

  for (const record of state.records) {
    const matchesSearch = !state.searchText || record.searchValue.includes(state.searchText);
    let show = matchesSearch;
    if (mode === 'prep' && state.hasPrepWindow) {
      const amount = getActiveAmount(record.data, mode);
      show = show && isPositiveNumber(amount);
    }

    record.element.style.display = show ? 'flex' : 'none';
    record.visible = show;
    if (show) {
      anyVisible = true;
      record.store.visibleCount = (record.store.visibleCount || 0) + 1;
    }
  }

  for (const store of state.stores) {
    const hasVisible = store.visibleCount > 0;
    store.heading.style.display = hasVisible ? '' : 'none';
    store.list.style.display = hasVisible ? '' : 'none';
  }

  if (state.emptyMessageEl) {
    if (!state.records.length) {
      state.emptyMessageEl.style.display = 'none';
    } else {
      state.emptyMessageEl.style.display = anyVisible ? 'none' : 'block';
    }
  }
}

function formatPrepWindowSummary(context) {
  if (!context || !context.prepWindowEndDate) {
    return 'Prep window: not available';
  }
  const startLabel = formatDateLabel(context.startDate);
  const endLabel = formatDateLabel(context.prepWindowEndDate);
  if (startLabel && endLabel) {
    if (startLabel === endLabel) {
      return `Prep window: ${startLabel}`;
    }
    return `Prep window: ${startLabel} → ${endLabel}`;
  }
  if (endLabel) {
    return `Prep window ends: ${endLabel}`;
  }
  if (startLabel) {
    return `Prep window: ${startLabel}`;
  }
  return 'Prep window: not available';
}

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('list');
  const { items, context, pendingCommitWeek } = await loadCommitData();

  state.stores = [];
  state.records = [];
  state.searchText = '';
  state.expandedItems = items;
  state.pendingCommitWeek = pendingCommitWeek ?? null;
  state.context = context || null;
  state.hasPrepWindow = Boolean(context && context.prepWindowEndDate);
  state.viewMode = state.hasPrepWindow ? 'prep' : 'full';

  const toggle = document.getElementById('prepWindowToggle');
  if (toggle) {
    toggle.disabled = !state.hasPrepWindow;
    toggle.checked = state.hasPrepWindow && state.viewMode === 'prep';
    toggle.addEventListener('change', () => {
      state.viewMode = toggle.checked ? 'prep' : 'full';
      updateAllRowText();
      refreshVisibility();
    });
  }

  const summaryEl = document.getElementById('prepWindowSummary');
  if (summaryEl) {
    summaryEl.textContent = formatPrepWindowSummary(context);
  }

  state.emptyMessageEl = document.getElementById('prepEmptyMessage');
  if (state.emptyMessageEl) {
    state.emptyMessageEl.style.display = 'none';
  }

  if (items.length === 0) {
    container.textContent = 'No items committed.';
    if (state.emptyMessageEl) {
      state.emptyMessageEl.style.display = 'none';
    }
    return;
  }

  const byStore = {};
  items.forEach(it => {
    const storeName = it.store || 'Unknown';
    if (!byStore[storeName]) byStore[storeName] = [];
    byStore[storeName].push(it);
  });

  Object.keys(byStore)
    .sort()
    .forEach(storeName => {
      const heading = document.createElement('h2');
      heading.textContent = storeName;
      const list = document.createElement('ul');
      const storeGroup = { heading, list, visibleCount: 0 };
      state.stores.push(storeGroup);
      container.appendChild(heading);
      container.appendChild(list);

      byStore[storeName].forEach(item => {
        const li = document.createElement('li');
        const img = new Image();
        img.src = (item.product && item.product.image) || PLACEHOLDER_IMG;
        img.alt = item.product?.name || '';
        li.appendChild(img);

        const span = document.createElement('span');
        li.appendChild(span);

        const storeKey = (item.store || '').toLowerCase().replace(/\./g, '').trim();
        const rocheLink = getStoreLink('Roche Bros', item.item);
        const productLink = item.product?.link;
        if (
          rocheLink &&
          (storeKey.startsWith('roche bros') || storeKey.startsWith('roche brothers')) &&
          item.product?.addToCartId
        ) {
          const btn = document.createElement('button');
          btn.textContent = 'Add to Cart';
          btn.addEventListener('click', () => {
            chrome.runtime.sendMessage(
              {
                type: 'openStoreTab',
                url: rocheLink,
                item: item.item,
                store: 'Roche Bros'
              },
              response => {
                const tabId = response.tabId;
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, {
                    type: 'simulateClick',
                    selector: `#${item.product.addToCartId}`
                  });
                }, 3000);
              }
            );
          });
          li.appendChild(btn);
        }

        if (productLink) {
          const btn = document.createElement('button');
          btn.textContent = 'View Item';
          btn.addEventListener('click', () => {
            chrome.runtime.sendMessage({
              type: 'openStoreTab',
              url: productLink,
              item: item.item,
              store: storeName
            });
          });
          li.appendChild(btn);
        } else {
          const storeLink = getStoreLink(storeName, item.item);
          if (storeLink) {
            const btn = document.createElement('button');
            btn.textContent = 'Open Store';
            btn.addEventListener('click', () => {
              chrome.runtime.sendMessage({
                type: 'openStoreTab',
                url: storeLink,
                item: item.item,
                store: storeName
              });
            });
            li.appendChild(btn);
          }
        }

        list.appendChild(li);

        const searchValue = [item.item, item.product?.name, storeName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const record = {
          element: li,
          textSpan: span,
          data: item,
          store: storeGroup,
          searchValue,
          visible: true
        };
        state.records.push(record);
        updateRowText(record);
      });
    });

  updateAllRowText();
  refreshVisibility();

  const search = document.getElementById('searchBox');
  if (search) {
    search.addEventListener('input', () => {
      state.searchText = search.value.trim().toLowerCase();
      refreshVisibility();
    });
  }

  const confirmBtn = document.getElementById('confirmAdd');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (state.pendingCommitWeek == null) {
        window.close();
        return;
      }
      const purchases = await loadPurchases();
      const mode = getEffectiveMode();
      for (const item of state.expandedItems) {
        if (!item.item) continue;
        const amount = getActiveAmount(item, mode);
        if (!isPositiveNumber(amount)) continue;
        if (!purchases[item.item]) purchases[item.item] = [];
        const entry = {
          purchase_week: state.pendingCommitWeek,
          quantity_purchased: amount
        };
        const packs = getActivePacks(item, mode);
        if (isPositiveNumber(packs)) {
          entry.packs = Math.max(1, Math.round(packs));
        }
        purchases[item.item].push(entry);
      }
      await savePurchases(purchases);
      chrome.storage.local.remove('pendingCommitWeek', () => {
        window.close();
      });
    });
  }
});
