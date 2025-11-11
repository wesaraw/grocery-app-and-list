import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadArray as loadItemArray } from './utils/itemStorage.js';
import { canonicalName } from './utils/nameUtils.js';
import {
  NUTRIENT_DEFINITIONS,
  formatDisplayValue,
  convertNutrientValueToDisplay
} from './utils/fdcNutrientMap.js';
import {
  calculateMealNutritionTotals,
  MEAL_NUTRITION_VERSION
} from './utils/mealNutritionCalculator.js';
import { getIngredientMap } from './utils/ingredientStorage.js';
import { loadDensityMap } from './utils/unitNormalize.js';

const params = new URLSearchParams(window.location.search);
const requestedType = params.get('type') || '';
const requestedMealId = params.get('mealId') || '';
const requestedMealName = params.get('meal') || '';
const serializedMealData = params.get('mealData') || '';

const titleEl = document.getElementById('mealTitle');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const missingSectionEl = document.getElementById('missingSection');
const missingListEl = document.getElementById('missingList');
const nutritionOutputEl = document.getElementById('nutritionOutput');

let fallbackMeal = parseMealData(serializedMealData);
let ingredientMap = {};
let densityMap = {};
let currentMeals = [];
let currentMealIndex = -1;
let currentTypeId = requestedType && MEAL_TYPES[requestedType] ? requestedType : null;
let mealNotFound = false;

function parseMealData(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return sanitizeMeal(parsed);
  } catch (error) {
    console.warn('Unable to parse provided meal data', error);
    return null;
  }
}

function sanitizeMeal(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const copy = { ...meal };
  copy.ingredients = Array.isArray(meal.ingredients)
    ? meal.ingredients.map(ing => (ing && typeof ing === 'object' ? { ...ing } : ing))
    : [];
  return copy;
}

function matchesMeal(meal) {
  if (!meal) return false;
  if (requestedMealId) {
    const rawId = meal.id == null ? '' : String(meal.id).trim();
    if (rawId && rawId === requestedMealId.trim()) {
      return true;
    }
  }
  if (requestedMealName) {
    const searchName = canonicalName(requestedMealName);
    if (searchName && canonicalName(meal.name || '') === searchName) {
      return true;
    }
  }
  return false;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatPortionCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const rounded = Math.round(num * 100) / 100;
  try {
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: rounded % 1 === 0 ? 0 : 2
    });
  } catch (_) {
    return String(rounded);
  }
}

function formatWeight(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return formatDisplayValue(value, 'g', 2);
}

function describeMissingReason(reason) {
  switch (reason) {
    case 'missing-ingredient-record':
      return 'No nutrition record found.';
    case 'missing-nutrient-data':
      return 'Nutrition data missing for this ingredient.';
    case 'missing-amount':
      return 'No quantity recorded.';
    case 'invalid-quantity':
      return 'Ingredient amount could not be parsed.';
    case 'conversion-failed':
      return 'Unable to convert the amount to grams.';
    case 'missing-ingredient':
    case 'missing-name':
      return 'Ingredient details are incomplete.';
    default:
      return 'Unknown issue.';
  }
}

function renderStatus(message = '', type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  const classes = ['status'];
  if (type) classes.push(type);
  statusEl.className = classes.join(' ');
}

function renderMeta(meal, totals, source) {
  if (!metaEl) return;
  if (!meal || !totals) {
    metaEl.innerHTML = '';
    return;
  }

  const label = currentTypeId && MEAL_TYPES[currentTypeId]?.label;
  const portions = totals.portionCount ?? meal.totalPortions ?? 1;
  const missingCount = Array.isArray(totals.missingIngredients)
    ? totals.missingIngredients.length
    : 0;

  const rows = [
    `<div><strong>Meal:</strong> ${meal.name || 'Meal'}</div>`
  ];
  if (label) {
    rows.push(`<div><strong>Category:</strong> ${label}</div>`);
  }
  rows.push(`<div><strong>Total Portions:</strong> ${formatPortionCount(portions)}</div>`);
  rows.push(`<div><strong>Serving Weight:</strong> ${formatWeight(totals.totalServingWeight)}</div>`);
  rows.push(`<div><strong>Recipe Weight:</strong> ${formatWeight(totals.totalRecipeWeight)}</div>`);

  const updatedLabel = totals.updatedAt
    ? formatDate(totals.updatedAt)
    : source === 'computed'
    ? 'Calculated from current data'
    : '—';
  rows.push(`<div><strong>Last Calculated:</strong> ${updatedLabel}</div>`);
  rows.push(
    `<div><strong>Missing Ingredients:</strong> ${missingCount}</div>`
  );

  metaEl.innerHTML = rows.join('');
}

function renderMissing(totals) {
  if (!missingSectionEl || !missingListEl) return;
  const entries = Array.isArray(totals?.missingIngredients)
    ? totals.missingIngredients.slice()
    : [];
  if (!entries.length) {
    missingSectionEl.style.display = 'none';
    missingListEl.innerHTML = '';
    return;
  }
  entries.sort((a, b) => {
    const nameA = (a?.name || '').toLowerCase();
    const nameB = (b?.name || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
  missingListEl.innerHTML = '';
  entries.forEach(entry => {
    const li = document.createElement('li');
    const name = entry?.name || 'Unnamed ingredient';
    const reason = describeMissingReason(entry?.reason);
    li.textContent = `${name} — ${reason}`;
    missingListEl.appendChild(li);
  });
  missingSectionEl.style.display = '';
}

function renderNutrients(totals) {
  if (!nutritionOutputEl) return;
  if (!totals) {
    nutritionOutputEl.textContent = 'Nutrition totals are unavailable for this meal.';
    return;
  }
  const lines = NUTRIENT_DEFINITIONS.map(def => {
    const unit = def.displayUnit || def.targetUnit || '';
    const decimals = typeof def.decimals === 'number' ? def.decimals : 2;
    const perServing = convertNutrientValueToDisplay(
      totals.perServing?.[def.key],
      def
    );
    const perRecipe = convertNutrientValueToDisplay(
      totals.perRecipe?.[def.key],
      def
    );
    const perServingText =
      perServing == null ? '—' : formatDisplayValue(perServing, unit, decimals);
    const perRecipeText =
      perRecipe == null ? '—' : formatDisplayValue(perRecipe, unit, decimals);
    return `${def.label}: ${perServingText} per serving | ${perRecipeText} per recipe`;
  });
  nutritionOutputEl.textContent = lines.join('\n');
}

function renderMealStatus(meal, totals, source) {
  if (!meal) {
    if (mealNotFound) {
      renderStatus('Meal could not be found. It may have been removed.', 'error');
    } else {
      renderStatus('No meal was provided.', 'error');
    }
    return;
  }
  const missingCount = Array.isArray(totals?.missingIngredients)
    ? totals.missingIngredients.length
    : 0;
  if (missingCount > 0) {
    renderStatus(
      `Missing data for ${missingCount} ingredient${missingCount === 1 ? '' : 's'}. Totals may be incomplete.`,
      'warning'
    );
    return;
  }
  if (source === 'computed') {
    renderStatus('Nutrition totals calculated from current data. Save the meal to persist them.', 'info');
    return;
  }
  renderStatus('');
}

function resolveMealTotals(meal) {
  if (!meal) {
    return { totals: null, source: 'none' };
  }
  const stored = meal.nutritionTotals;
  if (
    stored &&
    stored.version === MEAL_NUTRITION_VERSION &&
    stored.perRecipe &&
    stored.perServing
  ) {
    return { totals: stored, source: 'stored' };
  }
  const calculated = calculateMealNutritionTotals(meal, { ingredientMap, densityMap });
  return {
    totals: {
      version: MEAL_NUTRITION_VERSION,
      updatedAt: stored?.updatedAt || null,
      ...calculated
    },
    source: 'computed'
  };
}

function getActiveMeal() {
  if (currentMeals.length && currentMealIndex >= 0) {
    return currentMeals[currentMealIndex];
  }
  return fallbackMeal;
}

async function locateMeal() {
  await initializeMealCategories();
  const order = [];
  if (requestedType && MEAL_TYPES[requestedType]) {
    order.push(requestedType);
  }
  Object.keys(MEAL_TYPES).forEach(typeId => {
    if (!order.includes(typeId)) {
      order.push(typeId);
    }
  });

  for (const typeId of order) {
    const info = MEAL_TYPES[typeId];
    if (!info || !info.key) continue;
    const meals = await loadItemArray(info.key);
    const list = Array.isArray(meals) ? meals : [];
    const index = list.findIndex(matchesMeal);
    if (index !== -1) {
      currentMeals = list;
      currentMealIndex = index;
      currentTypeId = typeId;
      mealNotFound = false;
      return;
    }
  }

  currentMeals = [];
  currentMealIndex = -1;
  currentTypeId = requestedType && MEAL_TYPES[requestedType] ? requestedType : null;
  mealNotFound = true;
}

function render() {
  const meal = getActiveMeal();
  const { totals, source } = resolveMealTotals(meal);
  const mealName = meal?.name ? `${meal.name}` : 'Meal';
  document.title = meal ? `${mealName} Nutrition` : 'Meal Nutrition';
  if (titleEl) {
    titleEl.textContent = meal ? `${mealName} Nutrition` : 'Meal Nutrition';
  }
  renderMeta(meal, totals, source);
  renderMissing(totals);
  renderNutrients(totals);
  renderMealStatus(meal, totals, source);
}

async function loadContext() {
  const [ingredients, density] = await Promise.all([
    getIngredientMap(),
    loadDensityMap()
  ]);
  ingredientMap = ingredients || {};
  densityMap = density || {};
}

function registerStorageListener() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = Object.keys(changes || {});
    const mealKeys = keys.filter(key => key.endsWith('Meals'));
    const ingredientChanged = Boolean(changes.ingredientRecords);
    const densityChanged = Boolean(changes.densityRatios);
    const categoriesChanged = Boolean(changes.mealCategories);
    if (!mealKeys.length && !ingredientChanged && !densityChanged && !categoriesChanged) {
      return;
    }
    (async () => {
      if (categoriesChanged || mealKeys.length) {
        await initializeMealCategories();
        await locateMeal();
      }
      if (ingredientChanged || densityChanged) {
        await loadContext();
      }
      render();
    })().catch(error => {
      console.warn('Failed to refresh meal nutrition info after storage change', error);
    });
  });
}

async function init() {
  await loadContext();
  await locateMeal();
  render();
  registerStorageListener();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
      console.error('Failed to initialize meal nutrition view', error);
      renderStatus('Failed to load meal nutrition details.', 'error');
    });
  });
} else {
  init().catch(error => {
    console.error('Failed to initialize meal nutrition view', error);
    renderStatus('Failed to load meal nutrition details.', 'error');
  });
}
