import { canonicalName } from './nameUtils.js';
import { getItemNameMap, saveItemNameMap, nextUnusedItemId } from './itemStorage.js';

const noopArray = async () => [];
const noopObject = async () => ({ });

function buildCanonicalIndex() {
  const index = new Set();
  return {
    has(rawName) {
      const key = canonicalName(rawName);
      if (!key) return false;
      return index.has(key);
    },
    add(rawName) {
      const key = canonicalName(rawName);
      if (!key) return;
      index.add(key);
    }
  };
}

function canonicalKey(name) {
  const key = canonicalName(name);
  if (key) return key;
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
  }
  return name;
}

export async function createInventoryLookup(loaders = {}) {
  const {
    loadNeeds = noopArray,
    loadConsumption = noopArray,
    loadStock = noopArray,
    loadExpiration = noopArray,
    loadConsumed = noopArray,
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
    loadPurchases(),
    loadDensityMap(),
    loadItemSeasons(),
    getItemNameMap(),
  ]);

  const timelineIndex = buildCanonicalIndex();
  const serializedIndex = buildCanonicalIndex();
  const seedTimelineName = entry => {
    if (entry && entry.name) {
      timelineIndex.add(entry.name);
    }
  };

  needs.forEach(seedTimelineName);
  consumption.forEach(seedTimelineName);
  stock.forEach(seedTimelineName);
  expiration.forEach(seedTimelineName);
  consumed.forEach(seedTimelineName);

  Object.keys(itemNameMap || {}).forEach(name => serializedIndex.add(name));

  return {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    densityMap,
    itemSeasons,
    hasItemByCanonical(name) {
      return timelineIndex.has(name);
    },
    hasSerializedId(name) {
      if (serializedIndex.has(name)) return true;
      const key = canonicalKey(name);
      if (!key) return false;
      if (serializedIndex.has(key)) return true;
      return Object.prototype.hasOwnProperty.call(itemNameMap || {}, key);
    },
    markItemPresent(name) {
      timelineIndex.add(name);
    },
    async getOrCreateItemId(name) {
      if (!name) return null;
      const key = canonicalKey(name);
      if (key && itemNameMap[key]) {
        return itemNameMap[key];
      }
      const id = nextUnusedItemId(itemNameMap);
      if (key) {
        itemNameMap[key] = id;
        serializedIndex.add(key);
      } else {
        itemNameMap[name] = id;
        serializedIndex.add(name);
      }
      await saveItemNameMap(itemNameMap);
      return id;
    },
  };
}
