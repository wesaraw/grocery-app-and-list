const KEY = 'mealPriceCap';

export function loadMealPriceCap() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(KEY, data => {
        const val = data[KEY];
        resolve(val != null ? val : null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

export function saveMealPriceCap(val) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [KEY]: val }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}
