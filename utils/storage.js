import { loadJSON } from './dataLoader.js';

export function loadArray(key, path) {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get(key, async data => {
        if (data[key]) {
          resolve(data[key]);
        } else if (path) {
          const arr = await loadJSON(path);
          resolve(arr);
        } else {
          resolve([]);
        }
      });
    } catch (e) {
      if (path) {
        const arr = await loadJSON(path);
        resolve(arr);
      } else {
        resolve([]);
      }
    }
  });
}

export function loadStoredArray(key) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(key, data => resolve(data[key] || []));
    } catch (e) {
      resolve([]);
    }
  });
}

export function loadStoredObj(key) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(key, data => resolve(data[key] || {}));
    } catch (e) {
      resolve({});
    }
  });
}

export function loadPurchases() {
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

export function savePurchases(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ purchases: map }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}
