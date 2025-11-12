import { canonicalName } from './nameUtils.js';
import { parseQuantity, getMealPortionCount } from './calendarUtils.js';
import { computeNormalizedQuantity, convertWithDensity } from './unitNormalize.js';
import { convert } from './uomConverter.js';
import { computeQuantityFromPerGram, NUTRIENT_DEFINITIONS } from './fdcNutrientMap.js';

const MEAL_NUTRITION_VERSION = 1;
const ROUNDING_PRECISION = 1e6;
const EPSILON = 1e-6;

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

const NUTRIENT_KEYS = NUTRIENT_DEFINITIONS.map(def => def.key);

function roundValue(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION;
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

function numbersEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= EPSILON;
}

function lookupIngredientRecord(name, ingredientMap = {}) {
  if (!name) return null;
  const normalized = canonicalName(name);
  if (!normalized) return null;
  const direct = ingredientMap[normalized];
  if (direct) return direct;
  // Some records may still store by original casing.
  return ingredientMap[name] || null;
}

function lookupDensityInfo(name, densityMap = {}) {
  if (!name) return null;
  if (densityMap[name]) return densityMap[name];
  const normalized = canonicalName(name);
  if (densityMap[normalized]) return densityMap[normalized];
  return null;
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

function tokenizePortionString(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[^a-z0-9%]+/gi)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

function collectTokensFromStrings(set, ...values) {
  values.forEach(value => {
    tokenizePortionString(value).forEach(token => addTokenForms(set, token));
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
  if (base === 'each') {
    variants.add('ea');
  } else if (base === 'ea') {
    variants.add('each');
  }
  if (base === 'ea' || base === 'each') {
    variants.add('serving');
    variants.add('nlea serving');
    const tokens = extraTokens instanceof Set ? extraTokens : new Set(extraTokens || []);
    tokens.forEach(token => addTokenForms(variants, token));
  }
  return variants;
}

function gramsFromPortion(value, unit, record, options = {}) {
  if (!record || !Array.isArray(record.portions)) return null;
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const ingredientTokens =
    options && options.ingredientTokens instanceof Set
      ? options.ingredientTokens
      : new Set(options?.ingredientTokens || []);
  const variants = buildUnitVariants(normalizedUnit, ingredientTokens);
  let fallback = null;
  for (const portion of record.portions) {
    if (!portion) continue;
    const grams = Number(portion.gramWeight);
    const amount = Number(portion.amount) || 1;
    if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const measure = typeof portion.measureUnit === 'string' ? portion.measureUnit.trim().toLowerCase() : '';
    const modifier = typeof portion.modifier === 'string' ? portion.modifier.trim().toLowerCase() : '';
    const candidates = new Set();
    collectTokensFromStrings(candidates, measure, modifier, `${modifier} ${measure}`);
    if (!fallback && (measure.includes('serving') || modifier.includes('serving'))) {
      fallback = { grams, amount };
    }
    if (!variants.size) continue;
    for (const candidate of candidates) {
      if (candidate && variants.has(candidate)) {
        return roundValue((value / amount) * grams);
      }
    }
  }
  if ((normalizedUnit === 'ea' || normalizedUnit === 'each') && fallback) {
    return roundValue((value / fallback.amount) * fallback.grams);
  }
  return null;
}

function gramsFromKnownMass(value, unit) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!normalized) return null;
  const factor = MASS_UNIT_FACTORS[normalized];
  if (factor == null) return null;
  return roundValue(value * factor);
}

function gramsFromConversion(value, unit, densityInfo, record, options = {}) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!normalized) return null;

  const densitySettings = buildDensitySettings(densityInfo);

  if (!options.skipNormalization) {
    const normalizedResult = computeNormalizedQuantity(value, normalized, densitySettings);
    if (normalizedResult && normalizedResult.quantity != null && normalizedResult.unit) {
      const recursive = gramsFromConversion(
        normalizedResult.quantity,
        normalizedResult.unit,
        densityInfo,
        record,
        { ...options, skipNormalization: true }
      );
      if (recursive != null) {
        return roundValue(recursive);
      }
    }
  }

  const viaPortion = gramsFromPortion(value, normalized, record, options);
  if (viaPortion != null) {
    return roundValue(viaPortion);
  }

  const convertibleUnit = MASS_UNIT_FACTORS[normalized] != null || VOLUME_UNITS.has(normalized);
  if (!convertibleUnit && !(densityInfo && densityInfo.normalized)) {
    return null;
  }

  const ouncesViaDensity = convertWithDensity(value, normalized, 'oz', densitySettings);
  if (Number.isFinite(ouncesViaDensity) && ouncesViaDensity > 0) {
    const gramsFromOunces = gramsFromKnownMass(ouncesViaDensity, 'oz');
    if (gramsFromOunces != null) {
      return roundValue(gramsFromOunces);
    }
  }

  if (MASS_UNIT_FACTORS[normalized] != null || VOLUME_UNITS.has(normalized)) {
    const converted = convert(value, normalized, 'g');
    if (Number.isFinite(converted) && converted > 0) {
      return roundValue(converted);
    }
  }

  return null;
}

function computeIngredientGrams(ingredient, ingredientMap, densityMap) {
  if (!ingredient || typeof ingredient !== 'object') {
    return { grams: null, record: null, reason: 'missing-ingredient' };
  }
  const name = ingredient.name;
  if (!name) {
    return { grams: null, record: null, reason: 'missing-name' };
  }
  const record = lookupIngredientRecord(name, ingredientMap);
  const densityInfo = lookupDensityInfo(name, densityMap);
  const amountText =
    typeof ingredient.amount === 'string' && ingredient.amount.trim()
      ? ingredient.amount
      : typeof ingredient.serving_size === 'string' && ingredient.serving_size.trim()
      ? ingredient.serving_size
      : null;
  if (!amountText) {
    return { grams: null, record, reason: 'missing-amount' };
  }
  const { value, unit } = parseQuantity(amountText);
  if (!Number.isFinite(value) || value <= 0) {
    return { grams: null, record, reason: 'invalid-quantity' };
  }
  const byMass = gramsFromKnownMass(value, unit);
  if (byMass != null) {
    return { grams: byMass, record, reason: null };
  }
  const ingredientTokens = collectIngredientTokens(ingredient, record);
  const converted = gramsFromConversion(value, unit, densityInfo, record, {
    ingredientTokens
  });
  if (converted != null) {
    return { grams: converted, record, reason: null };
  }
  return { grams: null, record, reason: 'conversion-failed' };
}

function baseTotals() {
  const perRecipe = {};
  const perServing = {};
  NUTRIENT_KEYS.forEach(key => {
    perRecipe[key] = 0;
    perServing[key] = 0;
  });
  return { perRecipe, perServing };
}

function compareTotals(previous, next) {
  if (!previous) return false;
  if (previous.version !== MEAL_NUTRITION_VERSION) return false;
  if (!numbersEqual(previous.totalRecipeWeight ?? 0, next.totalRecipeWeight ?? 0)) return false;
  if (!numbersEqual(previous.totalServingWeight ?? 0, next.totalServingWeight ?? 0)) return false;
  if (!numbersEqual(previous.portionCount ?? 0, next.portionCount ?? 0)) return false;
  for (const key of NUTRIENT_KEYS) {
    const prevRecipe = previous.perRecipe?.[key] ?? 0;
    const nextRecipe = next.perRecipe[key] ?? 0;
    if (!numbersEqual(prevRecipe, nextRecipe)) return false;
    const prevServing = previous.perServing?.[key] ?? 0;
    const nextServing = next.perServing[key] ?? 0;
    if (!numbersEqual(prevServing, nextServing)) return false;
  }
  const prevMissing = Array.isArray(previous.missingIngredients)
    ? previous.missingIngredients
    : [];
  const nextMissing = Array.isArray(next.missingIngredients)
    ? next.missingIngredients
    : [];
  if (prevMissing.length !== nextMissing.length) return false;
  for (let i = 0; i < nextMissing.length; i += 1) {
    const prevEntry = prevMissing[i] || {};
    const nextEntry = nextMissing[i] || {};
    if ((prevEntry.name || '') !== (nextEntry.name || '')) return false;
    if ((prevEntry.reason || '') !== (nextEntry.reason || '')) return false;
  }
  return true;
}

export function calculateMealNutritionTotals(meal, context = {}) {
  if (!meal || typeof meal !== 'object') {
    return {
      perRecipe: baseTotals().perRecipe,
      perServing: baseTotals().perServing,
      portionCount: 1,
      totalRecipeWeight: 0,
      totalServingWeight: 0,
      missingIngredients: []
    };
  }
  const { ingredientMap = {}, densityMap = {} } = context;
  const { perRecipe, perServing } = baseTotals();
  const missingIngredients = [];
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  let totalRecipeWeight = 0;

  ingredients.forEach(ingredient => {
    const { grams, record, reason } = computeIngredientGrams(
      ingredient,
      ingredientMap,
      densityMap
    );
    const name = ingredient?.name || '';
    if (grams != null && grams > 0) {
      totalRecipeWeight += grams;
    }
    if (!record || !record.perGramVector || Object.keys(record.perGramVector).length === 0) {
      missingIngredients.push({ name, reason: record ? 'missing-nutrient-data' : 'missing-ingredient-record' });
      return;
    }
    if (grams == null || grams <= 0) {
      missingIngredients.push({ name, reason: reason || 'conversion-failed' });
      return;
    }
    const contribution = computeQuantityFromPerGram(record.perGramVector, grams);
    Object.entries(contribution).forEach(([key, value]) => {
      if (!Number.isFinite(value)) return;
      if (perRecipe[key] === undefined) return;
      perRecipe[key] += value;
    });
  });

  NUTRIENT_KEYS.forEach(key => {
    perRecipe[key] = roundValue(perRecipe[key]);
  });

  const portionCount = getMealPortionCount(meal) || 1;
  const safePortions = portionCount > 0 ? portionCount : 1;
  NUTRIENT_KEYS.forEach(key => {
    perServing[key] = roundValue(perRecipe[key] / safePortions);
  });

  const roundedRecipeWeight = roundValue(totalRecipeWeight);
  const roundedServingWeight = safePortions > 0 ? roundValue(totalRecipeWeight / safePortions) : 0;

  return {
    perRecipe,
    perServing,
    portionCount: roundValue(safePortions),
    totalRecipeWeight: roundedRecipeWeight,
    totalServingWeight: roundedServingWeight,
    missingIngredients
  };
}

export function updateMealNutritionTotals(meal, context = {}) {
  if (!meal || typeof meal !== 'object') return false;
  const totals = calculateMealNutritionTotals(meal, context);
  const previous = meal.nutritionTotals;
  if (compareTotals(previous, totals)) {
    return false;
  }
  meal.nutritionTotals = {
    version: MEAL_NUTRITION_VERSION,
    updatedAt: new Date().toISOString(),
    ...totals
  };
  return true;
}

export { MEAL_NUTRITION_VERSION };
