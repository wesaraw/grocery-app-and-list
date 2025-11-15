import { canonicalName } from './nameUtils.js';
import { getItemNameMap, saveItemNameMap, nextUnusedItemId } from './itemStorage.js';

const noopArray = async () => [];
const noopObject = async () => ({ });

function buildCanonicalIndex() {
  const index = new Map();
  return {
    has(rawName) {
      const key = canonicalName(rawName);
      if (!key) return false;
      return index.has(key);
    },
    add(rawName) {
      const key = canonicalName(rawName);
      if (!key) return;
      if (!index.has(key)) {
        index.set(key, rawName);
      }
    }
  };
}

export async function createInventoryLookup(loaders = {}) {
  const {
    loadNeeds = noopArray,
    loadConsumption = noopArray,
    loadStock = noopArray,
    loadExpiration = noopArray,
    loadConsumed = noopArray,
    loadStoreSelections = noopArray,
    loadPurchases = noopObject,
    loadDensityMap = noopObject,
    loadItemSeasons = noopObject,
  } = loaders || {};

  const [
    needs = [],
    consumption = [],
    stock = [],
    expiration = [],
    consumed = [],
    storeSelections = [],
    purchases = {},
    densityMap = {},
    itemSeasons = {},
    itemNameMap,
  ] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
    loadPurchases(),
    loadDensityMap(),
    loadItemSeasons(),
    getItemNameMap(),
  ]);

  const canonicalIndex = buildCanonicalIndex();
  const seedNames = entry => {
    if (entry && entry.name) {
      canonicalIndex.add(entry.name);
    }
  };

  needs.forEach(seedNames);
  consumption.forEach(seedNames);
  stock.forEach(seedNames);
  expiration.forEach(seedNames);
  consumed.forEach(seedNames);
  // Store selections are auto-populated for every catalog item, so only the
  // core timeline tables plus known serialized names contribute to the lookup.
  Object.keys(itemNameMap || {}).forEach(name => canonicalIndex.add(name));

  return {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    storeSelections,
    purchases,
    densityMap,
    itemSeasons,
    hasItemByCanonical(name) {
      return canonicalIndex.has(name);
    },
    markItemPresent(name) {
      canonicalIndex.add(name);
    },
    async getOrCreateItemId(name) {
      if (!name) return null;
      if (itemNameMap[name]) {
        return itemNameMap[name];
      }
      const id = nextUnusedItemId(itemNameMap);
      itemNameMap[name] = id;
      await saveItemNameMap(itemNameMap);
      return id;
    },
  };
}
