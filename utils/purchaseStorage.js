import { getItemId, getItemName } from './itemRegistry.js';

export function loadPurchasesById() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('purchases', data => {
        resolve(data.purchases || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

export async function loadPurchases() {
  const stored = await loadPurchasesById();
  const result = {};
  for (const [id, value] of Object.entries(stored)) {
    const name = await getItemName(id);
    result[name] = value;
  }
  return result;
}

export async function savePurchases(purchases) {
  const stored = {};
  for (const [key, value] of Object.entries(purchases)) {
    const id = isNaN(parseInt(key, 10)) ? await getItemId(key) : key;
    stored[id] = value;
  }
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ purchases: stored }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}
