// Utility functions for normalizing units and handling volume to weight ratios
import { convert } from './uomConverter.js';
import { UNIT_ALIASES } from './priceUtils.js';
import { convertObjectKeysToNames, convertObjectKeysToIds } from './itemStorage.js';

const VOLUME_UNITS = new Set(['floz', 'fl oz', 'ml', 'l', 'gal', 'qt', 'pt', 'cup', 'tbsp', 'tsp']);
const WEIGHT_UNITS = new Set(['oz', 'lb', 'g', 'kg']);

const PREP_STATES = new Set(['cooked', 'dry']);

const VOLUME_TO_ML = {
  'ml': 1,
  'l': 1000,
  'floz': 29.5735,
  'fl oz': 29.5735,
  'gal': 3785.41,
  'qt': 946.353,
  'pt': 473.176,
  'cup': 240,
  'tbsp': 15,
  'tsp': 5
};

export function convertToWeightFromVolume(volumeMl, densityRatio = 1.0) {
  if (!volumeMl || isNaN(volumeMl)) return null;
  const grams = volumeMl * densityRatio;
  return grams / 28.35; // return ounces
}

export async function userDensityCalibration(itemName, measuredWeightG) {
  const ratio = measuredWeightG / 240;
  const map = await loadDensityMap();
  if (!map[itemName]) map[itemName] = { convert: true, ratio };
  else map[itemName].ratio = ratio;
  await saveDensityMap(map);
  return ratio;
}

const DENSITY_KEY = 'densityRatios';

/**
 * A density map entry may contain an optional normalized conversion describing how to map
 * a measured unit into a user-defined unit. The normalized object is persisted with the
 * following shape:
 * {
 *   fromUnit: string,
 *   fromValue: number,
 *   toUnit: string,
 *   toValue: number,
 *   fromState?: 'cooked' | 'dry',
 *   toState?: 'cooked' | 'dry'
 * }
 */

function sanitizeState(value) {
  if (!value || typeof value !== 'string') return '';
  const lower = value.trim().toLowerCase();
  return PREP_STATES.has(lower) ? lower : '';
}

function sanitizeNormalizedEntry(normalized) {
  if (!normalized || typeof normalized !== 'object') return null;
  const fromUnit = typeof normalized.fromUnit === 'string' ? normalized.fromUnit.trim() : '';
  const toUnit = typeof normalized.toUnit === 'string' ? normalized.toUnit.trim() : '';
  const fromValue = Number(normalized.fromValue);
  const toValue = Number(normalized.toValue);
  if (!fromUnit || !toUnit) return null;
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue) || fromValue === 0) return null;

  const cleaned = {
    fromUnit,
    toUnit,
    fromValue,
    toValue,
  };

  const rawFromState = typeof normalized.fromState === 'string' ? normalized.fromState.trim() : '';
  const rawToState = typeof normalized.toState === 'string' ? normalized.toState.trim() : '';
  const fromState = sanitizeState(rawFromState);
  const toState = sanitizeState(rawToState);
  const hasStateInput = Boolean(rawFromState) || Boolean(rawToState);

  if (hasStateInput) {
    if (!fromState || !toState) return null;
    cleaned.fromState = fromState;
    cleaned.toState = toState;
  }

  return cleaned;
}

function sanitizeDensityEntry(entry) {
  if (!entry || typeof entry !== 'object') return {};
  const { normalized, ...rest } = entry;
  const sanitized = { ...rest };
  const prepState = sanitizeState(rest.prepState);
  if (prepState) sanitized.prepState = prepState;
  else delete sanitized.prepState;
  const cleanNormalized = sanitizeNormalizedEntry(normalized);
  if (cleanNormalized) {
    sanitized.normalized = cleanNormalized;
  }
  return sanitized;
}

export function loadDensityMap() {
  return new Promise(resolve => {
    chrome.storage.local.get(DENSITY_KEY, async data => {
      const raw = data[DENSITY_KEY] || {};
      const withNames = await convertObjectKeysToNames(raw);
      if (raw && Object.keys(raw).some(k => isNaN(parseInt(k, 10)))) {
        const stored = await convertObjectKeysToIds(withNames);
        chrome.storage.local.set({ [DENSITY_KEY]: stored });
      }
      const sanitized = {};
      Object.entries(withNames || {}).forEach(([name, entry]) => {
        sanitized[name] = sanitizeDensityEntry(entry);
      });
      resolve(sanitized);
    });
  });
}

export function saveDensityMap(map) {
  const sanitized = {};
  Object.entries(map || {}).forEach(([name, entry]) => {
    sanitized[name] = sanitizeDensityEntry(entry);
  });
  return new Promise(resolve => {
    convertObjectKeysToIds(sanitized).then(stored => {
      chrome.storage.local.set({ [DENSITY_KEY]: stored }, () => resolve());
    });
  });
}

function parseQuantity(text) {
  if (!text) return [null, null];
  let normalized = text.toLowerCase();
  for (const [word, abbr] of Object.entries(UNIT_ALIASES)) {
    const r = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(r, abbr);
  }
  const m = normalized.match(/([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|doz|dozen|halfdoz|half\-doz|halfdozen|half\-dozen)/i);
  if (m) {
    let unit = m[2].toLowerCase().replace(/\s+/g, '');
    if (unit === 'floz') unit = 'fl oz';
    unit = UNIT_ALIASES[unit] || unit;
    return [parseFloat(m[1]), unit];
  }
  const num = parseFloat(normalized);
  if (!isNaN(num)) return [num, 'ea'];
  return [null, null];
}

export function normalizeUnit(settings = {}, quantityStr) {
  const [qty, unit] = parseQuantity(quantityStr);
  if (qty == null || !unit) return { quantity: null, unit: null };
  const convertVol = settings.convert_volume_to_weight;
  const ratio = settings.custom_density_ratio != null ? settings.custom_density_ratio : 1.0;
  const key = unit.toLowerCase();
  if (convertVol) {
    if (VOLUME_UNITS.has(key)) {
      const ml = qty * (VOLUME_TO_ML[key] || 1);
      const oz = convertToWeightFromVolume(ml, ratio);
      return { quantity: oz, unit: 'oz' };
    }
    const oz = convert(qty, key, 'oz');
    return { quantity: oz, unit: 'oz' };
  }
  if (VOLUME_UNITS.has(key)) {
    const ml = qty * (VOLUME_TO_ML[key] || 1);
    const floz = ml / 29.5735;
    return { quantity: floz, unit: 'fl oz' };
  }
  const oz = convert(qty, key, 'oz');
  return { quantity: oz, unit: 'oz' };
}


export function convertWithDensity(qty, fromUnit, toUnit = 'oz', settings = {}) {
  if (qty == null) return null;
  if (!fromUnit || !toUnit) return qty;
  const ratio =
    settings.custom_density_ratio != null ? settings.custom_density_ratio : 1.0;
  const convertVol = settings.convert_volume_to_weight;
  let fromKey = fromUnit.toLowerCase();
  let toKey = toUnit.toLowerCase();
  if (fromKey === 'floz') fromKey = 'fl oz';
  if (toKey === 'floz') toKey = 'fl oz';
  if (convertVol && VOLUME_UNITS.has(fromKey) && WEIGHT_UNITS.has(toKey)) {
    const ml = qty * (VOLUME_TO_ML[fromKey] || 1);
    return convertToWeightFromVolume(ml, ratio);
  }
  return convert(qty, fromKey, toKey);
}

export function computeNormalizedQuantity(quantity, unit, settings = {}) {
  if (quantity == null || !unit || !settings || typeof settings !== 'object') {
    return null;
  }
  const sourceUnit = typeof unit === 'string' ? unit.trim() : '';
  if (!sourceUnit) return null;
  const normalized = sanitizeNormalizedEntry(settings.normalized);
  if (!normalized) return null;
  const { fromUnit, fromValue, toUnit, toValue } = normalized;
  if (typeof toUnit === 'string' && toUnit.trim().toLowerCase() === sourceUnit.toLowerCase()) {
    return null;
  }
  const converted = convertWithDensity(quantity, sourceUnit, fromUnit, settings);
  if (converted == null || !Number.isFinite(converted)) return null;
  const normalizedQty = (converted / fromValue) * toValue;
  if (!Number.isFinite(normalizedQty)) return null;
  return { quantity: normalizedQty, unit: toUnit };
}
