import { canonicalName } from './nameUtils.js';

export const PENDING_MATCH_KEY = 'pendingIngredientMatches';
export const ACTIVE_PENDING_MATCH_KEY = 'activePendingIngredientMatch';

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

function loadActiveEntry() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(ACTIVE_PENDING_MATCH_KEY, data => {
        resolve(data[ACTIVE_PENDING_MATCH_KEY] || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function saveActiveEntry(entry) {
  return new Promise(resolve => {
    try {
      if (entry) {
        chrome.storage.local.set({ [ACTIVE_PENDING_MATCH_KEY]: entry }, () => resolve());
      } else {
        chrome.storage.local.remove(ACTIVE_PENDING_MATCH_KEY, () => resolve());
      }
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

export async function getActivePendingMatchEntry() {
  return await loadActiveEntry();
}

export async function setActivePendingMatchEntry(entry) {
  if (!entry || !entry.itemName) {
    await clearActivePendingMatchEntry();
    return;
  }
  const normalizedName = entry.normalizedName || canonicalName(entry.itemName);
  if (!normalizedName) {
    await clearActivePendingMatchEntry();
    return;
  }
  const payload = {
    itemName: entry.itemName,
    normalizedName,
    updatedAt: new Date().toISOString()
  };
  if (entry.source) payload.source = entry.source;
  await saveActiveEntry(payload);
}

export async function clearActivePendingMatchEntry() {
  await saveActiveEntry(null);
}
