import { canonicalName } from './nameUtils.js';
import { getMealPortionCount, parseQuantity } from './calendarUtils.js';
import { computeQuantityFromPerGram, NUTRIENT_DEFINITIONS } from './fdcNutrientMap.js';
import { resolveIngredientAmount } from './unitResolver.js';

const MEAL_NUTRITION_VERSION = 3;
const ROUNDING_PRECISION = 1e6;
const EPSILON = 1e-6;


const NUTRIENT_KEYS = NUTRIENT_DEFINITIONS.map(def => def.key);
const NUTRIENT_DEFINITION_MAP = new Map(
  NUTRIENT_DEFINITIONS.map(def => [def.key, def])
);

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
    if (!numbersEqual(prevMeta.perEachGrams ?? 0, nextMeta.perEachGrams ?? 0)) return false;
  }
  if (!compareScoreMaps(previous.nutrientScores, next.nutrientScores)) {
    return false;
  }
  return true;
}

function compareScoreEntry(prevEntry = {}, nextEntry = {}) {
  if ((prevEntry.key || '') !== (nextEntry.key || '')) return false;
  if ((prevEntry.label || '') !== (nextEntry.label || '')) return false;
  if ((prevEntry.perServingUnit || '') !== (nextEntry.perServingUnit || '')) return false;
  if ((prevEntry.targetUnit || '') !== (nextEntry.targetUnit || '')) return false;
  if ((prevEntry.targetInputUnit || '') !== (nextEntry.targetInputUnit || '')) return false;
  if ((prevEntry.importanceDirection || '') !== (nextEntry.importanceDirection || '')) return false;
  if (!numbersEqual(prevEntry.perServingValue ?? 0, nextEntry.perServingValue ?? 0)) return false;
  if (!numbersEqual(prevEntry.targetValue ?? 0, nextEntry.targetValue ?? 0)) return false;
  if (!numbersEqual(prevEntry.ratio ?? 0, nextEntry.ratio ?? 0)) return false;
  if (!numbersEqual(prevEntry.percentComplete ?? 0, nextEntry.percentComplete ?? 0)) return false;
  if (!numbersEqual(prevEntry.targetInputValue ?? 0, nextEntry.targetInputValue ?? 0)) return false;
  if (!numbersEqual(prevEntry.upperLimitValue ?? 0, nextEntry.upperLimitValue ?? 0)) return false;
  if (!numbersEqual(prevEntry.upperLimitPercent ?? 0, nextEntry.upperLimitPercent ?? 0)) return false;
  if (!numbersEqual(prevEntry.upperLimitInputValue ?? 0, nextEntry.upperLimitInputValue ?? 0)) return false;
  if (!numbersEqual(prevEntry.pointsBeforePenalty ?? 0, nextEntry.pointsBeforePenalty ?? 0))
    return false;
  if (!numbersEqual(prevEntry.upperLimitPenaltyBlocks ?? 0, nextEntry.upperLimitPenaltyBlocks ?? 0))
    return false;
  if (!numbersEqual(prevEntry.points ?? 0, nextEntry.points ?? 0)) return false;
  if ((prevEntry.upperLimitUnit || '') !== (nextEntry.upperLimitUnit || '')) return false;
  if ((prevEntry.upperLimitInputUnit || '') !== (nextEntry.upperLimitInputUnit || '')) return false;
  return true;
}

function compareScoreMaps(previous = null, next = null) {
  const prevScores = previous && typeof previous === 'object' ? previous.perServing || {} : {};
  const nextScores = next && typeof next === 'object' ? next.perServing || {} : {};
  const prevKeys = Object.keys(prevScores).sort();
  const nextKeys = Object.keys(nextScores).sort();
  if (prevKeys.length !== nextKeys.length) return false;
  for (let i = 0; i < nextKeys.length; i += 1) {
    const key = nextKeys[i];
    if (prevKeys[i] !== key) return false;
    if (!compareScoreEntry(prevScores[key], nextScores[key])) return false;
  }
  return true;
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeScorePoints(percentComplete) {
  if (!Number.isFinite(percentComplete) || percentComplete <= 0) return 0;
  return Math.max(0, Math.min(10, Math.floor(percentComplete / 10)));
}

function buildNutrientScores(perServing, nutritionTargets = {}) {
  if (!perServing || typeof perServing !== 'object') return null;
  if (!nutritionTargets || typeof nutritionTargets !== 'object') return null;
  const perServingScores = {};
  Object.entries(nutritionTargets).forEach(([key, target]) => {
    if (!target) return;
    const targetBase = Number(target.baseValue);
    if (!Number.isFinite(targetBase) || targetBase <= 0) return;
    const rawValue = Number(perServing[key]);
    const perServingValue = Number.isFinite(rawValue) ? rawValue : 0;
    const upperLimitBase = Number(target.upperLimitBaseValue);
    const hasUpperLimit = Number.isFinite(upperLimitBase) && upperLimitBase > targetBase;
    const upperLimitInputValue =
      Number.isFinite(target.upperLimitValue) && target.upperLimitValue > 0
        ? Number(target.upperLimitValue)
        : null;
    const upperLimitInputUnit = upperLimitInputValue ? target.upperLimitUnit || target.unit || '' : '';
    const direction = target.importanceDirection === 'minimize' ? 'minimize' : 'maximize';
    let ratio;
    if (direction === 'minimize') {
      const overage = Math.max(0, perServingValue - targetBase);
      ratio = clampRatio(1 - overage / targetBase);
    } else {
      ratio = clampRatio(perServingValue / targetBase);
    }
    const percentComplete = ratio * 100;
    let upperLimitPercent = null;
    if (hasUpperLimit) {
      const safeRange = upperLimitBase - targetBase;
      if (safeRange > 0) {
        const overage = Math.max(0, perServingValue - targetBase);
        const progress = overage / safeRange;
        if (overage <= 0) {
          upperLimitPercent = 0;
        } else {
          upperLimitPercent = Math.max(0, Math.min(1, progress)) * 100;
        }
      }
    }
    const roundedUpperLimitPercent =
      upperLimitPercent != null ? Math.round(upperLimitPercent * 100) / 100 : null;
    const safeUpperLimitPercent = Number.isFinite(upperLimitPercent)
      ? Math.max(0, upperLimitPercent)
      : 0;
    const rawPoints = computeScorePoints(percentComplete);
    const penaltyBlocks = hasUpperLimit
      ? Math.min(rawPoints, Math.max(0, Math.floor(safeUpperLimitPercent / 10)))
      : 0;
    const penalizedPoints = Math.max(0, rawPoints - penaltyBlocks);
    const definition = NUTRIENT_DEFINITION_MAP.get(key);
    perServingScores[key] = {
      key,
      label: definition?.label || target.label || key,
      perServingValue: roundValue(perServingValue),
      perServingUnit: definition?.targetUnit || target.targetUnit || '',
      targetValue: roundValue(targetBase),
      targetUnit: definition?.targetUnit || target.targetUnit || '',
      targetInputValue:
        Number.isFinite(target.value) && target.value > 0 ? Number(target.value) : null,
      targetInputUnit: target.unit || '',
      upperLimitValue:
        hasUpperLimit && Number.isFinite(upperLimitBase) ? roundValue(upperLimitBase) : null,
      upperLimitUnit: hasUpperLimit ? definition?.targetUnit || target.targetUnit || '' : '',
      upperLimitInputValue: upperLimitInputValue,
      upperLimitInputUnit: upperLimitInputValue ? upperLimitInputUnit : '',
      upperLimitPercent: roundedUpperLimitPercent,
      importanceDirection: direction,
      ratio: roundValue(ratio),
      percentComplete: Math.round(percentComplete * 100) / 100,
      pointsBeforePenalty: rawPoints,
      upperLimitPenaltyBlocks: penaltyBlocks,
      points: penalizedPoints
    };
  });
  return Object.keys(perServingScores).length ? { perServing: perServingScores } : null;
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
    persistResolvedMeasure = null,
    nutritionTargets = null
  } = context;
  const { perRecipe, perServing } = baseTotals();
  const missingIngredients = [];
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const portionCount = getMealPortionCount(meal) || 1;
  const safePortions = portionCount > 0 ? portionCount : 1;
  let totalRecipeWeight = 0;
  const resolvedIngredients = {};

  ingredients.forEach(ingredient => {
    const parsedAmount = parseQuantity(ingredient?.amount);
    const normalizedUnit = typeof parsedAmount?.unit === 'string' ? parsedAmount.unit.toLowerCase() : '';
    const isCountUnit = !normalizedUnit || normalizedUnit === 'ea' || normalizedUnit === 'each';
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
    const shouldScaleFdcPortion =
      metadata?.source === 'fdc:portion' && isCountUnit && grams != null && grams > 0;
    const scaledGrams = shouldScaleFdcPortion ? grams * safePortions : grams;
    if (scaledGrams != null && scaledGrams > 0) {
      totalRecipeWeight += scaledGrams;
      if (metadata) {
        resolvedIngredients[name] = {
          grams: roundValue(scaledGrams),
          source: metadata.source || null,
          confidence: metadata.confidence || null,
          sizeTag: metadata.sizeTag || null,
          perEachGrams: metadata.perEachGrams || null
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
    const contribution = computeQuantityFromPerGram(record.perGramVector, scaledGrams);
    Object.entries(contribution).forEach(([key, value]) => {
      if (!Number.isFinite(value)) return;
      if (perRecipe[key] === undefined) return;
      perRecipe[key] += value;
    });
  });

  NUTRIENT_KEYS.forEach(key => {
    perRecipe[key] = roundValue(perRecipe[key]);
  });

  NUTRIENT_KEYS.forEach(key => {
    perServing[key] = roundValue(perRecipe[key] / safePortions);
  });

  const roundedRecipeWeight = roundValue(totalRecipeWeight);
  const roundedServingWeight = safePortions > 0 ? roundValue(totalRecipeWeight / safePortions) : 0;

  const nutrientScores = buildNutrientScores(perServing, nutritionTargets);

  return {
    perRecipe,
    perServing,
    portionCount: roundValue(safePortions),
    totalRecipeWeight: roundedRecipeWeight,
    totalServingWeight: roundedServingWeight,
    missingIngredients,
    resolvedIngredients,
    nutrientScores
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
