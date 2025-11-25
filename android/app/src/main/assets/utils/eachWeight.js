import { canonicalName } from './nameUtils.js';
import { parseQuantity } from './calendarUtils.js';
import { resolveIngredientAmount } from './unitResolver.js';

const ROUNDING_PRECISION = 1e6;

function roundValue(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION;
  return Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

function lookupIngredientRecord(name, ingredientMap = {}) {
  if (!name) return null;
  const normalized = canonicalName(name);
  if (!normalized) return null;
  const direct = ingredientMap[normalized];
  if (direct) return direct;
  return ingredientMap[name] || null;
}

function lookupDensityInfo(name, densityMap = {}) {
  if (!name) return null;
  if (densityMap[name]) return densityMap[name];
  const normalized = canonicalName(name);
  if (densityMap[normalized]) return densityMap[normalized];
  return null;
}

function ingredientHasExplicitSize(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return false;
  const hasSizeUnit = typeof ingredient.sizeUnit === 'string' && ingredient.sizeUnit.trim().length > 0;
  const hasContainerUnit = typeof ingredient.containerUnit === 'string' && ingredient.containerUnit.trim().length > 0;
  const hasSizeAmount = Number.isFinite(ingredient.sizeAmount);
  const hasContainerQty = Number.isFinite(ingredient.containerQuantity);
  return hasSizeUnit || hasContainerUnit || hasSizeAmount || hasContainerQty;
}

export function deriveAverageEachWeight(ingredient, context = {}, options = {}) {
  if (!ingredient || typeof ingredient !== 'object' || !ingredient.name) return null;
  const parsed = parseQuantity(ingredient.amount || ingredient.serving_size || '');
  const normalizedUnit = typeof parsed?.unit === 'string' ? parsed.unit.toLowerCase() : '';
  const isEachUnit = !normalizedUnit || normalizedUnit === 'ea' || normalizedUnit === 'each';
  if (!isEachUnit) return null;
  if (ingredientHasExplicitSize(ingredient)) return null;

  const record = lookupIngredientRecord(ingredient.name, context.ingredientMap);
  if (!record) return null;
  const densityInfo = lookupDensityInfo(ingredient.name, context.densityMap);
  const resolver = typeof options.resolveIngredientAmount === 'function'
    ? options.resolveIngredientAmount
    : resolveIngredientAmount;

  let capturedMeasure = null;
  const resolution = resolver(
    { ...ingredient, amount: '1 each', unit: 'each', serving_size: '1 each' },
    record,
    null,
    {
      densityInfo,
      globalDefaults: context.globalProduceMeasures,
      persistResolvedMeasure: payload => {
        if (payload?.measure) capturedMeasure = payload.measure;
      }
    }
  );

  const grams = resolution?.grams;
  if (!(grams > 0)) return null;

  const perEach = capturedMeasure && capturedMeasure.qty
    ? capturedMeasure.grams / capturedMeasure.qty
    : grams;

  const gramsPerEach = perEach > 0 ? roundValue(perEach) : null;
  if (!(gramsPerEach > 0)) return null;

  return {
    gramsPerEach,
    source: capturedMeasure?.source || resolution?.source || null,
    confidence: capturedMeasure?.confidence || resolution?.confidence || null,
    sizeTag: capturedMeasure?.sizeTag || resolution?.sizeTag || null
  };
}

export async function hydrateAverageEachWeights(items, context = {}, options = {}) {
  if (!Array.isArray(items)) return;
  const cache = options.cache instanceof Map ? options.cache : new Map();

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const unit = typeof item.home_unit === 'string' ? item.home_unit.toLowerCase() : '';
    if (unit && unit !== 'each' && unit !== 'ea') continue;
    if (item?.averageEachWeight?.gramsPerEach > 0) continue;

    const normalizedName = canonicalName(item.name || '') || item.name;
    if (!normalizedName) continue;
    if (cache.has(normalizedName)) {
      const cached = cache.get(normalizedName);
      if (cached) item.averageEachWeight = cached;
      continue;
    }

    const derived = deriveAverageEachWeight(
      { name: item.name, amount: '1 each', unit: 'each', serving_size: '1 each' },
      context,
      options
    );

    if (derived && derived.gramsPerEach > 0) {
      item.averageEachWeight = derived;
      cache.set(normalizedName, derived);
      if (typeof options.updateIngredient === 'function') {
        try {
          await options.updateIngredient(item.name, { averageEachWeight: derived });
        } catch (err) {
          console.error('Failed to cache averageEachWeight for', item.name, err);
        }
      }
    } else {
      cache.set(normalizedName, null);
    }
  }
}
