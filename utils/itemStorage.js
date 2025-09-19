const NAME_ID_KEY = 'itemNameMap';

function buildReverseMap(map) {
  const reverse = {};
  for (const [name, id] of Object.entries(map)) {
    reverse[id] = name;
  }
  return reverse;
}

function loadMap() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(NAME_ID_KEY, data => {
        const idMap = data[NAME_ID_KEY] || {};
        resolve(idMap);
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
      const { name, ...rest } = item;
      result.push({ ...rest, id });
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
    if (item && item.id != null && item.name == null) {
      const id = item.id;
      return { ...item, name: reverse[id] || id };
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
