import { db } from '../db.js';
import { getItemId, convertObjectKeysToIds } from './itemRegistry.js';

const SEARCH_RESULTS_KEY = 'searchResults';

async function loadAllResults() {
  await migrateSearchResults();
  const rec = await db.lists.get(SEARCH_RESULTS_KEY);
  let obj = rec?.value || {};
  const hasNameKeys = Object.keys(obj).some(k => isNaN(parseInt(k, 10)));
  if (hasNameKeys) {
    obj = await convertObjectKeysToIds(obj);
    await db.lists.put({ key: SEARCH_RESULTS_KEY, value: obj });
  }
  return obj;
}

function selectIds(all, ids) {
  if (!ids) return all;
  const res = {};
  ids.forEach(id => {
    res[id] = all[id] || {};
  });
  return res;
}

export async function loadSearchResults(ids) {
  const all = await loadAllResults();
  return selectIds(all, ids);
}

export async function getSearchResult(id, store) {
  const all = await loadAllResults();
  return all[id]?.[store] || null;
}

export async function setSearchResult(id, store, result) {
  const all = await loadAllResults();
  if (!all[id]) all[id] = {};
  all[id][store] = { ...(all[id][store] || {}), ...result };
  await db.lists.put({ key: SEARCH_RESULTS_KEY, value: all });
  return all[id][store];
}

export async function removeSearchResult(id, store) {
  const all = await loadAllResults();
  if (all[id]) {
    if (store) {
      delete all[id][store];
      if (Object.keys(all[id]).length === 0) delete all[id];
    } else {
      delete all[id];
    }
    await db.lists.put({ key: SEARCH_RESULTS_KEY, value: all });
  }
}

export async function migrateSearchResults() {
  let results = (await db.lists.get(SEARCH_RESULTS_KEY))?.value || {};
  let arr = [];

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await new Promise(resolve => {
      chrome.storage.local.get(['storeSelections', SEARCH_RESULTS_KEY], d => resolve(d));
    });
    results = { ...results, ...(data[SEARCH_RESULTS_KEY] || {}) };
    if (Array.isArray(data.storeSelections)) arr = data.storeSelections.slice();
    if (data.storeSelections !== undefined || data[SEARCH_RESULTS_KEY] !== undefined || arr.length > 0) {
      await new Promise(resolve => {
        chrome.storage.local.remove(['storeSelections', SEARCH_RESULTS_KEY], resolve);
      });
    }
  }

  const dbSelections = await db.lists.get('storeSelections');
  if (Array.isArray(dbSelections?.value)) {
    arr = arr.concat(dbSelections.value);
    await db.lists.delete('storeSelections');
  }

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

  const hasNameKeys = Object.keys(results).some(k => isNaN(parseInt(k, 10)));
  if (hasNameKeys) {
    results = await convertObjectKeysToIds(results);
  }

  await db.lists.put({ key: SEARCH_RESULTS_KEY, value: results });
  return results;
}

