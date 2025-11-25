import { canonicalName } from './nameUtils.js';
import { loadJSON } from './dataLoader.js';

const DEFAULT_EACH_WEIGHT_PATH = 'data/averageEachWeights.json';
let eachWeightCache = null;

function normalizeEachWeightEntry(entry) {
  if (!entry) return null;
  const gramsPerEach = Number(entry.gramsPerEach || entry.grams_per_each || entry.grams);
  if (!Number.isFinite(gramsPerEach) || gramsPerEach <= 0) return null;
  const normalized = canonicalName(entry.canonicalName || entry.name);
  if (!normalized) return null;
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map(alias => canonicalName(alias)).filter(Boolean)
    : [];
  return {
    canonicalName: normalized,
    aliases,
    gramsPerEach,
    source: entry.source || 'fdc',
    confidence: entry.confidence || null,
    fdcId: entry.fdcId || entry.fdc_id || null,
    updatedAt: entry.updatedAt || entry.updated_at || null
  };
}

export function setAverageEachWeights(data) {
  const map = {};
  const entries = Array.isArray(data) ? data : [];
  entries.forEach(entry => {
    const normalized = normalizeEachWeightEntry(entry);
    if (!normalized) return;
    map[normalized.canonicalName] = normalized;
    normalized.aliases.forEach(alias => {
      if (!map[alias]) {
        map[alias] = normalized;
      }
    });
  });
  eachWeightCache = map;
  return map;
}

export async function loadAverageEachWeights(path = DEFAULT_EACH_WEIGHT_PATH) {
  const data = await loadJSON(path);
  return setAverageEachWeights(data);
}

export function getAverageEachWeights() {
  return eachWeightCache;
}

export function attachAverageEachWeight(ingredient, eachWeights = eachWeightCache) {
  if (!ingredient || !eachWeights) return null;
  const key = canonicalName(ingredient.name || ingredient.display_name || ingredient.original_name);
  if (!key) return null;
  const entry = eachWeights[key];
  if (!entry) return null;
  ingredient.metadata = ingredient.metadata || {};
  ingredient.metadata.averageEachWeight = {
    gramsPerEach: entry.gramsPerEach,
    source: entry.source,
    confidence: entry.confidence,
    fdcId: entry.fdcId,
    updatedAt: entry.updatedAt
  };
  return ingredient.metadata.averageEachWeight;
}

export function mergeAverageEachWeights(ingredientMap, eachWeights = eachWeightCache) {
  if (!ingredientMap || typeof ingredientMap !== 'object') return ingredientMap;
  Object.values(ingredientMap).forEach(record => {
    attachAverageEachWeight(record, eachWeights);
  });
  return ingredientMap;
}

export const DEFAULT_AVERAGE_EACH_WEIGHT_PATH = DEFAULT_EACH_WEIGHT_PATH;

