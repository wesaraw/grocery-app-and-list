import { canonicalName } from './nameUtils.js';

export const PENDING_MATCH_KEY = 'pendingIngredientMatches';

function loadPendingMap() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(PENDING_MATCH_KEY, data => {
        resolve({ ...(data[PENDING_MATCH_KEY] || {}) });
      });
    } catch (e) {
      resolve({});
    }
  });
}

function savePendingMap(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [PENDING_MATCH_KEY]: map || {} }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

export async function getPendingMatches() {
  return await loadPendingMap();
}

export async function getPendingMatch(name) {
  if (!name) return null;
  const key = canonicalName(name);
  const map = await loadPendingMap();
  return map[key] || null;
}

export async function setPendingMatch(name, data) {
  if (!name || !data) return;
  const key = canonicalName(name);
  const map = await loadPendingMap();
  map[key] = {
    itemName: name,
    normalizedName: key,
    createdAt: new Date().toISOString(),
    ...data
  };
  await savePendingMap(map);
}

export async function removePendingMatch(name) {
  if (!name) return;
  const key = canonicalName(name);
  const map = await loadPendingMap();
  if (!map[key]) return;
  delete map[key];
  await savePendingMap(map);
}

export async function clearPendingMatches() {
  await savePendingMap({});
}
