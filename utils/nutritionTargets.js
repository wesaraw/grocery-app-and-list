const STORAGE_KEY = 'nutritionTargets';
export const NUTRITION_TARGETS_STORAGE_KEY = STORAGE_KEY;

const ENERGY_UNITS = new Set(['kcal', 'kilocalorie', 'kilocalories']);
const IMPORTANCE_DIRECTIONS = new Set(['maximize', 'minimize']);

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

function toPositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  return Math.round(numeric);
}

function normalizeImportanceDirection(value, fallback = 'maximize') {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (IMPORTANCE_DIRECTIONS.has(normalized)) {
      return normalized;
    }
  }
  return fallback === 'minimize' ? 'minimize' : 'maximize';
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

function normalizeTargetEntry(definition, entry, options = {}) {
  if (!definition || !entry) return null;
  const { fallbackRank = 1, defaultDirection = 'maximize', usedRanks } = options || {};
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
  const rankSource =
    entry.importanceRank ?? entry.rank ?? entry.priority ?? entry.order ?? entry.position ?? fallbackRank;
  let importanceRank = toPositiveInteger(rankSource) || toPositiveInteger(fallbackRank) || 1;
  if (importanceRank <= 0) {
    importanceRank = 1;
  }
  if (usedRanks) {
    while (usedRanks.has(importanceRank)) {
      importanceRank += 1;
    }
    usedRanks.add(importanceRank);
  }
  const importanceDirection = normalizeImportanceDirection(
    entry.importanceDirection ?? entry.direction ?? entry.goalDirection ?? entry.goalType,
    defaultDirection
  );
  const rawUpperLimitValue =
    entry.upperLimitValue ??
    entry.upperLimit ??
    entry.safeUpperLimit ??
    entry.safeUpperLimitValue ??
    entry.safeUpperLimitAmount ??
    null;
  let upperLimitValue = null;
  let upperLimitUnit = null;
  let upperLimitBaseValue = null;
  const numericUpperLimit = toNumber(rawUpperLimitValue);
  if (numericUpperLimit != null && numericUpperLimit > 0) {
    const rawUpperLimitUnit =
      entry.upperLimitUnit ??
      entry.upperLimitUnits ??
      entry.safeUpperLimitUnit ??
      entry.safeUpperLimitUnits ??
      entry.upperLimitUom ??
      entry.safeUpperLimitUom ??
      entry.upperLimitMeasure ??
      entry.safeUpperLimitMeasure ??
      null;
    const resolvedUpperLimitUnit =
      definition.targetUnit === 'kcal'
        ? canonicalEnergyUnit(rawUpperLimitUnit) || unit
        : canonicalMassUnit(rawUpperLimitUnit) || unit;
    if (resolvedUpperLimitUnit && supportedUnits.includes(resolvedUpperLimitUnit)) {
      const convertedUpperLimit = convertToBase(
        numericUpperLimit,
        resolvedUpperLimitUnit,
        definition
      );
      if (convertedUpperLimit != null && convertedUpperLimit > baseValue) {
        upperLimitValue = numericUpperLimit;
        upperLimitUnit = resolvedUpperLimitUnit;
        upperLimitBaseValue = convertedUpperLimit;
      }
    }
  }

  return {
    value: numeric,
    unit,
    baseValue,
    importanceRank,
    importanceDirection,
    ...(upperLimitValue
      ? { upperLimitValue, upperLimitUnit, upperLimitBaseValue }
      : {})
  };
}

export function normalizeTargetMap(targets = {}, definitions = []) {
  const normalized = {};
  const usedRanks = new Set();
  definitions.forEach((definition, index) => {
    const rawEntry = targets[definition.key];
    if (!rawEntry) return;
    const normalizedEntry = normalizeTargetEntry(definition, rawEntry, {
      fallbackRank: index + 1,
      usedRanks,
      defaultDirection: 'maximize'
    });
    if (normalizedEntry) {
      normalized[definition.key] = {
        value: normalizedEntry.value,
        unit: normalizedEntry.unit,
        importanceRank: normalizedEntry.importanceRank,
        importanceDirection: normalizedEntry.importanceDirection,
        ...(normalizedEntry.upperLimitValue
          ? {
              upperLimitValue: normalizedEntry.upperLimitValue,
              upperLimitUnit: normalizedEntry.upperLimitUnit
            }
          : {})
      };
    }
  });
  return normalized;
}

export function buildTargetLookup(targets = {}, definitions = []) {
  const lookup = {};
  const usedRanks = new Set();
  definitions.forEach((definition, index) => {
    const entry = targets[definition.key];
    if (!entry) return;
    const normalizedEntry = normalizeTargetEntry(definition, entry, {
      fallbackRank: index + 1,
      usedRanks,
      defaultDirection: 'maximize'
    });
    if (!normalizedEntry) return;
    lookup[definition.key] = {
      key: definition.key,
      label: definition.label,
      value: normalizedEntry.value,
      unit: normalizedEntry.unit,
      baseValue: normalizedEntry.baseValue,
      targetUnit: definition.targetUnit,
      importanceRank: normalizedEntry.importanceRank,
      importanceDirection: normalizedEntry.importanceDirection,
      upperLimitValue: normalizedEntry.upperLimitValue,
      upperLimitUnit: normalizedEntry.upperLimitUnit,
      upperLimitBaseValue: normalizedEntry.upperLimitBaseValue
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
    const importanceRank = toPositiveInteger(entry.importanceRank);
    const importanceDirection = normalizeImportanceDirection(entry.importanceDirection);
    cloned[key] = {
      value: numeric,
      unit,
      ...(importanceRank ? { importanceRank } : {}),
      importanceDirection
    };
    const upperLimitNumeric = toNumber(entry.upperLimitValue);
    if (upperLimitNumeric != null && upperLimitNumeric > 0) {
      const upperLimitUnit = entry.upperLimitUnit || entry.upperLimitUnits || unit;
      if (upperLimitUnit) {
        cloned[key].upperLimitValue = upperLimitNumeric;
        cloned[key].upperLimitUnit = upperLimitUnit;
      }
    }
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
