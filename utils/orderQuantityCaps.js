import { loadObject, saveObject } from './itemStorage.js';

const CATEGORY_CAPS_KEY = 'orderCategoryCaps';
const ITEM_CAPS_KEY = 'orderItemCaps';

export const DEFAULT_ORDER_CAP_PERCENT = 150;

function parseCapValue(value) {
  if (value === '' || value == null) return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function normalizeCaps(obj = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const parsed = parseCapValue(value);
    if (parsed != null) {
      normalized[key] = parsed;
    }
  }
  return normalized;
}

async function loadCaps(key) {
  const stored = await loadObject(key);
  return normalizeCaps(stored);
}

async function saveCaps(key, caps) {
  const normalized = normalizeCaps(caps);
  await saveObject(key, normalized);
  return normalized;
}

export async function loadCategoryOrderCaps() {
  return await loadCaps(CATEGORY_CAPS_KEY);
}

export async function loadItemOrderCaps() {
  return await loadCaps(ITEM_CAPS_KEY);
}

export async function loadOrderQuantityCaps() {
  const [categoryCaps, itemCaps] = await Promise.all([
    loadCategoryOrderCaps(),
    loadItemOrderCaps()
  ]);
  return { categoryCaps, itemCaps };
}

export async function saveCategoryOrderCaps(caps) {
  return await saveCaps(CATEGORY_CAPS_KEY, caps);
}

export async function saveItemOrderCaps(caps) {
  return await saveCaps(ITEM_CAPS_KEY, caps);
}

export async function setCategoryOrderCap(category, value) {
  const caps = await loadCategoryOrderCaps();
  const parsed = parseCapValue(value);
  if (parsed == null) {
    delete caps[category];
  } else {
    caps[category] = parsed;
  }
  return await saveCategoryOrderCaps(caps);
}

export async function setItemOrderCap(itemName, value) {
  const caps = await loadItemOrderCaps();
  const parsed = parseCapValue(value);
  if (parsed == null) {
    delete caps[itemName];
  } else {
    caps[itemName] = parsed;
  }
  return await saveItemOrderCaps(caps);
}

export function resolveOrderCapPercent({
  itemName,
  categoryName,
  itemCaps = {},
  categoryCaps = {}
}) {
  const itemCap = parseCapValue(itemCaps[itemName]);
  if (itemCap != null) return itemCap;
  const categoryCap = parseCapValue(categoryCaps[categoryName]);
  if (categoryCap != null) return categoryCap;
  return DEFAULT_ORDER_CAP_PERCENT;
}

export function formatCapValue(value) {
  const parsed = parseCapValue(value);
  return parsed == null ? '' : parsed;
}
