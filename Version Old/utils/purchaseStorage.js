import { getItemId, getItemName } from './itemStorage.js';

export async function loadPurchases() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('purchases', async data => {
        const stored = data.purchases || {};
        const result = {};
        for (const [id, value] of Object.entries(stored)) {
          const name = await getItemName(id);
          result[name] = value;
        }
        resolve(result);
      });
    } catch (e) {
      resolve({});
    }
  });
}

export async function savePurchases(purchases) {
  const stored = {};
  for (const [name, value] of Object.entries(purchases)) {
    const id = await getItemId(name);
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
