import { canonicalName } from './nameUtils.js';

const STORAGE_KEY = 'ingredientRecords';
const DEFAULT_MEASURE_UPDATED_AT = '1970-01-01T00:00:00.000Z';

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

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function clonePortion(portion) {
  if (!portion) return null;
  return {
    id: portion.id ?? null,
    amount: portion.amount ?? null,
    measureUnit: portion.measureUnit || '',
    modifier: portion.modifier || '',
    gramWeight: portion.gramWeight ?? null
  };
}

function normalizeMeasureEntry(entry, fallbackUpdatedAt) {
  if (!entry) return null;
  const grams = toNumber(entry.grams ?? entry.gramWeight ?? entry.weight ?? null);
  if (!grams || grams <= 0) return null;
  const qty = toNumber(entry.qty ?? entry.amount ?? 1) || 1;
  const label = (entry.label || entry.modifier || entry.name || '').trim();
  const unit = (entry.unit || entry.measureUnit || '').trim();
  const source = entry.source || 'local';
  const confidence = entry.confidence ?? null;
  const sizeTag = entry.sizeTag || entry.size || null;
  const updatedAt = entry.updatedAt || fallbackUpdatedAt || DEFAULT_MEASURE_UPDATED_AT;

  return {
    label: label || unit || 'portion',
    unit: unit || 'each',
    qty,
    grams,
    source,
    confidence,
    sizeTag,
    updatedAt
  };
}

function convertPortionToMeasure(portion, fallbackUpdatedAt) {
  if (!portion) return null;
  const grams = toNumber(portion.gramWeight);
  if (!grams || grams <= 0) return null;
  const qty = toNumber(portion.amount) || 1;
  const label = (portion.modifier || '').trim();
  const unit = (portion.measureUnit || '').trim();
  return {
    label: label || unit || 'portion',
    unit: unit || 'portion',
    qty,
    grams,
    source: 'fdc:portion',
    confidence: 'medium',
    sizeTag: null,
    updatedAt: fallbackUpdatedAt || DEFAULT_MEASURE_UPDATED_AT
  };
}

export function normalizeIngredientRecord(record, options = {}) {
  if (!record) return null;
  const fallbackUpdatedAt = options.fallbackUpdatedAt || record.last_checked_at || DEFAULT_MEASURE_UPDATED_AT;
  const normalizedPortions = Array.isArray(record.portions) ? record.portions.map(clonePortion).filter(Boolean) : [];
  const existingMeasures = Array.isArray(record.measures) ? record.measures : [];

  const normalizedMeasures = existingMeasures
    .map(measure => normalizeMeasureEntry(measure, fallbackUpdatedAt))
    .filter(Boolean);

  if (!normalizedMeasures.length && normalizedPortions.length) {
    normalizedPortions.forEach(portion => {
      const converted = convertPortionToMeasure(portion, fallbackUpdatedAt);
      if (converted) normalizedMeasures.push(converted);
    });
  }

  const ediblePortion = record.ediblePortion;
  const cookYield = record.cookYield;
  const defaultEachSize = record.defaultEachSize;

  return {
    ...record,
    portions: normalizedPortions,
    measures: normalizedMeasures,
    ediblePortion: ediblePortion !== undefined ? ediblePortion : null,
    cookYield: cookYield !== undefined ? cookYield : null,
    defaultEachSize: defaultEachSize || null
  };
}

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (err) {
    return false;
  }
}

export function migrateIngredientMap(map = {}) {
  const migrated = {};
  let changed = false;
  Object.entries(map || {}).forEach(([key, record]) => {
    const normalized = normalizeIngredientRecord(record || {}, { fallbackUpdatedAt: record?.last_checked_at });
    migrated[key] = normalized;
    if (!changed && !deepEqual(record, normalized)) {
      changed = true;
    }
  });
  return { map: migrated, changed };
}

export async function loadIngredients() {
  const map = await getIngredientMap();
  return Object.values(map);
}

export async function getIngredientMap() {
  const raw = await loadMap();
  const { map, changed } = migrateIngredientMap(raw);
  if (changed) {
    await saveMap(map);
  }
  return map;
}

export async function getIngredientByItemName(name) {
  if (!name) return null;
  const key = canonicalName(name);
  const map = await getIngredientMap();
  return map[key] || null;
}

export function isIngredientNutritionExempt(record) {
  return record?.metadata?.nutritionExempt === true;
}

export async function setIngredientNutritionExempt(name, exempt = true) {
  if (!name) return null;
  const normalized = canonicalName(name);
  if (!normalized) return null;
  const existing = await getIngredientByItemName(name);
  const metadataUpdate = {};
  metadataUpdate.nutritionExempt = exempt ? true : undefined;
  const payload = {
    display_name: existing?.display_name || name,
    name,
    normalized_name: existing?.normalized_name || normalized,
    unit_default: existing?.unit_default || existing?.unitDefault || 'g',
    metadata: metadataUpdate,
    last_checked_at: existing?.last_checked_at || new Date().toISOString()
  };
  return await saveIngredient(payload);
}

export async function markIngredientNutritionExempt(name) {
  return await setIngredientNutritionExempt(name, true);
}

export async function clearIngredientNutritionExempt(name) {
  return await setIngredientNutritionExempt(name, false);
}

export async function saveIngredient(record) {
  if (!record) return null;
  const map = await loadMap();
  const key = resolveKey(record.display_name || record.name, record.normalized_name);
  if (!key) return null;

  const previousRaw = map[key];
  const previous = previousRaw ? normalizeIngredientRecord(previousRaw, { fallbackUpdatedAt: previousRaw.last_checked_at }) : {};
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
    portions: Array.isArray(record.portions) ? record.portions : previous.portions || [],
    measures: Array.isArray(record.measures) ? record.measures : previous.measures || [],
    ediblePortion: record.ediblePortion ?? previous.ediblePortion ?? null,
    cookYield: record.cookYield ?? previous.cookYield ?? null,
    defaultEachSize: record.defaultEachSize ?? previous.defaultEachSize ?? null,
    metadata: { ...previous.metadata, ...record.metadata }
  };

  const normalized = normalizeIngredientRecord(finalRecord, { fallbackUpdatedAt: finalRecord.last_checked_at || now });
  map[key] = normalized;
  await saveMap(map);
  return normalized;
}

export async function updateIngredient(name, updates = {}) {
  if (!name) return null;
  const key = canonicalName(name);
  const map = await loadMap();
  const existing = map[key];
  if (!existing) return null;

  const merged = {
    ...existing,
    ...updates,
    portions: updates.portions ?? existing.portions,
    measures: updates.measures ?? existing.measures,
    metadata: { ...existing.metadata, ...updates.metadata }
  };
  if (!merged.normalized_name) merged.normalized_name = key;

  const normalized = normalizeIngredientRecord(merged, { fallbackUpdatedAt: merged.last_checked_at });
  map[key] = normalized;
  await saveMap(map);
  return normalized;
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
