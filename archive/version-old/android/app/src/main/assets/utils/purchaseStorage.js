const NAME_ID_KEY = 'purchaseNameMap';

function buildReverseMap(map) {
  const reverse = {};
  for (const [name, id] of Object.entries(map)) {
    reverse[id] = name;
  }
  return reverse;
}

export async function loadPurchases() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['purchases', NAME_ID_KEY], data => {
        const idMap = data[NAME_ID_KEY] || {};
        const reverse = buildReverseMap(idMap);
        const stored = data.purchases || {};
        const result = {};
        for (const [id, value] of Object.entries(stored)) {
          const name = reverse[id] || id;
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
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(NAME_ID_KEY, data => {
        const idMap = data[NAME_ID_KEY] || {};
        let nextId = Object.keys(idMap).length + 1;
        const stored = {};
        for (const [name, value] of Object.entries(purchases)) {
          let id = idMap[name];
          if (!id) {
            id = String(nextId++);
            idMap[name] = id;
          }
          stored[id] = value;
        }
        chrome.storage.local.set({ purchases: stored, [NAME_ID_KEY]: idMap }, () => resolve());
      });
    } catch (e) {
      resolve();
    }
  });
}
