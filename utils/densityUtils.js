import { convert } from './uomConverter.js';
import { normalizeUnit } from './priceUtils.js';

const DENSITY_KEY = 'densityData';

export function loadDensityData() {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve([]);
    } else {
      chrome.storage.local.get(DENSITY_KEY, data => {
        resolve(Array.isArray(data[DENSITY_KEY]) ? data[DENSITY_KEY] : []);
      });
    }
  });
}

export function saveDensityData(arr) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
    } else {
      chrome.storage.local.set({ [DENSITY_KEY]: arr }, () => resolve());
    }
  });
}

export async function getDensityRatio(itemName, store = null) {
  if (!itemName) return null;
  const data = await loadDensityData();
  const name = itemName.toLowerCase();
  const storeLower = store ? store.toLowerCase() : null;
  for (const rec of data) {
    const nMatch = rec.item_name && rec.item_name.toLowerCase() === name;
    const sMatch = !storeLower || (rec.store && rec.store.toLowerCase() === storeLower);
    if (nMatch && sMatch) return rec.density_ratio;
  }
  return null;
}

export async function setDensityRatio({
  itemName,
  store = null,
  measuredWeightG,
  sourceVolumeMl = 240,
  enteredByUser = true
}) {
  const data = await loadDensityData();
  const ratio = measuredWeightG / sourceVolumeMl;
  const name = itemName.toLowerCase();
  const storeLower = store ? store.toLowerCase() : null;
  let entry = data.find(
    e =>
      e.item_name &&
      e.item_name.toLowerCase() === name &&
      ((storeLower && e.store && e.store.toLowerCase() === storeLower) || (!storeLower && !e.store))
  );
  if (!entry) {
    entry = { item_name: itemName, store };
    data.push(entry);
  } else {
    entry.item_name = itemName; // keep casing from latest input
    entry.store = store;
  }
  entry.density_ratio = ratio;
  entry.source_volume_ml = sourceVolumeMl;
  entry.measured_weight_g = measuredWeightG;
  entry.entered_by_user = enteredByUser;
  entry.date = new Date().toISOString().split('T')[0];
  await saveDensityData(data);
  return ratio;
}

export async function convertVolumeToOunces(value, unit, itemName, store = null) {
  const u = normalizeUnit(unit);
  const ml = convert(value, u, 'ml');
  if (isNaN(ml)) return convert(value, unit, 'oz');
  const ratio = (await getDensityRatio(itemName, store)) ?? 1.0;
  const grams = ml * ratio;
  return convert(grams, 'g', 'oz');
}

