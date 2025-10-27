export const DEFAULT_ORDER_CAP_PERCENT = 150;
export const CATEGORY_CAP_STORAGE_KEY = 'categoryOrderCaps';
export const ITEM_CAP_PROPERTY = 'maxOrderPercent';

/**
 * Normalizes a value into a valid order-cap percentage.
 * Returns null when the value is empty, non-numeric, or non-positive.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeCapPercent(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }
  return numberValue;
}

function sanitizeCapsMap(map) {
  const sanitized = {};
  if (!map || typeof map !== 'object') {
    return sanitized;
  }
  for (const [categoryId, value] of Object.entries(map)) {
    const normalized = normalizeCapPercent(value);
    if (normalized !== null) {
      sanitized[categoryId] = normalized;
    }
  }
  return sanitized;
}

export async function loadCategoryCaps() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(CATEGORY_CAP_STORAGE_KEY, data => {
        const stored = data?.[CATEGORY_CAP_STORAGE_KEY];
        resolve(sanitizeCapsMap(stored));
      });
    } catch (e) {
      resolve({});
    }
  });
}

export async function saveCategoryCaps(categoryCaps) {
  const sanitized = sanitizeCapsMap(categoryCaps);
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(
        { [CATEGORY_CAP_STORAGE_KEY]: sanitized },
        () => resolve()
      );
    } catch (e) {
      resolve();
    }
  });
}
