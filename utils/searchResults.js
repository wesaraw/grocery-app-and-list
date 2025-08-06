import { getItemId, convertObjectKeysToIds } from './itemRegistry.js';

const SEARCH_RESULTS_KEY = 'searchResults';

export async function loadSearchResults(ids) {
  return new Promise(resolve => {
    chrome.storage.local.get([SEARCH_RESULTS_KEY, 'storeSelections'], async data => {
      if (Array.isArray(data.storeSelections)) {
        await migrateSearchResults();
        chrome.storage.local.get(SEARCH_RESULTS_KEY, d => resolve(selectIds(d[SEARCH_RESULTS_KEY] || {}, ids)));
      } else {
        let obj = data[SEARCH_RESULTS_KEY] || {};
        const hasNameKeys = Object.keys(obj).some(k => isNaN(parseInt(k, 10)));
        if (hasNameKeys) {
          obj = await convertObjectKeysToIds(obj);
          chrome.storage.local.set({ [SEARCH_RESULTS_KEY]: obj });
        }
        resolve(selectIds(obj, ids));
      }
    });
  });
}

function selectIds(all, ids) {
  if (!ids) return all;
  const res = {};
  ids.forEach(id => {
    res[id] = all[id] || {};
  });
  return res;
}

export function getSearchResult(id, store) {
  return new Promise(resolve => {
    chrome.storage.local.get(SEARCH_RESULTS_KEY, data => {
      const all = data[SEARCH_RESULTS_KEY] || {};
      resolve(all[id]?.[store] || null);
    });
  });
}

export function setSearchResult(id, store, result) {
  return new Promise(resolve => {
    chrome.storage.local.get(SEARCH_RESULTS_KEY, data => {
      const all = data[SEARCH_RESULTS_KEY] || {};
      if (!all[id]) all[id] = {};
      all[id][store] = { ...(all[id][store] || {}), ...result };
      chrome.storage.local.set({ [SEARCH_RESULTS_KEY]: all }, () => resolve(all[id][store]));
    });
  });
}

export function removeSearchResult(id, store) {
  return new Promise(resolve => {
    chrome.storage.local.get(SEARCH_RESULTS_KEY, data => {
      const all = data[SEARCH_RESULTS_KEY] || {};
      if (all[id]) {
        if (store) {
          delete all[id][store];
          if (Object.keys(all[id]).length === 0) delete all[id];
        } else {
          delete all[id];
        }
        chrome.storage.local.set({ [SEARCH_RESULTS_KEY]: all }, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

export async function migrateSearchResults() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['storeSelections', SEARCH_RESULTS_KEY], d => resolve(d));
  });
  let results = data[SEARCH_RESULTS_KEY] || {};
  const arr = Array.isArray(data.storeSelections) ? data.storeSelections : [];
  for (const entry of arr) {
    let id = entry.id;
    if (id == null && entry.name != null) {
      id = await getItemId(entry.name);
    }
    if (id == null) continue;
    if (!results[id]) results[id] = {};
    results[id][entry.store] = {
      price: entry.price ?? null,
      convertedQty: entry.convertedQty ?? null,
      pricePerUnit: entry.pricePerUnit ?? null,
      link: entry.link ?? null,
      image: entry.image ?? null
    };
  }
  await new Promise(resolve => {
    chrome.storage.local.set({ [SEARCH_RESULTS_KEY]: results }, resolve);
  });
  if (arr.length > 0 || data.storeSelections !== undefined) {
    await new Promise(resolve => {
      chrome.storage.local.remove('storeSelections', resolve);
    });
  }
  return results;
}

