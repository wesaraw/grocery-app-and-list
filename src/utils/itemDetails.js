import { db } from '../db.js';
import { getItemId } from './itemRegistry.js';

const ITEM_DETAILS_KEY = 'itemDetails';

async function loadAllDetails() {
  const rec = await db.lists.get(ITEM_DETAILS_KEY);
  return rec?.value || {};
}

async function saveAllDetails(map) {
  await db.lists.put({ key: ITEM_DETAILS_KEY, value: map });
}

export async function loadItemDetails(ids) {
  const all = await loadAllDetails();
  if (!ids) return all;
  const map = {};
  ids.forEach(id => {
    map[id] = all[id] || null;
  });
  return map;
}

export async function getItemDetail(id) {
  const all = await loadAllDetails();
  return all[id] || null;
}

export async function setItemDetail(id, detail) {
  const all = await loadAllDetails();
  all[id] = { ...(all[id] || {}), ...detail };
  await saveAllDetails(all);
  return all[id];
}

export async function removeItemDetail(id) {
  const all = await loadAllDetails();
  if (all[id] !== undefined) {
    delete all[id];
    await saveAllDetails(all);
  }
}

export async function renameItemDetail(id, newName) {
  const all = await loadAllDetails();
  if (all[id]) {
    all[id].name = newName;
    await saveAllDetails(all);
  }
}

export async function migrateItemDetails() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(null, d => resolve(d));
  });
  const details = { ...(await loadAllDetails()), ...(data[ITEM_DETAILS_KEY] || {}) };
  const removeKeys = [ITEM_DETAILS_KEY];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('final_product_')) {
      let idPart = key.slice('final_product_'.length);
      let id = idPart;
      if (isNaN(parseInt(idPart, 10))) {
        id = await getItemId(decodeURIComponent(idPart));
      }
      details[id] = { ...(details[id] || {}), ...value };
      removeKeys.push(key);
    } else if (key.startsWith('final_')) {
      let idPart = key.slice('final_'.length);
      let id = idPart;
      if (isNaN(parseInt(idPart, 10))) {
        id = await getItemId(decodeURIComponent(idPart));
      }
      if (typeof value === 'string') {
        details[id] = { ...(details[id] || {}), selectedStore: value };
      } else if (value && typeof value === 'object') {
        details[id] = { ...(details[id] || {}), ...value };
      }
      removeKeys.push(key);
    }
  }
  await saveAllDetails(details);
  if (removeKeys.length > 0) {
    await new Promise(resolve => {
      chrome.storage.local.remove(removeKeys, resolve);
    });
  }
}
