import { getItemId } from './itemRegistry.js';

const ITEM_DETAILS_KEY = 'itemDetails';

export function loadItemDetails(ids) {
  return new Promise(resolve => {
    chrome.storage.local.get(ITEM_DETAILS_KEY, data => {
      const all = data[ITEM_DETAILS_KEY] || {};
      if (!ids) {
        resolve(all);
      } else {
        const map = {};
        ids.forEach(id => {
          map[id] = all[id] || null;
        });
        resolve(map);
      }
    });
  });
}

export function getItemDetail(id) {
  return new Promise(resolve => {
    chrome.storage.local.get(ITEM_DETAILS_KEY, data => {
      const all = data[ITEM_DETAILS_KEY] || {};
      resolve(all[id] || null);
    });
  });
}

export function setItemDetail(id, detail) {
  return new Promise(resolve => {
    chrome.storage.local.get(ITEM_DETAILS_KEY, data => {
      const all = data[ITEM_DETAILS_KEY] || {};
      all[id] = { ...(all[id] || {}), ...detail };
      chrome.storage.local.set({ [ITEM_DETAILS_KEY]: all }, () => resolve(all[id]));
    });
  });
}

export function removeItemDetail(id) {
  return new Promise(resolve => {
    chrome.storage.local.get(ITEM_DETAILS_KEY, data => {
      const all = data[ITEM_DETAILS_KEY] || {};
      if (all[id] !== undefined) {
        delete all[id];
        chrome.storage.local.set({ [ITEM_DETAILS_KEY]: all }, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

export function renameItemDetail(id, newName) {
  return new Promise(resolve => {
    chrome.storage.local.get(ITEM_DETAILS_KEY, data => {
      const all = data[ITEM_DETAILS_KEY] || {};
      if (all[id]) {
        all[id].name = newName;
        chrome.storage.local.set({ [ITEM_DETAILS_KEY]: all }, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

export async function migrateItemDetails() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(null, d => resolve(d));
  });
  const details = data[ITEM_DETAILS_KEY] || {};
  const removeKeys = [];
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
  await new Promise(resolve => {
    chrome.storage.local.set({ [ITEM_DETAILS_KEY]: details }, resolve);
  });
  if (removeKeys.length > 0) {
    await new Promise(resolve => {
      chrome.storage.local.remove(removeKeys, resolve);
    });
  }
}
