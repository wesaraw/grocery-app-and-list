import { convertObjectKeysToNames, convertObjectKeysToIds } from './itemRegistry.js';

const PURCHASES_KEY = 'purchases';

export async function loadPurchases() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(PURCHASES_KEY, async data => {
        const stored = data[PURCHASES_KEY] || {};
        let toStore = stored;
        const hasNameKeys = Object.keys(stored).some(k => isNaN(parseInt(k, 10)));
        if (hasNameKeys) {
          toStore = await convertObjectKeysToIds(stored);
          chrome.storage.local.set({ [PURCHASES_KEY]: toStore });
        }
        const withNames = await convertObjectKeysToNames(toStore);
        resolve(withNames);
      });
    } catch (e) {
      resolve({});
    }
  });
}

export async function savePurchases(purchases) {
  const stored = await convertObjectKeysToIds(purchases);
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [PURCHASES_KEY]: stored }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}
