const NAME_ID_KEY = 'itemNameMap';

function buildReverseMap(map) {
  const reverse = {};
  for (const [name, id] of Object.entries(map)) {
    reverse[id] = name;
  }
  return reverse;
}

let mapHydrationPromise = null;

function collectNameEntries(val, out, visited = new WeakSet()) {
  if (!val || typeof val !== 'object') return;
  if (visited.has(val)) return;
  visited.add(val);
  if (Array.isArray(val)) {
    val.forEach(entry => collectNameEntries(entry, out, visited));
    return;
  }

  const id =
    val.id != null
      ? val.id
      : val.itemId != null
      ? val.itemId
      : val.item_id != null
      ? val.item_id
      : null;
  const name =
    typeof val.name === 'string'
      ? val.name
      : typeof val.itemName === 'string'
      ? val.itemName
      : typeof val.item_name === 'string'
      ? val.item_name
      : null;

  if (name && name.trim().length > 0 && id != null && String(name) !== String(id)) {
    out[name] = String(id);
  }

  Object.values(val).forEach(child => {
    if (child && typeof child === 'object') {
      collectNameEntries(child, out, visited);
    }
  });
}

function loadSelected(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, data => resolve(data || {}));
    } catch (e) {
      resolve({});
    }
  });
}

async function rebuildNameMap() {
  const sources = await loadSelected([
    NAME_ID_KEY,
    'yearlyNeeds',
    'monthlyConsumption',
    'expirationData',
    'currentStock'
  ]);

  const existing = sources[NAME_ID_KEY] || {};
  const needsHydration = Object.keys(existing).length > 0 &&
    Object.entries(existing).every(([name, id]) => {
      if (name == null) return true;
      const trimmed = String(name).trim();
      if (!trimmed) return true;
      if (trimmed === String(id)) return true;
      return /^\d+$/.test(trimmed);
    });

  if (!needsHydration) {
    return existing;
  }

  const rebuilt = {};
  ['yearlyNeeds', 'monthlyConsumption', 'expirationData', 'currentStock'].forEach(key => {
    collectNameEntries(sources[key], rebuilt);
  });

  if (Object.keys(rebuilt).length === 0) {
    return existing;
  }

  // Preserve any existing non-numeric entries
  Object.entries(existing).forEach(([name, id]) => {
    if (!rebuilt[name]) {
      rebuilt[name] = id;
    }
  });

  await saveMap(rebuilt);
  return rebuilt;
}

function loadMap() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(NAME_ID_KEY, async data => {
        const idMap = data[NAME_ID_KEY] || {};
        if (!mapHydrationPromise) {
          mapHydrationPromise = rebuildNameMap().finally(() => {
            mapHydrationPromise = null;
          });
        }
        let hydrated = idMap;
        try {
          const rebuilt = await mapHydrationPromise;
          if (rebuilt && Object.keys(rebuilt).length) {
            hydrated = rebuilt;
          }
        } catch (e) {
          hydrated = idMap;
        }
        resolve(hydrated);
      });
    } catch (e) {
      resolve({});
    }
  });
}

function saveMap(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [NAME_ID_KEY]: map }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

export async function getItemNameMap() {
  const map = await loadMap();
  return { ...map };
}

export async function saveItemNameMap(map) {
  await saveMap(map || {});
}

export function nextUnusedItemId(map, extraIds = []) {
  let max = 0;
  const consider = val => {
    if (val == null) return;
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && num > max) {
      max = num;
    }
  };
  Object.values(map || {}).forEach(consider);
  (Array.isArray(extraIds) ? extraIds : []).forEach(consider);
  return String(max + 1);
}

export async function getItemId(name) {
  const map = await loadMap();
  if (map[name]) return map[name];
  const id = String(Object.keys(map).length + 1);
  map[name] = id;
  await saveMap(map);
  return id;
}

export async function getItemName(id) {
  const map = await loadMap();
  const reverse = buildReverseMap(map);
  return reverse[id] || id;
}

export async function convertArrayToIds(arr) {
  const result = [];
  for (const item of arr) {
    if (item && item.name != null && item.id == null) {
      const id = await getItemId(item.name);
      result.push({ ...item, id });
    } else if (item && item.id != null) {
      result.push({ ...item, id: String(item.id) });
    } else {
      result.push(item);
    }
  }
  return result;
}

export async function convertArrayToNames(arr) {
  const map = await loadMap();
  const reverse = buildReverseMap(map);
  return arr.map(item => {
    if (item && item.id != null) {
      const id = String(item.id);
      const mapped = reverse[id];
      if (mapped && mapped !== item.name) {
        return { ...item, name: mapped };
      }
      if (item.name == null) {
        return { ...item, name: mapped || id };
      }
    }
    return item;
  });
}

export async function convertObjectKeysToIds(obj) {
  const result = {};
  for (const [name, val] of Object.entries(obj || {})) {
    if (name == null) continue;
    const id = await getItemId(name);
    result[id] = val;
  }
  return result;
}

export async function convertObjectKeysToNames(obj) {
  const map = await loadMap();
  const reverse = buildReverseMap(map);
  const result = {};
  for (const [id, val] of Object.entries(obj || {})) {
    const name = reverse[id] || id;
    result[name] = val;
  }
  return result;
}

export async function loadArray(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, async data => {
      const arr = data[key] || [];
      let stored = arr;
      if (arr.some(it => it && it.name != null && it.id == null)) {
        stored = await convertArrayToIds(arr);
        chrome.storage.local.set({ [key]: stored });
      }
      const withNames = await convertArrayToNames(stored);
      const needsUpdate = Array.isArray(stored)
        ? stored.some((item, idx) => {
            const updated = withNames[idx];
            if (!item || !updated) return false;
            return item.name !== updated.name;
          })
        : false;
      if (needsUpdate) {
        const rewritten = await convertArrayToIds(withNames);
        chrome.storage.local.set({ [key]: rewritten });
      }
      resolve(withNames);
    });
  });
}

export async function saveArray(key, arr) {
  const stored = await convertArrayToIds(arr);
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: stored }, () => resolve());
  });
}

export async function loadObject(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, async data => {
      const obj = data[key] || {};
      let stored = obj;
      const hasNameKeys = Object.keys(obj).some(k => isNaN(parseInt(k, 10)));
      if (hasNameKeys) {
        stored = await convertObjectKeysToIds(obj);
        chrome.storage.local.set({ [key]: stored });
      }
      const withNames = await convertObjectKeysToNames(stored);
      resolve(withNames);
    });
  });
}

export async function saveObject(key, obj) {
  const stored = await convertObjectKeysToIds(obj);
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: stored }, () => resolve());
  });
}
