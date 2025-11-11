import { canonicalName } from './nameUtils.js';

const STORAGE_KEY = 'ingredientRecords';

function loadMap() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(STORAGE_KEY, data => {
        const map = data[STORAGE_KEY] || {};
        resolve({ ...map });
      });
    } catch (e) {
      resolve({});
    }
  });
}

function saveMap(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: map || {} }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

function resolveKey(name, normalizedName) {
  if (normalizedName) return normalizedName;
  if (!name) return null;
  return canonicalName(name);
}

export async function loadIngredients() {
  const map = await loadMap();
  return Object.values(map);
}

export async function getIngredientMap() {
  return await loadMap();
}

export async function getIngredientByItemName(name) {
  if (!name) return null;
  const key = canonicalName(name);
  const map = await loadMap();
  return map[key] || null;
}

export async function saveIngredient(record) {
  if (!record) return null;
  const map = await loadMap();
  const key = resolveKey(record.display_name || record.name, record.normalized_name);
  if (!key) return null;
  const previous = map[key] || {};
  const now = new Date().toISOString();
  const finalRecord = {
    id: previous.id || record.id || key,
    display_name: record.display_name || previous.display_name || record.name || key,
    normalized_name: key,
    unit_default: record.unit_default || previous.unit_default || 'g',
    fdc_id: record.fdc_id || previous.fdc_id || null,
    fdc_data_type: record.fdc_data_type || previous.fdc_data_type || null,
    fdc_description: record.fdc_description || previous.fdc_description || null,
    confidence: record.confidence ?? previous.confidence ?? null,
    last_checked_at: record.last_checked_at || previous.last_checked_at || now,
    perGramVector: record.perGramVector || previous.perGramVector || {},
    nutrients: record.nutrients || previous.nutrients || [],
    portions: record.portions || previous.portions || [],
    metadata: { ...previous.metadata, ...record.metadata }
  };
  map[key] = finalRecord;
  await saveMap(map);
  return finalRecord;
}

export async function updateIngredient(name, updates = {}) {
  if (!name) return null;
  const key = canonicalName(name);
  const map = await loadMap();
  if (!map[key]) return null;
  const merged = { ...map[key], ...updates };
  if (!merged.normalized_name) merged.normalized_name = key;
  map[key] = merged;
  await saveMap(map);
  return merged;
}

export async function removeIngredient(name) {
  if (!name) return;
  const key = canonicalName(name);
  const map = await loadMap();
  if (!map[key]) return;
  delete map[key];
  await saveMap(map);
}

export async function clearIngredients() {
  await saveMap({});
}

export { STORAGE_KEY as INGREDIENTS_STORAGE_KEY };
