const STORAGE_KEY = 'nutritionTargets';
export const NUTRITION_TARGETS_STORAGE_KEY = STORAGE_KEY;

const ENERGY_UNITS = new Set(['kcal', 'kilocalorie', 'kilocalories']);

function normalizeUnit(unit) {
  if (!unit) return '';
  return String(unit)
    .trim()
    .toLowerCase();
}

function canonicalMassUnit(unit) {
  const normalized = normalizeUnit(unit);
  if (normalized === 'mg' || normalized === 'milligram' || normalized === 'milligrams') {
    return 'mg';
  }
  if (
    normalized === 'mcg' ||
    normalized === 'ug' ||
    normalized === 'µg' ||
    normalized === 'microgram' ||
    normalized === 'micrograms'
  ) {
    return 'mcg';
  }
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') {
    return 'g';
  }
  return null;
}

function canonicalEnergyUnit(unit) {
  const normalized = normalizeUnit(unit);
  if (ENERGY_UNITS.has(normalized)) {
    return 'kcal';
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

export function convertGramsToMilligrams(value) {
  if (!Number.isFinite(value)) return null;
  return value * 1000;
}

export function convertMilligramsToGrams(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1000;
}

export function convertBetweenMassUnits(value, fromUnit, toUnit) {
  if (!Number.isFinite(value)) return null;
  const from = canonicalMassUnit(fromUnit);
  const to = canonicalMassUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return value;
  const massFactors = { g: 1, mg: 1 / 1000, mcg: 1 / 1000000 };
  const fromFactor = massFactors[from];
  const toFactor = massFactors[to];
  if (fromFactor == null || toFactor == null) return null;
  const grams = value * fromFactor;
  return grams / toFactor;
}

export function convertGramsToMicrograms(value) {
  if (!Number.isFinite(value)) return null;
  return value * 1000000;
}

export function convertMicrogramsToGrams(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1000000;
}

export function convertMilligramsToMicrograms(value) {
  if (!Number.isFinite(value)) return null;
  return value * 1000;
}

export function convertMicrogramsToMilligrams(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1000;
}

function convertToBase(value, unit, definition) {
  if (!definition) return null;
  if (!Number.isFinite(value)) return null;
  if (definition.targetUnit === 'kcal') {
    const energyUnit = canonicalEnergyUnit(unit);
    return energyUnit ? value : null;
  }
  const canonicalUnit = canonicalMassUnit(unit);
  if (!canonicalUnit) return null;
  if (canonicalUnit === 'g') {
    return value;
  }
  if (canonicalUnit === 'mg') {
    return convertMilligramsToGrams(value);
  }
  if (canonicalUnit === 'mcg') {
    return convertMicrogramsToGrams(value);
  }
  return null;
}

function convertFromBase(value, unit, definition) {
  if (!definition) return null;
  if (!Number.isFinite(value)) return null;
  if (definition.targetUnit === 'kcal') {
    const energyUnit = canonicalEnergyUnit(unit);
    return energyUnit ? value : null;
  }
  const canonicalUnit = canonicalMassUnit(unit);
  if (!canonicalUnit) return null;
  if (canonicalUnit === 'g') {
    return value;
  }
  if (canonicalUnit === 'mg') {
    return convertGramsToMilligrams(value);
  }
  if (canonicalUnit === 'mcg') {
    return convertGramsToMicrograms(value);
  }
  return null;
}

export function getSupportedUnitsForDefinition(definition) {
  if (!definition) return [];
  if (definition.targetUnit === 'kcal') {
    return ['kcal'];
  }
  return ['g', 'mg', 'mcg'];
}

export function getDefaultUnitForDefinition(definition) {
  if (!definition) return 'g';
  if (definition.targetUnit === 'kcal') {
    return 'kcal';
  }
  const display = normalizeUnit(definition.displayUnit);
  if (display === 'mg' || display === 'milligram' || display === 'milligrams') {
    return 'mg';
  }
  if (
    display === 'mcg' ||
    display === 'ug' ||
    display === 'µg' ||
    display === 'microgram' ||
    display === 'micrograms'
  ) {
    return 'mcg';
  }
  return 'g';
}

function normalizeTargetEntry(definition, entry) {
  if (!definition || !entry) return null;
  const rawValue = entry.value ?? entry.amount ?? entry.target ?? entry.goal ?? entry.number ?? entry;
  const numeric = toNumber(rawValue);
  if (numeric == null || numeric <= 0) {
    return null;
  }
  const rawUnit = entry.unit || entry.units || entry.uom || entry.measure || null;
  const supportedUnits = getSupportedUnitsForDefinition(definition);
  let unit = null;
  if (definition.targetUnit === 'kcal') {
    unit = canonicalEnergyUnit(rawUnit) || 'kcal';
  } else {
    unit = canonicalMassUnit(rawUnit);
    if (!unit) {
      unit = supportedUnits.includes('mg') ? 'mg' : 'g';
    }
  }
  if (!unit || !supportedUnits.includes(unit)) {
    return null;
  }
  const baseValue = convertToBase(numeric, unit, definition);
  if (baseValue == null || baseValue <= 0) {
    return null;
  }
  return { value: numeric, unit, baseValue };
}

export function normalizeTargetMap(targets = {}, definitions = []) {
  const normalized = {};
  definitions.forEach(definition => {
    const rawEntry = targets[definition.key];
    if (!rawEntry) return;
    const normalizedEntry = normalizeTargetEntry(definition, rawEntry);
    if (normalizedEntry) {
      normalized[definition.key] = { value: normalizedEntry.value, unit: normalizedEntry.unit };
    }
  });
  return normalized;
}

export function buildTargetLookup(targets = {}, definitions = []) {
  const lookup = {};
  definitions.forEach(definition => {
    const entry = targets[definition.key];
    if (!entry) return;
    const normalizedEntry = normalizeTargetEntry(definition, entry);
    if (!normalizedEntry) return;
    lookup[definition.key] = {
      key: definition.key,
      label: definition.label,
      value: normalizedEntry.value,
      unit: normalizedEntry.unit,
      baseValue: normalizedEntry.baseValue,
      targetUnit: definition.targetUnit
    };
  });
  return lookup;
}

function cloneTargetsForStorage(targets) {
  const cloned = {};
  Object.entries(targets || {}).forEach(([key, entry]) => {
    if (!entry) return;
    const numeric = toNumber(entry.value);
    if (numeric == null || numeric <= 0) return;
    const unit = entry.unit || entry.units || entry.uom;
    if (!unit) return;
    cloned[key] = { value: numeric, unit };
  });
  return cloned;
}

export function loadNutritionTargets(definitions = []) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(STORAGE_KEY, data => {
        const raw = data?.[STORAGE_KEY] || {};
        const normalized = normalizeTargetMap(raw, definitions);
        resolve(normalized);
      });
    } catch (err) {
      resolve({});
    }
  });
}

export function saveNutritionTargets(targets = {}) {
  return new Promise(resolve => {
    try {
      const toStore = cloneTargetsForStorage(targets);
      chrome.storage.local.set({ [STORAGE_KEY]: toStore }, () => resolve());
    } catch (err) {
      resolve();
    }
  });
}

export function convertTargetValueToUnit(baseValue, unit, definition) {
  return convertFromBase(baseValue, unit, definition);
}

export function convertTargetValueToBase(value, unit, definition) {
  return convertToBase(value, unit, definition);
}

export async function loadNutritionTargetLookup(definitions = []) {
  const targets = await loadNutritionTargets(definitions);
  return buildTargetLookup(targets, definitions);
}

export default {
  loadNutritionTargets,
  saveNutritionTargets,
  normalizeTargetMap,
  buildTargetLookup,
  loadNutritionTargetLookup,
  convertBetweenMassUnits,
  convertGramsToMilligrams,
  convertMilligramsToGrams,
  convertGramsToMicrograms,
  convertMicrogramsToGrams,
  convertMilligramsToMicrograms,
  convertMicrogramsToMilligrams,
  getSupportedUnitsForDefinition,
  getDefaultUnitForDefinition,
  convertTargetValueToUnit,
  convertTargetValueToBase
};
