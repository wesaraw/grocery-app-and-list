// Utility functions for normalizing units and handling volume to weight ratios
import { convert } from './uomConverter.js';
import { UNIT_ALIASES } from './priceUtils.js';
import { convertObjectKeysToNames, convertObjectKeysToIds } from './itemRegistry.js';

const VOLUME_UNITS = new Set(['floz', 'fl oz', 'ml', 'l', 'gal', 'qt', 'pt', 'cup', 'tbsp', 'tsp']);
const WEIGHT_UNITS = new Set(['oz', 'lb', 'g', 'kg']);

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

export function loadDensityMap() {
  return new Promise(resolve => {
    chrome.storage.local.get(DENSITY_KEY, async data => {
      const raw = data[DENSITY_KEY] || {};
      const withNames = await convertObjectKeysToNames(raw);
      if (raw && Object.keys(raw).some(k => isNaN(parseInt(k, 10)))) {
        const stored = await convertObjectKeysToIds(withNames);
        chrome.storage.local.set({ [DENSITY_KEY]: stored });
      }
      resolve(withNames);
    });
  });
}

export function saveDensityMap(map) {
  return new Promise(resolve => {
    convertObjectKeysToIds(map).then(stored => {
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
