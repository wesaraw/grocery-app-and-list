import { canonicalName } from './nameUtils.js';
import { parseQuantity } from './calendarUtils.js';
import { computeNormalizedQuantity, convertWithDensity } from './unitNormalize.js';
import { convert } from './uomConverter.js';
import { loadJSON } from './dataLoader.js';

const MASS_UNIT_FACTORS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 1 / 1000,
  milligram: 1 / 1000,
  milligrams: 1 / 1000,
  mcg: 1 / 1000000,
  ug: 1 / 1000000,
  'µg': 1 / 1000000,
  microgram: 1 / 1000000,
  micrograms: 1 / 1000000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237
};

const VOLUME_UNITS = new Set([
  'ml',
  'milliliter',
  'milliliters',
  'l',
  'liter',
  'liters',
  'gal',
  'gallon',
  'gallons',
  'qt',
  'quart',
  'quarts',
  'pt',
  'pint',
  'pints',
  'cup',
  'cups',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'teaspoon',
  'teaspoons',
  'fl oz',
  'floz',
  'fluidounce',
  'fluidounces'
]);

const DEFAULT_GLOBAL_PATH = 'data/globalProduceMeasures.json';
let globalDefaultsCache = null;

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function roundValue(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1e6) / 1e6;
  return Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

function addTokenForms(set, token) {
  const normalized = typeof token === 'string' ? token.trim().toLowerCase() : '';
  if (!normalized) return;
  set.add(normalized);
  if (normalized.endsWith('es')) {
    set.add(normalized.slice(0, -2));
  }
  if (normalized.endsWith('s')) {
    set.add(normalized.slice(0, -1));
  } else {
    set.add(`${normalized}s`);
  }
}

function tokenize(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[^a-z0-9%]+/gi)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

function collectTokensFromStrings(set, ...values) {
  values.forEach(value => {
    tokenize(value).forEach(token => addTokenForms(set, token));
  });
}

function collectIngredientTokens(ingredient, record) {
  const tokens = new Set();
  if (ingredient) {
    collectTokensFromStrings(tokens, ingredient.name, ingredient.display_name, ingredient.original_name);
  }
  if (record) {
    collectTokensFromStrings(tokens, record.display_name, record.fdc_description, record.description, record.name);
  }
  return tokens;
}

function buildUnitVariants(unit, extraTokens = new Set()) {
  const variants = new Set();
  if (!unit) return variants;
  const base = unit.trim().toLowerCase();
  if (!base) return variants;
  variants.add(base);
  const singular = base.replace(/s$/, '');
  if (singular && singular !== base) variants.add(singular);
  if (base.endsWith('es')) variants.add(base.slice(0, -2));
  if (base === 'each' || base === 'ea') {
    variants.add('each');
    variants.add('ea');
    extraTokens.forEach(token => addTokenForms(variants, token));
  }
  return variants;
}

function normalizeMeasureEntry(entry, fallbackSource) {
  if (!entry) return null;
  const qty = toNumber(entry.qty ?? entry.amount ?? 1) || 1;
  const grams = toNumber(entry.grams ?? entry.gramWeight ?? entry.weight);
  if (!(grams > 0)) return null;
  const unit = (entry.unit || entry.measureUnit || '').trim();
  const label = (entry.label || entry.modifier || unit || '').trim() || 'portion';
  const source = entry.source || fallbackSource || 'local';
  const confidence = entry.confidence ?? null;
  const sizeTag = entry.sizeTag || entry.size || null;
  const updatedAt = entry.updatedAt || null;
  return { label, unit, qty, grams, source, confidence, sizeTag, updatedAt };
}

function normalizeGlobalDefaults(data) {
  if (!data) return {};
  const map = {};
  const entries = Array.isArray(data)
    ? data
    : Object.entries(data).map(([name, payload]) => ({ canonicalName: name, ...payload }));
  entries.forEach(entry => {
    if (!entry) return;
    const baseName = canonicalName(entry.canonicalName || entry.name);
    if (!baseName) return;
    const measures = Array.isArray(entry.measures)
      ? entry.measures
          .map(measure => ({ ...measure, source: 'global' }))
          .map(measure => normalizeMeasureEntry(measure, 'global'))
          .filter(Boolean)
      : [];
    if (!measures.length) return;
    map[baseName] = {
      defaultEachSize: entry.defaultEachSize || null,
      measures
    };
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    aliases.forEach(alias => {
      const key = canonicalName(alias);
      if (!key || map[key]) return;
      map[key] = map[baseName];
    });
  });
  return map;
}

export function setGlobalProduceMeasures(data) {
  globalDefaultsCache = normalizeGlobalDefaults(data);
  return globalDefaultsCache;
}

export async function loadGlobalProduceMeasures(path = DEFAULT_GLOBAL_PATH) {
  const data = await loadJSON(path);
  return setGlobalProduceMeasures(data);
}

export function getGlobalProduceMeasures() {
  return globalDefaultsCache;
}

function gramsFromKnownMass(value, unit) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!normalized) return null;
  const factor = MASS_UNIT_FACTORS[normalized];
  if (factor == null) return null;
  return roundValue(value * factor);
}

function convertQuantity(value, fromUnit, toUnit) {
  if (!Number.isFinite(value) || value <= 0) return null;
  try {
    const converted = convert(value, fromUnit, toUnit);
    return Number.isFinite(converted) && converted > 0 ? converted : null;
  } catch (err) {
    return null;
  }
}

function resolveViaMeasures(value, unit, measures, ingredientTokens, predicate) {
  if (!Array.isArray(measures) || !measures.length) return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const variants = buildUnitVariants(normalizedUnit, ingredientTokens);
  let fallback = null;
  for (const measure of measures) {
    if (!measure || (predicate && !predicate(measure))) continue;
    const normalizedMeasure = normalizeMeasureEntry(measure, measure.source);
    if (!normalizedMeasure) continue;
    const measureUnit = (normalizedMeasure.unit || '').trim().toLowerCase();
    const measureTokens = new Set();
    collectTokensFromStrings(measureTokens, normalizedMeasure.unit, normalizedMeasure.label);
    if (measureUnit && MASS_UNIT_FACTORS[measureUnit] != null && normalizedUnit) {
      if (measureUnit === normalizedUnit || variants.has(measureUnit)) {
        const grams = (value / normalizedMeasure.qty) * normalizedMeasure.grams;
        return {
          grams: roundValue(grams),
          source: normalizedMeasure.source,
          confidence: normalizedMeasure.confidence || null,
          sizeTag: normalizedMeasure.sizeTag || null
        };
      }
      continue;
    }
    if (!variants.size) continue;
    if (normalizedUnit === 'ea' || normalizedUnit === 'each') {
      ingredientTokens.forEach(token => addTokenForms(measureTokens, token));
    }
    let matched = false;
    if (measureUnit && variants.has(measureUnit)) {
      matched = true;
    } else {
      for (const token of measureTokens) {
        if (variants.has(token)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      if (!fallback && (measureUnit.includes('serving') || normalizedMeasure.label.toLowerCase().includes('serving'))) {
        fallback = normalizedMeasure;
      }
      continue;
    }
    const grams = (value / normalizedMeasure.qty) * normalizedMeasure.grams;
    return {
      grams: roundValue(grams),
      source: normalizedMeasure.source,
      confidence: normalizedMeasure.confidence || null,
      sizeTag: normalizedMeasure.sizeTag || null
    };
  }
  if (fallback && (normalizedUnit === 'ea' || normalizedUnit === 'each')) {
    const grams = (value / fallback.qty) * fallback.grams;
    return {
      grams: roundValue(grams),
      source: fallback.source,
      confidence: fallback.confidence || null,
      sizeTag: fallback.sizeTag || null
    };
  }
  return null;
}

function resolveViaPackageMath(value, unit, record, ingredient) {
  if (!record || typeof record !== 'object') return null;
  const metadata = record.metadata || {};
  let packCount = toNumber(metadata.packCount || metadata.pack_count || metadata.casePackCount);
  const sizeQty =
    toNumber(metadata.sizeQty || metadata.sizeQuantity || metadata.netWeightQty || metadata.netWeightQuantity) ||
    toNumber(metadata.size_quantity);
  const sizeUnit =
    metadata.sizeUnit || metadata.size_unit || metadata.netWeightUnit || metadata.net_weight_unit || metadata.netWeightUom;
  if (!(sizeQty > 0) || typeof sizeUnit !== 'string') return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const unitIsEach = normalizedUnit === 'each' || normalizedUnit === 'ea' || normalizedUnit === '';
  if (!unitIsEach) return null;
  const gramsPerPack = convertQuantity(sizeQty, sizeUnit, 'g');
  if (!(gramsPerPack > 0)) return null;
  if (!(packCount > 0)) {
    const averageEachWeight = metadata.averageEachWeight?.gramsPerEach || ingredient?.metadata?.averageEachWeight?.gramsPerEach;
    if (Number.isFinite(averageEachWeight) && averageEachWeight > 0) {
      const derivedPackCount = gramsPerPack / averageEachWeight;
      const roundedPackCount = roundValue(derivedPackCount);
      packCount = roundedPackCount;
      metadata.packCount = roundedPackCount;
      metadata.packCountSource = metadata.packCountSource || 'average-each-weight';
      if (!record.metadata) {
        record.metadata = metadata;
      }
    }
  }
  if (!(packCount > 0)) return null;
  const gramsPerEach = gramsPerPack / packCount;
  if (!(gramsPerEach > 0)) return null;
  const resolutionSource = metadata.packCountSource === 'average-each-weight' ? 'average-each-weight' : 'label';
  return {
    resolution: {
      grams: roundValue(value * gramsPerEach),
      source: resolutionSource,
      confidence: 'high',
      sizeTag: null
    },
    measure: {
      label: 'per-pack',
      unit: 'each',
      qty: 1,
      grams: roundValue(gramsPerEach),
      source: resolutionSource,
      confidence: 'high',
      sizeTag: null
    }
  };
}

function resolveViaGlobalDefaults(value, unit, ingredient, globalDefaults) {
  if (!globalDefaults) return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!(normalizedUnit === 'each' || normalizedUnit === 'ea' || normalizedUnit === '')) return null;
  const name = canonicalName(ingredient?.name || ingredient?.display_name || ingredient?.original_name);
  if (!name) return null;
  const record = globalDefaults[name];
  if (!record || !Array.isArray(record.measures) || !record.measures.length) return null;
  const chosen = record.measures.find(measure => (measure.sizeTag || '').toLowerCase() === (ingredient?.sizeTag || '').toLowerCase());
  const measure =
    chosen ||
    record.measures.find(m => (m.sizeTag || '').toLowerCase() === (record.defaultEachSize || '').toLowerCase()) ||
    record.measures[0];
  if (!measure) return null;
  return {
    resolution: {
      grams: roundValue((value / measure.qty) * measure.grams),
      source: 'global',
      confidence: measure.confidence || 'medium',
      sizeTag: measure.sizeTag || record.defaultEachSize || null
    },
    measure
  };
}

function buildDensitySettings(info = {}) {
  if (!info || typeof info !== 'object') return {};
  const settings = {};
  if (info.convert !== undefined) settings.convert_volume_to_weight = !!info.convert;
  if (info.ratio != null) settings.custom_density_ratio = info.ratio;
  if (info.normalized) settings.normalized = info.normalized;
  if (info.prepState) settings.prepState = info.prepState;
  return settings;
}

function resolveViaDensity(value, unit, densityInfo, record, ingredientTokens) {
  if (!densityInfo || densityInfo.convert === false) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!normalizedUnit) return null;
  const densitySettings = buildDensitySettings(densityInfo);
  const normalizedResult = computeNormalizedQuantity(value, normalizedUnit, densitySettings);
  if (
    normalizedResult &&
    normalizedResult.quantity != null &&
    normalizedResult.unit &&
    normalizedResult.unit !== normalizedUnit
  ) {
    const recursive = resolveViaDensity(
      normalizedResult.quantity,
      normalizedResult.unit,
      densityInfo,
      record,
      ingredientTokens
    );
    if (recursive) return recursive;
  }
  const measures = Array.isArray(record?.measures) ? record.measures : [];
  const viaMeasure = resolveViaMeasures(
    value,
    normalizedUnit,
    measures,
    ingredientTokens,
    densityInfo.__skipFdcPortions ? measure => measure.source !== 'fdc:portion' : () => true
  );
  if (viaMeasure) {
    const derivedSource =
      viaMeasure.source || (densityInfo.__fallback ? 'density:fallback' : densityInfo.source || 'density');
    return { ...viaMeasure, source: derivedSource };
  }
  const convertableUnit = MASS_UNIT_FACTORS[normalizedUnit] != null || VOLUME_UNITS.has(normalizedUnit) || densityInfo.normalized;
  if (!convertableUnit) return null;
  const ouncesViaDensity = convertWithDensity(value, normalizedUnit, 'oz', densitySettings);
  if (Number.isFinite(ouncesViaDensity) && ouncesViaDensity > 0) {
    const gramsFromOunces = gramsFromKnownMass(ouncesViaDensity, 'oz');
    if (gramsFromOunces != null) {
      const source = densityInfo.__fallback ? 'density:fallback' : densityInfo.source || 'density';
      return { grams: gramsFromOunces, source, confidence: densityInfo.confidence || 'low', sizeTag: null };
    }
  }
  if (MASS_UNIT_FACTORS[normalizedUnit] != null || VOLUME_UNITS.has(normalizedUnit)) {
    const converted = convertQuantity(value, normalizedUnit, 'g');
    if (converted != null) {
      const source = densityInfo.__fallback ? 'density:fallback' : densityInfo.source || 'density';
      return { grams: roundValue(converted), source, confidence: 'low', sizeTag: null };
    }
  }
  return null;
}

function resolveViaPrompt(value, unit, ingredient, promptForMeasure, persistResolvedMeasure) {
  if (typeof promptForMeasure !== 'function') return null;
  const response = promptForMeasure({ value, unit, ingredient });
  if (!response) return null;
  const qty = toNumber(response.qty) || 1;
  const grams = toNumber(response.grams);
  if (!(grams > 0)) return null;
  const normalizedUnit = (response.unit || unit || 'each').trim() || 'each';
  const label = response.label || 'user-entry';
  const source = response.source || 'user';
  const confidence = response.confidence || 'medium';
  const sizeTag = response.sizeTag || null;
  const total = roundValue((value / qty) * grams);
  if (persistResolvedMeasure) {
    persistResolvedMeasure({
      ingredient,
      measure: {
        label,
        unit: normalizedUnit,
        qty,
        grams,
        source,
        confidence,
        sizeTag
      }
    });
  }
  return { grams: total, source, confidence, sizeTag };
}

export function resolveIngredientAmount(ingredient, record, amountText, options = {}) {
  if (!ingredient || typeof ingredient !== 'object') {
    return { grams: null, reason: 'missing-ingredient' };
  }
  const amount = amountText || ingredient.amount || ingredient.serving_size;
  if (!amount || typeof amount !== 'string' || !amount.trim()) {
    return { grams: null, reason: 'missing-amount' };
  }
  const { value, unit } = parseQuantity(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { grams: null, reason: 'invalid-quantity' };
  }
  const rawUnit = typeof unit === 'string' ? unit.trim() : '';
  const normalizedUnit = rawUnit ? rawUnit.toLowerCase() : '';
  const effectiveUnit = normalizedUnit || rawUnit || '';
  const unitIsVolume = normalizedUnit && VOLUME_UNITS.has(normalizedUnit);
  const mass = gramsFromKnownMass(value, normalizedUnit || (rawUnit ? rawUnit.toLowerCase() : rawUnit));
  if (mass != null) {
    return { grams: mass, source: 'unit:mass', confidence: 'high', sizeTag: null };
  }
  const ingredientTokens = collectIngredientTokens(ingredient, record);
  const measures = Array.isArray(record?.measures) ? record.measures : [];
  if (!unitIsVolume) {
    const fdcMatch = resolveViaMeasures(
      value,
      effectiveUnit,
      measures,
      ingredientTokens,
      measure => measure.source === 'fdc:portion'
    );
    if (fdcMatch) {
      return fdcMatch;
    }
  }
  const packMatch = resolveViaPackageMath(value, effectiveUnit, record, ingredient);
  if (packMatch) {
    if (options.persistResolvedMeasure) {
      options.persistResolvedMeasure({ ingredient, measure: packMatch.measure });
    }
    return packMatch.resolution;
  }
  const localMatch = resolveViaMeasures(
    value,
    effectiveUnit,
    measures,
    ingredientTokens,
    measure => measure.source !== 'fdc:portion'
  );
  if (localMatch) {
    return localMatch;
  }
  const globalDefaults = options.globalDefaults || getGlobalProduceMeasures();
  const globalMatch = resolveViaGlobalDefaults(value, effectiveUnit, ingredient, globalDefaults);
  if (globalMatch) {
    if (options.persistResolvedMeasure) {
      options.persistResolvedMeasure({ ingredient, measure: globalMatch.measure });
    }
    return globalMatch.resolution;
  }
  const hasExplicitConvert =
    options.densityInfo && Object.prototype.hasOwnProperty.call(options.densityInfo, 'convert');
  let effectiveDensityInfo = options.densityInfo || null;
  if (!effectiveDensityInfo && unitIsVolume) {
    effectiveDensityInfo = { convert: true, ratio: 1, __fallback: true, __skipFdcPortions: true };
  } else if (effectiveDensityInfo && !hasExplicitConvert && unitIsVolume) {
    const existingRatio =
      effectiveDensityInfo.ratio != null
        ? effectiveDensityInfo.ratio
        : effectiveDensityInfo.custom_density_ratio;
    const merged = { ...effectiveDensityInfo, convert: true };
    if (existingRatio != null) {
      merged.ratio = existingRatio;
    } else {
      merged.ratio = 1;
      merged.__fallback = true;
    }
    merged.__skipFdcPortions = true;
    effectiveDensityInfo = merged;
  }
  const densityMatch = resolveViaDensity(
    value,
    effectiveUnit,
    effectiveDensityInfo,
    record,
    ingredientTokens
  );
  if (densityMatch) {
    return densityMatch;
  }
  if (unitIsVolume) {
    const deferredFdcMatch = resolveViaMeasures(
      value,
      effectiveUnit,
      measures,
      ingredientTokens,
      measure => measure.source === 'fdc:portion'
    );
    if (deferredFdcMatch) {
      return deferredFdcMatch;
    }
  }
  const promptMatch = resolveViaPrompt(
    value,
    effectiveUnit,
    ingredient,
    options.promptForMeasure,
    options.persistResolvedMeasure
  );
  if (promptMatch) {
    return promptMatch;
  }
  return { grams: null, reason: 'conversion-failed' };
}

export { MASS_UNIT_FACTORS, VOLUME_UNITS };
