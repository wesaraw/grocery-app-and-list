import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';
import { getItemId, getItemName } from './utils/itemStorage.js';
import { getPriceUnitInfo } from './utils/priceUtils.js';
import { formatQuantity } from './utils/quantityFormat.js';
import { formatDateLabel } from './utils/dateLabel.js';
import { getStoreLink } from './utils/storeCatalog.js';
import { loadPriceCheckerState, fetchFinalSelection } from './utils/priceCheckerData.js';
import { calculatePurchaseNeeds } from './utils/purchaseCalculator.js';
import { resolveNextPrepWindow } from './utils/calendarUtils.js';
import { convertWithDensity } from './utils/unitNormalize.js';
import { convert } from './utils/uomConverter.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data));
  });
}

function resolvedNameKey(name, itemIdToNameMap = {}) {
  const resolved = itemIdToNameMap[String(name)] || name;
  if (resolved && String(resolved).trim()) return String(resolved).trim();
  if (name == null) return '';
  return String(name).trim();
}

function aliasKeys(name, itemNameToIdMap = {}, itemIdToNameMap = {}) {
  if (name == null) return [];
  const keys = new Set();
  const str = String(name);
  if (str) keys.add(str);
  const resolved = resolvedNameKey(str, itemIdToNameMap);
  if (resolved && resolved !== str) keys.add(resolved);
  const idFromResolved = itemNameToIdMap[resolved];
  if (idFromResolved) keys.add(idFromResolved);
  const idFromOriginal = itemNameToIdMap[str];
  if (idFromOriginal) keys.add(idFromOriginal);
  return Array.from(keys);
}

function lookupByNameOrId(map, name, itemNameToIdMap = {}, itemIdToNameMap = {}) {
  if (!map || typeof map.get !== 'function') return undefined;
  for (const key of aliasKeys(name, itemNameToIdMap, itemIdToNameMap)) {
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

function mapByResolvedName(list, itemNameToIdMap = {}, itemIdToNameMap = {}, transform = entry => entry) {
  const map = new Map();
  (list || []).forEach(entry => {
    if (!entry) return;
    const key = resolvedNameKey(entry.name, itemIdToNameMap);
    if (!key) return;
    map.set(key, transform(entry, key));
  });
  return map;
}

function normalizeEntriesByName(list, itemIdToNameMap = {}) {
  return (list || []).map(entry => {
    if (!entry) return entry;
    const key = resolvedNameKey(entry.name, itemIdToNameMap);
    if (!key || key === entry.name) return entry;
    return { ...entry, name: key };
  });
}

function buildStockLookup(list = [], itemNameToIdMap = {}, itemIdToNameMap = {}) {
  const map = new Map();
  list.forEach(entry => {
    if (!entry) return;
    const key = resolvedNameKey(entry.name, itemIdToNameMap);
    if (!key) return;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  });
  return map;
}

function densityInfoFor(itemName, densityMap = {}, itemIdToNameMap = {}) {
  const resolved = itemIdToNameMap[String(itemName)] || itemName;
  return densityMap[resolved] || densityMap[itemName] || {};
}

function normalizeStockAmount(entry, targetUnit, itemName, densityMap = {}, itemIdToNameMap = {}) {
  if (!entry || !targetUnit) return 0;
  const amount = Number(entry.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const sourceUnit = entry.unit || targetUnit;
  if (!sourceUnit || sourceUnit.toLowerCase() === targetUnit.toLowerCase()) return amount;
  const info = densityInfoFor(itemName, densityMap, itemIdToNameMap);
  try {
    const converted = convertWithDensity(amount, sourceUnit, targetUnit, {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!Number.isNaN(converted) && Number.isFinite(converted)) return converted;
  } catch (_err) {}
  try {
    const converted = convert(amount).from(sourceUnit).to(targetUnit);
    if (!Number.isNaN(converted) && Number.isFinite(converted)) return converted;
  } catch (_err) {}
  return amount;
}

function weeklyNeedForItem(itemName, consumptionMap, mealPlanMonthMap, calendarData) {
  const cons = lookupByNameOrId(consumptionMap, itemName);
  const baseMonthly = cons?.monthly_consumption || 0;
  const hasCalendar = calendarData && Object.keys(calendarData).length > 0;
  const plannedMonthly = hasCalendar ? lookupByNameOrId(mealPlanMonthMap, itemName) || 0 : 0;
  const weekly = (baseMonthly + plannedMonthly) / WEEKS_PER_MONTH;
  return Number.isFinite(weekly) ? weekly : null;
}

function expirationRunwayWeeks(itemName, expMap) {
  const rec = lookupByNameOrId(expMap, itemName);
  if (!rec) return null;
  if (rec.runway_weeks != null) return Number(rec.runway_weeks);
  if (rec.expiration_runway_weeks != null) return Number(rec.expiration_runway_weeks);
  if (rec.runwayWeeks != null) return Number(rec.runwayWeeks);
  if (rec.shelf_life_weeks != null) return Number(rec.shelf_life_weeks);
  if (rec.shelf_life_months != null) return rec.shelf_life_months * WEEKS_PER_MONTH;
  return null;
}

function baseGetPackInfo(product) {
  if (!product) return { count: 1, weightPerPack: false };
  if (product.packCount && product.packCount > 1) return { count: product.packCount, weightPerPack: false };

  const matchPack = text => {
    if (!text) return null;
    const match = String(text).match(/(\d+)\s*(?:pack|ct|count|pk)/i);
    if (match) return { count: Number(match[1]), match: match[0] };
    const xMatch = String(text).match(/(\d+)\s*[x\u00d7]\s*(\d+)/i);
    if (xMatch) return { count: Number(xMatch[1]) * Number(xMatch[2]), match: xMatch[0] };
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

function weightKey(product, itemName, densityMap = {}, itemIdToNameMap = {}) {
  if (product.convertedQty != null) {
    const clamped = Number(product.convertedQty.toFixed(2));
    if (Number.isFinite(clamped)) return clamped.toFixed(2);
  }
  if (product.sizeQty != null && product.sizeUnit) {
    const info = densityInfoFor(itemName, densityMap, itemIdToNameMap);
    const oz = convertWithDensity(product.sizeQty, product.sizeUnit, 'oz', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (Number.isFinite(oz)) {
      const rounded = Number(oz.toFixed(2));
      if (Number.isFinite(rounded)) return rounded.toFixed(2);
    }
  }
  return null;
}

function getPackInfo(product, weightMap, itemName, densityMap = {}, itemIdToNameMap = {}) {
  if (product && product.packCount && product.packCount > 1) return { count: product.packCount, weightPerPack: false };
  const base = baseGetPackInfo(product);
  if (base.count > 1) return base;
  const key = weightKey(product, itemName, densityMap, itemIdToNameMap);
  if (key && weightMap && weightMap.has(key)) return weightMap.get(key);
  return base;
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

async function recalcCommittedList(buttonEl) {
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Recalculating…';
  }

  const stateData = await loadPriceCheckerState();
  const {
    needsData,
    normalizedNeeds,
    normalizedPurchaseInfo,
    stockData,
    expirationData,
    consumptionMap,
    mealPlanMonthMap,
    densityMap,
    calendarData,
    mealsByCategoryData,
    cookingDaysData,
    itemNameToIdMap,
    itemIdToNameMap,
    consumptionData,
    purchasesData,
    mealYearData,
    consumedYearData,
    globalProduceMeasuresData,
    ingredientMapData
  } = stateData;

  const purchaseMap = mapByResolvedName(
    normalizedPurchaseInfo,
    itemNameToIdMap,
    itemIdToNameMap
  );
  const stockLookup = buildStockLookup(stockData, itemNameToIdMap, itemIdToNameMap);
  const expirationLookup = mapByResolvedName(
    expirationData,
    itemNameToIdMap,
    itemIdToNameMap
  );

  const { week: currentWeek, isoDate } = getCurrentWeek();
  const { prepDays, endDate: prepWindowEndDate } = resolveNextPrepWindow(
    cookingDaysData,
    isoDate
  );

  let prepPurchaseMap = null;
  if (prepWindowEndDate) {
    const prepPurchaseInfo = await calculatePurchaseNeeds(
      needsData,
      consumptionData,
      stockData,
      expirationData,
      consumedYearData,
      mealYearData,
      purchasesData,
      currentWeek,
      calendarData,
      mealsByCategoryData,
      !(calendarData && Object.keys(calendarData).length > 0),
      densityMap,
      isoDate,
      prepWindowEndDate,
      ingredientMapData,
      globalProduceMeasuresData
    );
    const normalizedPrepPurchaseInfo = normalizeEntriesByName(
      prepPurchaseInfo,
      itemIdToNameMap
    );
    prepPurchaseMap = mapByResolvedName(
      normalizedPrepPurchaseInfo,
      itemNameToIdMap,
      itemIdToNameMap
    );
  }

  const commitItems = [];
  for (const item of normalizedNeeds || needsData || []) {
    const needRecord = lookupByNameOrId(
      purchaseMap,
      item.name,
      itemNameToIdMap,
      itemIdToNameMap
    );
    if (!needRecord || needRecord.toBuy <= 0) continue;
    const { store, product } = await fetchFinalSelection(item.name);
    if (!product) continue;

    const info = densityInfoFor(item.name, densityMap, itemIdToNameMap);
    const { count: pack, weightPerPack } = getPackInfo(
      product,
      new Map(),
      item.name,
      densityMap,
      itemIdToNameMap
    );

    let perPackHomeQty = pack;
    if (item.home_unit && item.home_unit.toLowerCase() !== 'each') {
      const mult = weightPerPack ? 1 : pack;
      let ozQty = null;
      if (product.convertedQty != null) {
        ozQty = product.convertedQty * mult;
      } else if (product.sizeQty != null && product.sizeUnit) {
        ozQty = convertWithDensity(product.sizeQty * mult, product.sizeUnit, 'oz', {
          convert_volume_to_weight: info.convert,
          custom_density_ratio: info.ratio
        });
      }
      if (ozQty != null) {
        perPackHomeQty = convertWithDensity(ozQty, 'oz', item.home_unit, {
          convert_volume_to_weight: info.convert,
          custom_density_ratio: info.ratio
        });
      }
    }

    if (!perPackHomeQty || perPackHomeQty <= 0) perPackHomeQty = pack || 1;

    const stockEntries =
      lookupByNameOrId(stockLookup, item.name, itemNameToIdMap, itemIdToNameMap) || [];
    const onHandHomeQty = stockEntries.reduce(
      (sum, entry) =>
        sum + normalizeStockAmount(entry, item.home_unit, item.name, densityMap, itemIdToNameMap),
      0
    );

    const weeklyNeed = weeklyNeedForItem(
      item.name,
      consumptionMap,
      mealPlanMonthMap,
      calendarData
    );
    const runwayWeeks = expirationRunwayWeeks(item.name, expirationLookup);
    if (
      runwayWeeks != null &&
      runwayWeeks > 0 &&
      weeklyNeed != null &&
      weeklyNeed > 0 &&
      onHandHomeQty >= weeklyNeed * runwayWeeks
    ) {
      continue;
    }

    const netNeed = Math.max(0, needRecord.toBuy - onHandHomeQty);
    if (netNeed <= 0) continue;

    const packsToBuy = Math.ceil(netNeed / perPackHomeQty);
    if (packsToBuy <= 0) continue;
    const amount = perPackHomeQty * packsToBuy;

    let prepWindowAmount = prepWindowEndDate ? 0 : null;
    let prepWindowPacks = prepWindowEndDate ? 0 : null;
    if (prepWindowEndDate) {
      const prepNeed =
        prepPurchaseMap &&
        lookupByNameOrId(
          prepPurchaseMap,
          item.name,
          itemNameToIdMap,
          itemIdToNameMap
        )?.toBuy;
      const prepNeedAfterStock = Math.max(0, (prepNeed || 0) - onHandHomeQty);
      const cappedPrepNeed = Math.min(netNeed, prepNeedAfterStock);
      if (cappedPrepNeed > 0) {
        prepWindowPacks = Math.ceil(cappedPrepNeed / perPackHomeQty);
        prepWindowAmount = perPackHomeQty * prepWindowPacks;
      }
    }

    const itemId = await getItemId(item.name);
    commitItems.push({
      item: item.name,
      itemId,
      store,
      product,
      amount,
      unit: item.home_unit,
      packs: packsToBuy,
      prepWindowAmount,
      prepWindowPacks
    });
  }

  await chrome.storage.local.set({
    lastCommitItems: commitItems,
    pendingCommitWeek: currentWeek,
    lastCommitContext: {
      startDate: isoDate,
      prepWindowEndDate,
      prepDays,
      generatedAt: new Date().toISOString()
    }
  });

  if (buttonEl) {
    buttonEl.textContent = 'Recalculated';
  }
  window.location.reload();
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

  const recalcBtn = document.getElementById('recalculateList');
  if (recalcBtn) {
    recalcBtn.addEventListener('click', () => recalcCommittedList(recalcBtn));
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
