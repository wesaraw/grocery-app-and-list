import { canonicalName } from './nameUtils.js';
import { getMealPortionCount } from './calendarUtils.js';
import { computeQuantityFromPerGram, NUTRIENT_DEFINITIONS } from './fdcNutrientMap.js';
import { resolveIngredientAmount } from './unitResolver.js';

const MEAL_NUTRITION_VERSION = 1;
const ROUNDING_PRECISION = 1e6;
const EPSILON = 1e-6;


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

function computeIngredientResolution(ingredient, ingredientMap, densityMap, resolverOptions = {}) {
  if (!ingredient || typeof ingredient !== 'object') {
    return { grams: null, record: null, reason: 'missing-ingredient' };
  }
  const name = ingredient.name;
  if (!name) {
    return { grams: null, record: null, reason: 'missing-name' };
  }
  const record = lookupIngredientRecord(name, ingredientMap);
  const densityInfo = lookupDensityInfo(name, densityMap);
  const resolution = resolveIngredientAmount(ingredient, record, null, {
    densityInfo,
    globalDefaults: resolverOptions.globalProduceMeasures,
    promptForMeasure: resolverOptions.promptForMeasure,
    persistResolvedMeasure: resolverOptions.persistResolvedMeasure
  });
  if (!resolution || resolution.grams == null) {
    return { grams: null, record, reason: resolution?.reason || 'conversion-failed' };
  }
  return { grams: resolution.grams, record, reason: null, metadata: resolution };
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
  const prevResolved = previous.resolvedIngredients || {};
  const nextResolved = next.resolvedIngredients || {};
  const prevKeys = Object.keys(prevResolved).sort();
  const nextKeys = Object.keys(nextResolved).sort();
  if (prevKeys.length !== nextKeys.length) return false;
  for (let i = 0; i < nextKeys.length; i += 1) {
    if (prevKeys[i] !== nextKeys[i]) return false;
    const prevMeta = prevResolved[prevKeys[i]] || {};
    const nextMeta = nextResolved[nextKeys[i]] || {};
    if (!numbersEqual(prevMeta.grams ?? 0, nextMeta.grams ?? 0)) return false;
    if ((prevMeta.source || '') !== (nextMeta.source || '')) return false;
    if ((prevMeta.confidence || '') !== (nextMeta.confidence || '')) return false;
    if ((prevMeta.sizeTag || '') !== (nextMeta.sizeTag || '')) return false;
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
      missingIngredients: [],
      resolvedIngredients: {}
    };
  }
  const {
    ingredientMap = {},
    densityMap = {},
    globalProduceMeasures = null,
    promptForMeasure = null,
    persistResolvedMeasure = null
  } = context;
  const { perRecipe, perServing } = baseTotals();
  const missingIngredients = [];
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  let totalRecipeWeight = 0;
  const resolvedIngredients = {};

  ingredients.forEach(ingredient => {
    const { grams, record, reason, metadata } = computeIngredientResolution(
      ingredient,
      ingredientMap,
      densityMap,
      {
        globalProduceMeasures,
        promptForMeasure,
        persistResolvedMeasure
      }
    );
    const name = ingredient?.name || '';
    if (grams != null && grams > 0) {
      totalRecipeWeight += grams;
      if (metadata) {
        resolvedIngredients[name] = {
          grams: roundValue(grams),
          source: metadata.source || null,
          confidence: metadata.confidence || null,
          sizeTag: metadata.sizeTag || null
        };
      }
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
    missingIngredients,
    resolvedIngredients
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
