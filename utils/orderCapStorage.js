import { loadObject, saveObject } from './itemStorage.js';

export const DEFAULT_ORDER_CAP = 1.5;

const CATEGORY_CAP_KEY = 'categoryOrderCaps';
const ITEM_CAP_KEY = 'itemOrderCaps';

function normalizeMultiplier(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

function sanitizeMap(map) {
  const result = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    if (!key) return;
    const mult = normalizeMultiplier(value);
    if (mult != null) {
      result[key] = mult;
    }
  });
  return result;
}

export async function loadCategoryCaps() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(CATEGORY_CAP_KEY, data => {
        const raw = data?.[CATEGORY_CAP_KEY] || {};
        resolve(sanitizeMap(raw));
      });
    } catch (e) {
      resolve({});
    }
  });
}

export async function saveCategoryCaps(map) {
  const sanitized = sanitizeMap(map);
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [CATEGORY_CAP_KEY]: sanitized }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

export async function loadItemCaps() {
  const raw = await loadObject(ITEM_CAP_KEY);
  return sanitizeMap(raw);
}

export async function saveItemCaps(map) {
  const sanitized = sanitizeMap(map);
  await saveObject(ITEM_CAP_KEY, sanitized);
}

export function percentToMultiplier(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num / 100;
}

export function multiplierToPercent(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return null;
  }
  return multiplier * 100;
}
