import { db } from '../db.js';
import { loadJSON } from './dataLoader.js';

function buildReverseMap(map) {
  const reverse = {};
  for (const [name, id] of Object.entries(map)) {
    reverse[id] = name;
  }
  return reverse;
}

async function loadMap() {
  const items = await db.items.toArray();
  const map = {};
  for (const it of items) {
    if (it.name) map[it.name] = it.id;
  }
  return map;
}

async function saveMap(map) {
  const existing = await db.items.toArray();
  const byId = new Map(existing.map(it => [it.id, it]));
  const records = [];
  for (const [name, id] of Object.entries(map)) {
    const rec = byId.get(id) || { id };
    rec.name = name;
    records.push(rec);
  }
  if (records.length) {
    await db.items.bulkPut(records);
  }
}

export async function getItemId(name) {
  const rec = await db.items.where('name').equals(name).first();
  if (rec) return rec.id;
  const id = String((await db.items.count()) + 1);
  await db.items.put({ id, name });
  return id;
}

export async function getItemName(id) {
  const rec = await db.items.get(id);
  return rec?.name || id;
}

export async function renameItemInRegistry(oldName, newName) {
  const rec = await db.items.where('name').equals(oldName).first();
  if (!rec) return null;
  rec.name = newName;
  await db.items.put(rec);
  return rec.id;
}

export async function convertArrayToIds(arr) {
  const result = [];
  for (const item of arr) {
    if (item) {
      let id = item.id;
      if (id == null && item.name != null) {
        id = await getItemId(item.name);
      }
      const { name, unit, ...rest } = item;
      result.push(id != null ? { ...rest, id } : { ...rest });
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
      const { id, ...rest } = item;
      return { ...rest, id, name: item.name != null ? item.name : reverse[id] || id };
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

async function getList(key) {
  const rec = await db.lists.get(key);
  return rec ? rec.value : undefined;
}

async function setList(key, value) {
  await db.lists.put({ key, value });
}

export async function loadArray(key) {
  let arr = (await getList(key)) || [];
  let stored = arr;
  if (arr.some(it => it && it.name != null)) {
    stored = await convertArrayToIds(arr);
    await setList(key, stored);
  }
  return convertArrayToNames(stored);
}

export async function saveArray(key, arr) {
  const stored = await convertArrayToIds(arr);
  await setList(key, stored);
}

export async function loadObject(key) {
  let obj = (await getList(key)) || {};
  let stored = obj;
  const hasNameKeys = Object.keys(obj).some(k => isNaN(parseInt(k, 10)));
  if (hasNameKeys) {
    stored = await convertObjectKeysToIds(obj);
    await setList(key, stored);
  }
  return convertObjectKeysToNames(stored);
}

export async function saveObject(key, obj) {
  const stored = await convertObjectKeysToIds(obj);
  await setList(key, stored);
}

export async function loadArrayWithFallback(key, path) {
  let arr = await getList(key);
  if (!arr && path) arr = await loadJSON(path);
  const stored = arr || [];
  let toStore = stored;
  if (stored.some(it => it && it.name != null)) {
    toStore = await convertArrayToIds(stored);
    await setList(key, toStore);
  }
  return convertArrayToNames(toStore);
}

export async function loadObjectWithFallback(key, path) {
  let obj = await getList(key);
  if (!obj && path) obj = await loadJSON(path);
  const stored = obj || {};
  let toStore = stored;
  const hasNameKeys = Object.keys(stored).some(k => isNaN(parseInt(k, 10)));
  if (hasNameKeys) {
    toStore = await convertObjectKeysToIds(stored);
    await setList(key, toStore);
  }
  return convertObjectKeysToNames(toStore);
}

export async function migrateItemRegistry() {
  const lists = await db.lists.toArray();
  for (const rec of lists) {
    const { key, value } = rec;
    let updated = null;
    if (Array.isArray(value)) {
      if (value.some(it => it && it.name != null)) {
        updated = await convertArrayToIds(value);
      }
    } else if (value && typeof value === 'object') {
      const hasNameKeys = Object.keys(value).some(k => isNaN(parseInt(k, 10)));
      if (hasNameKeys) {
        updated = await convertObjectKeysToIds(value);
      }
    }
    if (updated) {
      await setList(key, updated);
    }
  }
}

