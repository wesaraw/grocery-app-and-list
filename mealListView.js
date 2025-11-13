import {
  MEAL_TYPES,
  initializeMealCategories,
  loadWhatToCookVisibility,
  saveWhatToCookVisibility,
  WHAT_TO_COOK_VISIBILITY_KEY
} from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadUsers, loadUserPortionMultipliers } from './utils/userData.js';
import { canonicalName } from './utils/nameUtils.js';
import { parseQuantity } from './utils/calendarUtils.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import {
  loadDensityMap,
  convertWithDensity,
  computeNormalizedQuantity
} from './utils/unitNormalize.js';
import { getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import {
  loadArray as loadItemArray,
  saveArray as saveItemArray,
  convertArrayToNames,
  getItemNameMap,
  saveItemNameMap,
  nextUnusedItemId
} from './utils/itemStorage.js';
import { formatQuantity } from './utils/quantityFormat.js';
import { getIngredientMap } from './utils/ingredientStorage.js';
import { updateMealNutritionTotals } from './utils/mealNutritionCalculator.js';
import {
  NUTRIENT_DEFINITIONS,
  convertNutrientValueToDisplay
} from './utils/fdcNutrientMap.js';
import { loadGlobalProduceMeasures } from './utils/unitResolver.js';
import {
  loadNutritionTargetLookup,
  NUTRITION_TARGETS_STORAGE_KEY
} from './utils/nutritionTargets.js';
import {
  ensureIngredientRecordForItem,
  isIngredientRecordStale,
  searchFdcFoods,
  rankCandidates,
  MissingFdcApiKeyError
} from './utils/fdcClient.js';
import {
  getPendingMatch,
  getPendingMatches,
  setPendingMatch
} from './utils/nutritionMatching.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const expandedBooks = new Map();

const params = new URLSearchParams(location.search);
let type = params.get('type') || 'breakfast';
const focusMealParam = params.get('meal');
const focusMealName = focusMealParam ? canonicalName(focusMealParam) : null;
const focusBookParam = params.get('book');
const focusBook = focusBookParam !== null ? focusBookParam : null;
let focusHandled = false;
let key, path, label;

let whatToCookVisibility = {};
let visibilityCheckbox = null;
let suppressVisibilityChange = false;

function setVisibilityCheckboxState(checked) {
  if (!visibilityCheckbox) return;
  const normalized = !!checked;
  if (visibilityCheckbox.checked === normalized) return;
  suppressVisibilityChange = true;
  visibilityCheckbox.checked = normalized;
  suppressVisibilityChange = false;
}

let inventorySet = new Set();
const ingredientCells = {};
let userNames = [];
let userPortionDefaults = [];
let deleteMode = false;
const deleteButtons = [];
let needsMap = new Map();
let densityMap = {};
let ingredientMap = {};
let globalProduceMeasures = {};
let nutritionTargetLookup = {};
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';
let units = [];

const ingredientNutritionButtons = new Map();
const ingredientNutritionContexts = new Map();
const pendingConfirmQueue = [];
let activeConfirmItem = null;
const nutritionQueue = [];
const queuedNutritionNames = new Set();
const nutritionRetryCounts = new Map();
const NUTRITION_RETRY_LIMIT = 3;
const NUTRITION_MIN_DELAY_MS = 350;
const NUTRITION_MAX_DELAY_MS = 5000;
let nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
let processingNutrition = false;
let missingApiKeyWarningShown = false;

const NUTRIENT_DEFINITION_MAP = new Map(
  NUTRIENT_DEFINITIONS.map(def => [def.key, def])
);

function extractUnitText(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[\d\s./+-]+(.*)$/);
  return match ? match[1].trim() : '';
}

function formatUnitLabel(text) {
  if (!text) return '';
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (lower === 'cooked' || lower === 'dry') {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      if (index === 0 && lower.length > 2) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(' ');
}

function sanitizePortionCount(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) {
    return 1;
  }
  return num;
}

function formatNormalizedQuantity(value) {
  if (!Number.isFinite(value)) return null;
  const formatted = formatQuantity(value);
  return formatted === '' ? null : formatted;
}

function formatPortionCount(value) {
  const sanitized = sanitizePortionCount(value);
  const formatted = formatQuantity(sanitized);
  return formatted === '' ? String(sanitized) : formatted;
}

function formatWeightValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return '1';
  }
  const formatted = formatQuantity(num);
  return formatted === '' ? String(num) : formatted;
}

function formatIngredientAmount(ingredient) {
  const base = ingredient?.amount || ingredient?.serving_size || '';
  if (base == null) return '';
  const baseStr = typeof base === 'string' ? base.trim() : String(base);
  if (!baseStr) return '';
  const name = ingredient?.name;
  if (!name) return baseStr;
  const info = densityMap[name] || densityMap[canonicalName(name)];
  if (!info) return baseStr;
  const { value, unit } = parseQuantity(baseStr);
  if (!unit) return baseStr;
  const normalized = computeNormalizedQuantity(value, unit, info);
  if (!normalized || normalized.unit == null) return baseStr;
  const normalizedUnitRaw = typeof normalized.unit === 'string' ? normalized.unit.trim() : '';
  if (!normalizedUnitRaw) return baseStr;
  const normalizedUnit = formatUnitLabel(normalizedUnitRaw);
  if (!normalizedUnit) return baseStr;
  let baseUnitText = extractUnitText(baseStr);
  if (!baseUnitText && unit && unit !== 'ea') {
    baseUnitText = unit;
  }
  const formattedBaseUnit = formatUnitLabel(baseUnitText);
  if (
    formattedBaseUnit &&
    normalizedUnit.toLowerCase() === formattedBaseUnit.toLowerCase()
  ) {
    return baseStr;
  }
  const formattedQty = formatNormalizedQuantity(normalized.quantity);
  if (!formattedQty) return baseStr;
  return `${baseStr} (Converts to ${formattedQty} ${normalizedUnit})`;
}

function normalizeIngredientPrepFlags(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  ingredients.forEach(ing => {
    if (!ing || typeof ing !== 'object') return;
    if (ing.prepAhead === undefined) ing.prepAhead = false;
  });
  return ingredients;
}

function normalizeMealRecord(meal) {
  if (!meal || typeof meal !== 'object') return;
  if (meal.prepared === undefined) meal.prepared = false;
  if (meal.prepAhead === undefined) meal.prepAhead = false;
  if (meal.leftoverOk === undefined) meal.leftoverOk = false;
  if (meal.recipeBook === undefined) meal.recipeBook = '';
  if (typeof meal.instructions !== 'string') {
    meal.instructions = '';
  } else {
    meal.instructions = meal.instructions.trim();
  }
  if (!Array.isArray(meal.ingredients)) {
    meal.ingredients = [];
  }
  meal.totalPortions = sanitizePortionCount(meal.totalPortions);
  normalizeIngredientPrepFlags(meal.ingredients);
}

async function reloadNutritionTargets() {
  try {
    const lookup = await loadNutritionTargetLookup(NUTRIENT_DEFINITIONS);
    nutritionTargetLookup = lookup || {};
  } catch (error) {
    console.error('Failed to load nutrition targets', error);
    nutritionTargetLookup = {};
  }
}

function getNutritionContext() {
  return {
    ingredientMap,
    densityMap,
    needsMap,
    globalProduceMeasures,
    nutritionTargets: nutritionTargetLookup
  };
}

function refreshMealNutrition(target) {
  const context = getNutritionContext();
  if (Array.isArray(target)) {
    let changed = false;
    target.forEach(meal => {
      if (meal && typeof meal === 'object' && updateMealNutritionTotals(meal, context)) {
        changed = true;
      }
    });
    return changed;
  }
  if (target && typeof target === 'object') {
    return updateMealNutritionTotals(target, context);
  }
  return false;
}

function formatNutrientValue(value, key) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const def = NUTRIENT_DEFINITION_MAP.get(key);
  if (!def) return null;
  const displayValue = convertNutrientValueToDisplay(value, def);
  if (!Number.isFinite(displayValue) || displayValue <= 0) return null;
  const decimals = typeof def.decimals === 'number' ? def.decimals : 2;
  const rounded = Number(displayValue.toFixed(decimals));
  if (!Number.isFinite(rounded)) return null;
  const unit = def.displayUnit || def.targetUnit || '';
  return `${rounded}${unit ? ` ${unit}` : ''}`;
}

function formatScorePercent(percent) {
  if (!Number.isFinite(percent) || percent < 0) return '0%';
  const rounded = Math.min(999, Math.round(percent));
  return `${rounded}%`;
}

function formatScoreTarget(entry) {
  if (!entry) return null;
  if (Number.isFinite(entry.targetInputValue) && entry.targetInputValue > 0 && entry.targetInputUnit) {
    return `${entry.targetInputValue} ${entry.targetInputUnit}`.trim();
  }
  const def = NUTRIENT_DEFINITION_MAP.get(entry.key);
  const unit = entry.targetUnit || def?.targetUnit || '';
  const baseValue = Number(entry.targetValue);
  if (!Number.isFinite(baseValue) || baseValue <= 0) return null;
  if (def) {
    const displayValue = convertNutrientValueToDisplay(baseValue, def);
    if (Number.isFinite(displayValue)) {
      const decimals = typeof def.decimals === 'number' ? def.decimals : 2;
      const rounded = Number(displayValue.toFixed(decimals));
      if (Number.isFinite(rounded)) {
        return `${rounded}${unit ? ` ${unit}` : ''}`.trim();
      }
    }
  }
  const rounded = Math.round(baseValue * 100) / 100;
  return `${rounded}${unit ? ` ${unit}` : ''}`.trim();
}

function formatScoreUpperLimit(entry) {
  if (!entry) return null;
  let valueText = '';
  if (
    Number.isFinite(entry.upperLimitInputValue) &&
    entry.upperLimitInputValue > 0 &&
    entry.upperLimitInputUnit
  ) {
    valueText = `${entry.upperLimitInputValue} ${entry.upperLimitInputUnit}`.trim();
  }
  if (!valueText) {
    valueText = formatNutrientValue(entry.upperLimitValue, entry.key);
  }
  if (!valueText) return null;
  const percentText = formatScorePercent(entry.upperLimitPercent);
  return `UL ${valueText} (${percentText})`;
}

function describeImportanceDirection(direction) {
  const normalized = String(direction || '').toLowerCase();
  if (normalized === 'minimize') {
    return 'Goal: keep this nutrient below its ceiling';
  }
  if (normalized === 'maximize') {
    return 'Goal: reach this nutrient target';
  }
  return '';
}

// Nutrient score chips should list the highest scoring nutrients first, so
// normalize available numeric metrics before falling back to labels.
function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function normalizeScore(entry) {
  const points = Number(entry?.points);
  if (Number.isFinite(points)) {
    return Math.max(0, Math.min(10, points));
  }
  const percent = clampPercent(entry?.percentComplete);
  if (percent != null) {
    return percent / 10;
  }
  return null;
}

function compareNutrientScoreEntries(a, b) {
  const scoreA = normalizeScore(a);
  const scoreB = normalizeScore(b);
  if (scoreA != null || scoreB != null) {
    if (scoreA == null) return 1;
    if (scoreB == null) return -1;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
  }

  const percentA = clampPercent(a?.percentComplete);
  const percentB = clampPercent(b?.percentComplete);
  if (percentA != null || percentB != null) {
    if (percentA == null) return 1;
    if (percentB == null) return -1;
    if (percentA !== percentB) {
      return percentB - percentA;
    }
  }

  const labelA = (a?.label || a?.key || '').toLowerCase();
  const labelB = (b?.label || b?.key || '').toLowerCase();
  if (labelA < labelB) return -1;
  if (labelA > labelB) return 1;
  return 0;
}

function buildNutritionScoreList(totals) {
  const perServingScores = totals?.nutrientScores?.perServing;
  if (!perServingScores) return null;
  const entries = Object.values(perServingScores);
  if (!entries.length) return null;
  const container = document.createElement('div');
  container.className = 'meal-nutrition-scores';
  entries
    .slice()
    .sort(compareNutrientScoreEntries)
    .forEach(entry => {
      if (!entry) return;
      const item = document.createElement('div');
      item.className = 'meal-nutrition-score';
      const header = document.createElement('div');
      header.className = 'meal-nutrition-score__header';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'meal-nutrition-score__label';
      labelSpan.textContent = entry.label || entry.key || 'Nutrient';
      const directionDescription = describeImportanceDirection(entry.importanceDirection);
      if (directionDescription) {
        labelSpan.title = directionDescription;
      }
      const valueSpan = document.createElement('span');
      valueSpan.className = 'meal-nutrition-score__value';
      const percentText = formatScorePercent(entry.percentComplete);
      const displayedPoints = Math.max(0, Math.min(10, Number(entry.points) || 0));
      valueSpan.textContent = `${displayedPoints}/10 • ${percentText}`;
      header.appendChild(labelSpan);
      header.appendChild(valueSpan);
      const tooltipParts = [];
      if (directionDescription) {
        tooltipParts.push(directionDescription);
      }
      const targetText = formatScoreTarget(entry);
      if (targetText) {
        tooltipParts.push(`Target ${targetText}`);
      }
      const perServingText = formatNutrientValue(entry.perServingValue, entry.key);
      if (perServingText) {
        tooltipParts.push(`${perServingText} per serving`);
      }
      tooltipParts.push(`${displayedPoints}/10 (${percentText})`);
      const penaltyBlocks = (() => {
        if (Number.isFinite(entry.upperLimitPenaltyBlocks)) {
          return Math.max(0, Math.min(10, Math.floor(Number(entry.upperLimitPenaltyBlocks))));
        }
        return Math.max(0, Math.min(10, Math.floor((Number(entry.upperLimitPercent) || 0) / 10)));
      })();
      if (penaltyBlocks > 0) {
        const basePoints = Number.isFinite(entry.pointsBeforePenalty)
          ? Math.max(0, Math.min(10, Math.floor(Number(entry.pointsBeforePenalty))))
          : Math.max(0, Math.min(10, displayedPoints + penaltyBlocks));
        tooltipParts.push(
          `Score reduced from ${basePoints}/10 by ${penaltyBlocks} due to safe upper-limit overage`
        );
      }
      const upperLimitText = formatScoreUpperLimit(entry);
      if (upperLimitText) {
        tooltipParts.push(upperLimitText);
      }
      item.title = tooltipParts.join(' • ');
      item.appendChild(header);
      if (upperLimitText) {
        const upperLimitSpan = document.createElement('span');
        upperLimitSpan.className = 'meal-nutrition-score__upper-limit';
        upperLimitSpan.textContent = upperLimitText;
        item.appendChild(upperLimitSpan);
      }
      container.appendChild(item);
    });
  return container;
}

function buildNutritionSummary(meal) {
  const totals = meal?.nutritionTotals;
  if (!totals) return null;
  const summaryParts = [];
  const energy = formatNutrientValue(totals.perServing?.energy, 'energy');
  if (energy) summaryParts.push(`Energy: ${energy}`);
  const protein = formatNutrientValue(totals.perServing?.protein, 'protein');
  if (protein) summaryParts.push(`Protein: ${protein}`);
  const missingCount = Array.isArray(totals.missingIngredients)
    ? totals.missingIngredients.length
    : 0;
  const scoreList = buildNutritionScoreList(totals);
  if (!summaryParts.length && !missingCount && !scoreList) {
    return null;
  }
  const container = document.createElement('div');
  container.className = 'meal-nutrition-summary';
  if (summaryParts.length) {
    const summarySpan = document.createElement('span');
    summarySpan.className = 'meal-nutrition-summary__totals';
    summarySpan.textContent = `${summaryParts.join(' • ')} per serving`;
    container.appendChild(summarySpan);
  }
  if (missingCount) {
    if (container.childNodes.length) {
      container.appendChild(document.createTextNode(' '));
    }
    const missingSpan = document.createElement('span');
    missingSpan.className = 'meal-nutrition-summary__missing';
    missingSpan.textContent =
      missingCount === 1
        ? 'Missing data for 1 ingredient'
        : `Missing data for ${missingCount} ingredients`;
    container.appendChild(missingSpan);
  }
  if (scoreList) {
    if (container.childNodes.length) {
      container.appendChild(document.createElement('br'));
    }
    container.appendChild(scoreList);
  }
  return container;
}

function sanitizeOverrides(source, userCount) {
  if (!Array.isArray(source) || userCount <= 0) return [];
  const sanitized = [];
  const limit = Math.min(source.length, userCount);
  for (let i = 0; i < limit; i++) {
    const val = source[i];
    let normalized;
    if (typeof val === 'number' && Number.isFinite(val)) {
      normalized = val;
    } else if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val);
      normalized = Number.isFinite(parsed) ? parsed : undefined;
    } else {
      normalized = undefined;
    }
    sanitized[i] = normalized;
  }
  let end = sanitized.length;
  while (end > 0 && sanitized[end - 1] === undefined) end--;
  return sanitized.slice(0, end);
}

function overridesEqual(a, b) {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  for (let i = 0; i < arrA.length; i++) {
    if (!Object.is(arrA[i], arrB[i])) return false;
  }
  return true;
}

function normalizeMealOverrides(meal) {
  const hasArray = Array.isArray(meal.userPortionOverrides);
  const sanitized = sanitizeOverrides(meal.userPortionOverrides, userNames.length);
  if (!hasArray && sanitized.length === 0 && meal.userPortionOverrides === undefined) {
    return false;
  }
  if (!hasArray || !overridesEqual(sanitized, meal.userPortionOverrides)) {
    meal.userPortionOverrides = sanitized;
    return true;
  }
  return false;
}

function defaultPortionFor(index) {
  const val = userPortionDefaults[index];
  return typeof val === 'number' && Number.isFinite(val) ? val : 1;
}

function sameMultiplier(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

function loadFinalProduct(item) {
  return new Promise(resolve => {
    const key = `final_product_${encodeURIComponent(item)}`;
    chrome.storage.local.get([key], data => resolve(data[key] || null));
  });
}

async function getMealImage(meal) {
  if (meal.image) return meal.image;
  const first = meal.ingredients?.[0]?.name;
  if (!first) return null;
  const prod = await loadFinalProduct(first);
  return prod && prod.image ? prod.image : null;
}

function setMealImage(imgEl, meal) {
  getMealImage(meal).then(src => {
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'inline';
    } else {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
  });
}

function createAddButton(name) {
  const btn = document.createElement('button');
  btn.textContent = 'add';
  btn.className = 'add-inventory-btn';
  btn.addEventListener('click', () => {
    openOrFocusWindow(`addItem.html?name=${encodeURIComponent(name)}`);
  });
  return btn;
}

function logNutritionMessage(message, type = 'info') {
  if (!message) return;
  const normalized = String(message).trim();
  if (!normalized) return;
  const prefix = '[Nutrition]';
  if (type === 'error') {
    console.error(`${prefix} ${normalized}`);
  } else if (type === 'warning') {
    console.warn(`${prefix} ${normalized}`);
  } else {
    console.info(`${prefix} ${normalized}`);
  }
}

function setNutritionStatus(message, type = 'info') {
  if (!message) return;
  logNutritionMessage(message, type);
}

function showTransientNutritionStatus(message, type = 'info') {
  if (!message) return;
  logNutritionMessage(message, type);
}

async function updateNutritionStatusBanner() {
  // Meal list does not have a dedicated status banner, so this is a no-op.
}

function registerIngredientNutritionContext(ingredient) {
  if (!ingredient || !ingredient.name) return;
  const normalized = canonicalName(ingredient.name);
  if (!normalized) return;
  const context = { name: ingredient.name };
  if (ingredient.unit_default) context.unit_default = ingredient.unit_default;
  if (ingredient.home_unit) context.home_unit = ingredient.home_unit;
  if (ingredient.unit) context.unit = ingredient.unit;
  const amount = ingredient.amount || ingredient.serving_size;
  if (amount) {
    const parsed = parseQuantity(amount);
    if (parsed?.unit) {
      context.unit = context.unit || parsed.unit;
      context.home_unit = context.home_unit || parsed.unit;
    }
  }
  const previous = ingredientNutritionContexts.get(normalized) || {};
  ingredientNutritionContexts.set(normalized, { ...previous, ...context });
}

function getIngredientContext(name) {
  if (!name) return { name: '' };
  const normalized = canonicalName(name);
  if (!normalized) return { name };
  if (!ingredientNutritionContexts.has(normalized)) {
    ingredientNutritionContexts.set(normalized, { name });
  }
  const context = ingredientNutritionContexts.get(normalized);
  if (!context.name) {
    context.name = name;
  }
  return context;
}

function registerIngredientNutritionButtons(name, infoButton, syncButton) {
  if (!name || !syncButton) return;
  const normalized = canonicalName(name);
  if (!normalized) return;
  const entry = ingredientNutritionButtons.get(normalized) || [];
  entry.push({ info: infoButton, sync: syncButton });
  ingredientNutritionButtons.set(normalized, entry);
}

function buildIngredientNutritionControls(ingredient) {
  if (!ingredient || !ingredient.name) return null;
  registerIngredientNutritionContext(ingredient);
  const container = document.createElement('div');
  container.className = 'nutrition-button-row';

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'nutrition-info-button';
  infoBtn.textContent = 'Nutrition Info';
  infoBtn.addEventListener('click', () => {
    openOrFocusWindow(`nutritionInfo.html?item=${encodeURIComponent(ingredient.name)}`, 420, 520);
  });
  container.appendChild(infoBtn);

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.className = 'nutrition-sync-button';
  syncBtn.textContent = 'Sync Nutrition';
  syncBtn.dataset.state = 'missing';
  syncBtn.addEventListener('click', async () => {
    const state = syncBtn.dataset.state;
    if (state === 'pending') {
      await queueNutritionConfirmForItem(ingredient.name, { prioritize: true });
      return;
    }
    if (state === 'editable' || state === 'stale') {
      await beginNutritionEdit(getIngredientContext(ingredient.name));
      return;
    }
    enqueueNutritionItem(ingredient.name, { force: false });
    nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
    if (!processingNutrition) {
      processNutritionQueue();
    }
  });
  container.appendChild(syncBtn);

  registerIngredientNutritionButtons(ingredient.name, infoBtn, syncBtn);
  return container;
}

function openNextPendingConfirm() {
  if (activeConfirmItem) return;
  while (pendingConfirmQueue.length) {
    const nextEntry = pendingConfirmQueue.shift();
    if (!nextEntry || !nextEntry.itemName) continue;
    activeConfirmItem = { ...nextEntry };
    openOrFocusWindow(
      `nutritionConfirm.html?item=${encodeURIComponent(nextEntry.itemName)}`,
      520,
      600
    );
    return;
  }
  activeConfirmItem = null;
}

function queueNutritionConfirmEntry(entry, { prioritize = false } = {}) {
  if (!entry) return;
  const itemName = entry.itemName || '';
  const normalizedName = entry.normalizedName || canonicalName(itemName);
  if (!itemName || !normalizedName) return;

  const normalizedEntry = { ...entry, itemName, normalizedName };

  if (activeConfirmItem && activeConfirmItem.normalizedName === normalizedName) {
    activeConfirmItem = { ...normalizedEntry };
    openOrFocusWindow(
      `nutritionConfirm.html?item=${encodeURIComponent(itemName)}`,
      520,
      600
    );
    return;
  }

  // Manual "Review Match" clicks should immediately take over the confirmation popup,
  // even if another ingredient was already active. Move the previous active entry back
  // into the queue (without duplicates) and open the window for the requested item.
  if (prioritize && activeConfirmItem && activeConfirmItem.normalizedName !== normalizedName) {
    const activeName = activeConfirmItem.normalizedName;
    const existingActiveIndex = pendingConfirmQueue.findIndex(
      queued => queued && queued.normalizedName === activeName
    );
    if (existingActiveIndex !== -1) {
      pendingConfirmQueue.splice(existingActiveIndex, 1);
    }

    const existingPendingIndex = pendingConfirmQueue.findIndex(
      queued => queued && queued.normalizedName === normalizedName
    );
    if (existingPendingIndex !== -1) {
      pendingConfirmQueue.splice(existingPendingIndex, 1);
    }

    pendingConfirmQueue.unshift({ ...activeConfirmItem });
    activeConfirmItem = { ...normalizedEntry };
    openOrFocusWindow(
      `nutritionConfirm.html?item=${encodeURIComponent(itemName)}`,
      520,
      600
    );
    return;
  }

  const existingIndex = pendingConfirmQueue.findIndex(
    queued => queued && queued.normalizedName === normalizedName
  );
  if (existingIndex !== -1) {
    pendingConfirmQueue[existingIndex] = { ...normalizedEntry };
    if (prioritize && existingIndex !== 0) {
      const [existing] = pendingConfirmQueue.splice(existingIndex, 1);
      pendingConfirmQueue.unshift(existing);
    }
  } else if (prioritize) {
    pendingConfirmQueue.unshift({ ...normalizedEntry });
  } else {
    pendingConfirmQueue.push({ ...normalizedEntry });
  }

  openNextPendingConfirm();
}

async function beginNutritionEdit(item) {
  if (!item || !item.name) return;

  try {
    const pending = await getPendingMatch(item.name);
    if (pending) {
      queueNutritionConfirmEntry(pending, { prioritize: true });
      return;
    }
  } catch (err) {
    console.error('Unable to load pending match for edit', err);
  }

  const unitDefault = item.home_unit || item.unit_default || item.unit || 'g';

  let foods;
  try {
    foods = await searchFdcFoods(item.name, { pageSize: 25 });
  } catch (error) {
    if (error instanceof MissingFdcApiKeyError || error?.code === 'MISSING_FDC_API_KEY') {
      if (!missingApiKeyWarningShown) {
        missingApiKeyWarningShown = true;
      }
      setNutritionStatus('Set your FDC website API key to enable nutrition syncing.', 'warning');
    } else {
      const message = error?.message ? ` ${error.message}` : '';
      showTransientNutritionStatus(`USDA search failed for ${item.name}.${message}`, 'error');
    }
    return;
  }

  const ranked = rankCandidates(item.name, foods);
  if (!ranked.length) {
    showTransientNutritionStatus(`No USDA FDC matches found for ${item.name}.`, 'warning');
    return;
  }

  const candidates = ranked.map(candidate => {
    const { _original, ...rest } = candidate;
    return rest;
  });

  try {
    await setPendingMatch(item.name, {
      candidates,
      unitDefault,
      source: 'manual-edit',
      lastSearchQuery: item.name
    });
    const pendingEntry = await getPendingMatch(item.name);
    if (pendingEntry) {
      queueNutritionConfirmEntry(pendingEntry, { prioritize: true });
    }
    await updateNutritionButtons();
  } catch (err) {
    console.error('Unable to stage nutrition edit', err);
    const message = err?.message ? ` ${err.message}` : '';
    showTransientNutritionStatus(`Unable to prepare nutrition edit for ${item.name}.${message}`, 'error');
  }
}

async function queueNutritionConfirmForItem(name, options = {}) {
  if (!name) return;
  try {
    const pending = await getPendingMatch(name);
    if (pending) {
      queueNutritionConfirmEntry(pending, options);
    } else {
      openOrFocusWindow(
        `nutritionConfirm.html?item=${encodeURIComponent(name)}`,
        520,
        600
      );
    }
  } catch (err) {
    console.error('Unable to open nutrition confirmation window', err);
    openOrFocusWindow(
      `nutritionConfirm.html?item=${encodeURIComponent(name)}`,
      520,
      600
    );
  }
}

function enqueueNutritionItem(name, { force = false } = {}) {
  if (!name) return;
  if (!force && queuedNutritionNames.has(name)) return;
  if (force) {
    queuedNutritionNames.delete(name);
  }
  queuedNutritionNames.add(name);
  nutritionQueue.push(name);
}

async function processNutritionQueue() {
  if (!nutritionQueue.length) {
    processingNutrition = false;
    return;
  }
  processingNutrition = true;
  const name = nutritionQueue.shift();
  queuedNutritionNames.delete(name);
  const item = getIngredientContext(name);
  if (!item || !item.name) {
    nutritionRetryCounts.delete(name);
    setTimeout(processNutritionQueue, nutritionDelayMs);
    return;
  }

  let success = true;
  let shouldRetry = false;
  let errorMessage = '';

  try {
    const result = await ensureIngredientRecordForItem(item);
    if (result.status === 'needs-confirmation') {
      let pendingEntry = await getPendingMatch(item.name);
      if (!pendingEntry) {
        await setPendingMatch(item.name, {
          candidates: result.candidates,
          unitDefault: item.home_unit || item.unit_default || item.unit || 'g',
          source: 'meal-list'
        });
        pendingEntry = await getPendingMatch(item.name);
      }
      if (pendingEntry) {
        queueNutritionConfirmEntry(pendingEntry, { prioritize: true });
      }
    } else if (result.status === 'missing-api-key') {
      if (!missingApiKeyWarningShown) {
        missingApiKeyWarningShown = true;
        setNutritionStatus('Set your FDC website API key to enable nutrition syncing.', 'warning');
      }
      nutritionQueue.length = 0;
      queuedNutritionNames.clear();
      nutritionRetryCounts.clear();
      nutritionDelayMs = NUTRITION_MIN_DELAY_MS;
      processingNutrition = false;
      return;
    } else if (result.status === 'no-results') {
      showTransientNutritionStatus(`No USDA FDC matches found for ${item.name}.`, 'warning');
    } else if (result.status === 'error') {
      success = false;
      errorMessage = result.error?.message || 'Unknown error';
    }
  } catch (err) {
    success = false;
    errorMessage = err?.message || 'Unknown error';
    console.error('Failed to sync nutrition for', name, err);
  }

  if (!success) {
    const retries = (nutritionRetryCounts.get(name) || 0) + 1;
    if (retries <= NUTRITION_RETRY_LIMIT) {
      nutritionRetryCounts.set(name, retries);
      shouldRetry = true;
    } else {
      nutritionRetryCounts.delete(name);
    }
    if (errorMessage) {
      const normalizedError = String(errorMessage || 'Unknown error');
      const trimmedError =
        normalizedError.length > 140 ? `${normalizedError.slice(0, 137)}…` : normalizedError;
      showTransientNutritionStatus(
        `Nutrition sync failed for ${item.name}. ${trimmedError}`,
        'error'
      );
    }
  } else {
    nutritionRetryCounts.delete(name);
  }

  if (shouldRetry) {
    enqueueNutritionItem(name, { force: true });
  }

  try {
    await updateNutritionButtons();
    await updateNutritionStatusBanner();
  } catch (err) {
    console.error('Failed to refresh nutrition state after sync', err);
  }

  nutritionDelayMs = success
    ? NUTRITION_MIN_DELAY_MS
    : Math.min(NUTRITION_MAX_DELAY_MS, Math.floor(nutritionDelayMs * 1.5));

  setTimeout(processNutritionQueue, nutritionDelayMs);
}

async function updateNutritionButtons() {
  if (!ingredientNutritionButtons.size) return;
  try {
    const [pending, map] = await Promise.all([getPendingMatches(), getIngredientMap()]);
    const pendingKeys = new Set(Object.keys(pending || {}));
    for (const [normalized, entries] of ingredientNutritionButtons.entries()) {
      const record = map?.[normalized];
      const hasData = record && record.perGramVector && Object.keys(record.perGramVector).length;
      const stale = record ? isIngredientRecordStale(record) : false;
      entries.forEach(buttons => {
        if (!buttons) return;
        const infoButton = buttons.info;
        const syncButton = buttons.sync;
        if (infoButton && infoButton.isConnected) {
          infoButton.title = hasData
            ? 'View stored nutrition information'
            : 'No nutrition data stored yet';
        }
        if (!syncButton || !syncButton.isConnected) return;
        if (pendingKeys.has(normalized)) {
          syncButton.textContent = 'Review Match';
          syncButton.classList.add('pending');
          syncButton.classList.remove('sync-needed');
          syncButton.dataset.state = 'pending';
        } else if (hasData) {
          syncButton.textContent = 'Edit Nutrition';
          syncButton.classList.remove('pending');
          if (stale) {
            syncButton.classList.add('sync-needed');
            syncButton.dataset.state = 'stale';
          } else {
            syncButton.classList.remove('sync-needed');
            syncButton.dataset.state = 'editable';
          }
        } else {
          syncButton.textContent = 'Sync Nutrition';
          syncButton.classList.add('sync-needed');
          syncButton.classList.remove('pending');
          syncButton.dataset.state = 'missing';
        }
      });
    }
  } catch (err) {
    console.error('Failed to update nutrition buttons', err);
  }
}

function handlePendingMatchesChange(change) {
  updateNutritionButtons();
  const newMap = change?.newValue || {};
  const oldMap = change?.oldValue || {};
  const oldKeys = new Set(Object.keys(oldMap || {}));
  const newKeys = new Set(Object.keys(newMap || {}));

  for (let i = pendingConfirmQueue.length - 1; i >= 0; i--) {
    const queued = pendingConfirmQueue[i];
    if (!queued || !newKeys.has(queued.normalizedName)) {
      pendingConfirmQueue.splice(i, 1);
    } else {
      pendingConfirmQueue[i] = { ...newMap[queued.normalizedName] };
    }
  }

  if (activeConfirmItem) {
    if (!newKeys.has(activeConfirmItem.normalizedName)) {
      activeConfirmItem = null;
    } else {
      activeConfirmItem = { ...newMap[activeConfirmItem.normalizedName] };
    }
  }

  Object.values(newMap).forEach(entry => {
    if (!entry || !entry.normalizedName || !entry.itemName) return;
    if (!oldKeys.has(entry.normalizedName)) {
      queueNutritionConfirmEntry(entry);
    }
  });

  if (!activeConfirmItem) {
    openNextPendingConfirm();
  }
}

async function loadMeals() {
  const arr = await loadItemArray(key);
  if (arr.length > 0) {
    arr.forEach(normalizeMealRecord);
    return arr;
  }
  const fromJson = await loadJSON(path);
  const withNames = await convertArrayToNames(fromJson);
  withNames.forEach(normalizeMealRecord);
  return withNames;
}

async function loadStock() {
  const arr = await loadItemArray('currentStock');
  if (arr.length > 0) return arr;
  const stock = await loadJSON(STOCK_PATH);
  return await convertArrayToNames(stock);
}

async function loadNeeds() {
  const arr = await loadItemArray('yearlyNeeds');
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(NEEDS_PATH);
  return await convertArrayToNames(fromJson);
}

async function loadUnits() {
  const data = await loadJSON(UOM_PATH);
  return Object.keys(data);
}

function saveMeals(arr) {
  if (Array.isArray(arr)) {
    refreshMealNutrition(arr);
  }
  return saveItemArray(key, arr);
}

function loadMealsForType(cat) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve([]);
  return (async () => {
    const arr = await loadItemArray(info.key);
    if (arr.length > 0) {
      arr.forEach(normalizeMealRecord);
      return arr;
    }
    const fromJson = await loadJSON(info.path);
    const withNames = await convertArrayToNames(fromJson);
    withNames.forEach(normalizeMealRecord);
    return withNames;
  })();
}

function saveMealsForType(cat, arr) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve();
  if (Array.isArray(arr)) {
    refreshMealNutrition(arr);
  }
  return saveItemArray(info.key, arr);
}

async function correctMealIdErrors() {
  await initializeMealCategories();
  const categories = Object.values(MEAL_TYPES).filter(info => info && info.key);
  const categoryData = await Promise.all(
    categories.map(async info => ({ info, meals: await loadItemArray(info.key) }))
  );
  const mealsByKey = new Map(categoryData.map(({ info, meals }) => [info.key, meals]));

  const originalMap = await getItemNameMap();
  const workingMap = { ...originalMap };
  const reverseMap = {};
  Object.entries(workingMap).forEach(([name, id]) => {
    if (id != null && reverseMap[id] == null) {
      reverseMap[id] = name;
    }
  });

  const idGroups = new Map();
  const missingIdEntries = [];
  const numericMealIds = [];

  categoryData.forEach(({ info, meals }) => {
    meals.forEach((meal, index) => {
      if (!meal || typeof meal !== 'object') return;
      const entry = { meal, info, index, meals };
      const rawId = meal.id;
      const id = rawId == null ? '' : String(rawId).trim();
      if (!id || !/^[0-9]+$/.test(id)) {
        missingIdEntries.push(entry);
        return;
      }
      numericMealIds.push(id);
      if (!idGroups.has(id)) {
        idGroups.set(id, []);
      }
      idGroups.get(id).push(entry);
    });
  });

  let nextSeed = parseInt(nextUnusedItemId(workingMap, numericMealIds), 10);
  if (!Number.isFinite(nextSeed)) {
    nextSeed = 1;
  }
  let maxId = nextSeed - 1;

  let mealsUpdated = 0;
  let mapUpdates = 0;
  const dirtyKeys = new Set();

  const ensureMap = (name, id) => {
    if (!name) return;
    const strId = String(id);
    if (workingMap[name] !== strId) {
      workingMap[name] = strId;
      mapUpdates += 1;
    }
  };

  const setReverse = (id, name) => {
    if (!id || !name) return;
    reverseMap[id] = name;
  };

  const allocateNewId = () => {
    maxId += 1;
    return String(maxId);
  };

  const canonical = value => canonicalName(value || '');

  for (const [id, entries] of idGroups.entries()) {
    if (entries.length === 0) continue;
    if (entries.length === 1) {
      const [entry] = entries;
      const normalizedId = String(entry.meal.id ?? id);
      ensureMap(entry.meal.name, normalizedId);
      setReverse(normalizedId, entry.meal.name);
      continue;
    }
    const keeperName = reverseMap[id];
    const keeperCanonical = keeperName ? canonical(keeperName) : null;
    let keeper = null;
    if (keeperCanonical) {
      keeper = entries.find(e => canonical(e.meal.name) === keeperCanonical) || null;
    }
    if (!keeper) {
      keeper = entries[0];
    }
    entries.forEach(entry => {
      if (entry === keeper) {
        const normalizedId = String(entry.meal.id ?? id);
        ensureMap(entry.meal.name, normalizedId);
        setReverse(normalizedId, entry.meal.name);
        return;
      }
      const newId = allocateNewId();
      entry.meal.id = newId;
      ensureMap(entry.meal.name, newId);
      setReverse(newId, entry.meal.name);
      dirtyKeys.add(entry.info.key);
      mealsUpdated += 1;
    });
  }

  missingIdEntries.forEach(entry => {
    const newId = allocateNewId();
    entry.meal.id = newId;
    ensureMap(entry.meal.name, newId);
    setReverse(newId, entry.meal.name);
    dirtyKeys.add(entry.info.key);
    mealsUpdated += 1;
  });

  idGroups.forEach(entries => {
    entries.forEach(entry => {
      ensureMap(entry.meal.name, entry.meal.id);
      setReverse(String(entry.meal.id), entry.meal.name);
    });
  });
  missingIdEntries.forEach(entry => {
    ensureMap(entry.meal.name, entry.meal.id);
    setReverse(String(entry.meal.id), entry.meal.name);
  });

  const mapChanged = mapUpdates > 0;
  const mealsChanged = mealsUpdated > 0;

  if (mealsChanged) {
    await Promise.all(
      Array.from(dirtyKeys).map(async mealKey => {
        const list = mealsByKey.get(mealKey);
        if (list) {
          await saveItemArray(mealKey, list);
        }
      })
    );
  }

  if (mapChanged) {
    await saveItemNameMap(workingMap);
  }

  if (mealsChanged || mapChanged) {
    await calculateAndSaveMealNeeds();
  }

  return { mealsUpdated, mapUpdates };
}

function pricePerHomeUnit(itemName, product) {
  const item = needsMap.get(canonicalName(itemName));
  if (!item || !product || product.priceNumber == null) return null;
  const info = densityMap[itemName] || {};
  const pack = product.packCount && product.packCount > 1 ? product.packCount : 1;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(itemName);
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) {
        return ppu * sheetSqFt;
      }
      if (/ct|count|sheet/.test(ut)) {
        return ppu;
      }
    }
    const totalSheets = product.sizeQty && /sheet/i.test(product.sizeUnit || '')
      ? product.sizeQty
      : null;
    if (totalSheets && product.priceNumber != null) {
      return product.priceNumber / (totalSheets * pack);
    }
  }
  if (unit === 'each') {
    return product.priceNumber / pack;
  }
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * pack;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * pack,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  } else if (unitType && unitType !== 'oz') {
    const conv = convertWithDensity(1, unitType, 'oz', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!isNaN(conv) && conv > 0) {
      pricePerOz = pricePerOz / conv;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convertWithDensity(
      1,
      item.home_unit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(ozPerUnit) && ozPerUnit > 0) {
      return pricePerOz * ozPerUnit;
    }
  }
  return null;
}

async function ingredientCost(name, amountStr) {
  const prod = await loadFinalProduct(name);
  if (!prod) return null;
  const { pricePerUnit: ppu, unitType } = getPriceUnitInfo(prod);
  const pricePerUnit = pricePerHomeUnit(name, prod);
  if (pricePerUnit == null && !(unitType === 'fl oz' && ppu != null)) return null;
  const item = needsMap.get(canonicalName(name));
  if (!item) return null;
  const { value, unit } = parseQuantity(amountStr);
  if (!value) return null;
  let qty = value;
  if (unit && item.home_unit && unit.toLowerCase() !== item.home_unit.toLowerCase()) {
    const info = densityMap[name] || {};
    qty = convertWithDensity(value, unit, item.home_unit, {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
  }
  if (qty == null || isNaN(qty)) return null;
  if (unitType === 'fl oz' && ppu != null) {
    const fromUnit = item.home_unit || unit;
    const flozQty = convert(qty, fromUnit, 'fl oz');
    if (!isNaN(flozQty)) {
      return ppu * flozQty;
    }
  }
  return pricePerUnit * qty;
}

function createRows(meal, arr) {
  const rows = [];
  const ingredients = meal.ingredients || [];
  const ingCells = [];
  const spanCells = [];
  const canonicalMeal = canonicalName(meal.name || '');
  let imageTd;
  let nameTd;
  let weightTd;
  let portionTd;
  let editBtn;
  if (!Array.isArray(meal.users)) {
    const def = meal.people === undefined ? (meal.active === false ? 0 : 1) : meal.people;
    meal.users = userNames.map((_, i) => i < def);
  }
  if (meal.users.length < userNames.length) {
    for (let i = meal.users.length; i < userNames.length; i++) {
      meal.users.push(false);
    }
  }
  meal.people = meal.users.filter(Boolean).length;

  const mealCost = { total: 0 };
  const costPromises = [];
  let firstTotalTd = null;

  function buildInstructionsButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'meal-instructions-btn';
    const hasInstructions = meal.instructions && meal.instructions.length > 0;
    button.textContent = hasInstructions ? 'Instructions' : 'Add instructions';
    if (!hasInstructions) {
      button.classList.add('meal-instructions-btn--empty');
    }
    button.addEventListener('click', () => {
      const query = new URLSearchParams();
      if (type) query.set('type', type);
      if (meal.id !== undefined && meal.id !== null) {
        query.set('mealId', String(meal.id));
      }
      if (meal.name) {
        query.set('meal', meal.name);
      }
      const qs = query.toString();
      const path = qs ? `mealInstructions.html?${qs}` : 'mealInstructions.html';
      openOrFocusWindow(path);
    });
    return button;
  }

  function buildNutritionButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'meal-nutrition-btn';
    button.textContent = 'Nutrition';
    button.addEventListener('click', () => {
      const query = new URLSearchParams();
      if (type) query.set('type', type);
      if (meal.id !== undefined && meal.id !== null) {
        query.set('mealId', String(meal.id));
      }
      if (meal.name) {
        query.set('meal', meal.name);
      }
      try {
        const payload = { ...meal };
        query.set('mealData', JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to serialize meal for nutrition popup', err);
      }
      const qs = query.toString();
      const path = qs ? `mealNutritionInfo.html?${qs}` : 'mealNutritionInfo.html';
      openOrFocusWindow(path);
    });
    return button;
  }

  async function persistMealChange() {
    refreshMealNutrition(meal);
    await saveMeals(arr);
    await calculateAndSaveMealNeeds();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'inventory-updated' });
    }
  }

  ingredients.forEach((ing, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0 && canonicalMeal) {
      tr.dataset.mealName = canonicalMeal;
    }
    if (idx === 0) {
      const useTd = document.createElement('td');
      useTd.classList.add('use-cell');
      const useContainer = document.createElement('div');
      useContainer.className = 'use-cell-content';
      useTd.appendChild(useContainer);
      const chks = [];
      userNames.forEach((u, i) => {
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = meal.users[i];
        chk.addEventListener('change', async () => {
          meal.users[i] = chk.checked;
          meal.people = meal.users.filter(Boolean).length;
          meal.active = meal.people > 0;
          await persistMealChange();
        });
        chks.push(chk);
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(` ${u} `));
        const portionInput = document.createElement('input');
        portionInput.type = 'number';
        portionInput.step = '0.01';
        portionInput.className = 'portion-input';
        portionInput.value = String(
          (Array.isArray(meal.userPortionOverrides)
            ? meal.userPortionOverrides[i]
            : undefined) ?? defaultPortionFor(i)
        );
        portionInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            portionInput.blur();
          }
        });
        portionInput.addEventListener('blur', async () => {
          const base = defaultPortionFor(i);
          const current = Array.isArray(meal.userPortionOverrides)
            ? meal.userPortionOverrides
            : [];
          const previous = current.slice();
          const prevValue = previous[i];
          const raw = portionInput.value.trim();
          if (raw === '') {
            if (previous.length > i) {
              previous[i] = undefined;
            }
            const sanitized = sanitizeOverrides(previous, userNames.length);
            if (!overridesEqual(sanitized, current)) {
              meal.userPortionOverrides = sanitized;
              await persistMealChange();
            }
            portionInput.value = String(base);
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num)) {
            const fallback = prevValue !== undefined ? prevValue : base;
            portionInput.value = String(fallback);
            return;
          }
          const newOverrides = previous.slice();
          if (sameMultiplier(num, base)) {
            if (newOverrides.length > i) newOverrides[i] = undefined;
          } else {
            newOverrides[i] = num;
          }
          const sanitized = sanitizeOverrides(newOverrides, userNames.length);
          if (!overridesEqual(sanitized, current)) {
            meal.userPortionOverrides = sanitized;
            await persistMealChange();
          }
          portionInput.value = String(sameMultiplier(num, base) ? base : num);
        });
        lbl.appendChild(portionInput);
        useContainer.appendChild(lbl);
      });
      if (ingredients.length > 1) useTd.rowSpan = ingredients.length;
      spanCells.push(useTd);

      const prepTd = document.createElement('td');
      const prepChk = document.createElement('input');
      prepChk.type = 'checkbox';
      prepChk.checked = meal.prepared || false;
      const prepAheadLabel = document.createElement('label');
      prepAheadLabel.style.marginLeft = '4px';
      const prepAheadChk = document.createElement('input');
      prepAheadChk.type = 'checkbox';
      prepAheadChk.checked = meal.prepAhead || false;
      prepAheadLabel.appendChild(prepAheadChk);
      prepAheadLabel.appendChild(document.createTextNode(' prep ahead'));
      function togglePrepAhead() {
        prepAheadLabel.style.display = prepChk.checked ? '' : 'none';
        if (!prepChk.checked) {
          prepAheadChk.checked = false;
          meal.prepAhead = false;
        }
      }
      togglePrepAhead();
      prepChk.addEventListener('change', async () => {
        meal.prepared = prepChk.checked;
        togglePrepAhead();
        await saveMeals(arr);
      });
      prepAheadChk.addEventListener('change', async () => {
        meal.prepAhead = prepAheadChk.checked;
        await saveMeals(arr);
      });
      prepTd.appendChild(prepChk);
      prepTd.appendChild(prepAheadLabel);
      if (ingredients.length > 1) prepTd.rowSpan = ingredients.length;
      spanCells.push(prepTd);

      const leftoverTd = document.createElement('td');
      const leftoverChk = document.createElement('input');
      leftoverChk.type = 'checkbox';
      leftoverChk.checked = meal.leftoverOk || false;
      leftoverChk.addEventListener('change', async () => {
        meal.leftoverOk = leftoverChk.checked;
        await saveMeals(arr);
      });
      leftoverTd.style.textAlign = 'center';
      leftoverTd.appendChild(leftoverChk);
      if (ingredients.length > 1) leftoverTd.rowSpan = ingredients.length;
      spanCells.push(leftoverTd);

      weightTd = document.createElement('td');
      weightTd.style.textAlign = 'center';
      weightTd.textContent = formatWeightValue(meal.weight);
      if (ingredients.length > 1) weightTd.rowSpan = ingredients.length;
      spanCells.push(weightTd);

      portionTd = document.createElement('td');
      portionTd.style.textAlign = 'center';
      portionTd.textContent = formatPortionCount(meal.totalPortions);
      if (ingredients.length > 1) portionTd.rowSpan = ingredients.length;
      spanCells.push(portionTd);

      const groupTd = document.createElement('td');
      const groupChk = document.createElement('input');
      groupChk.type = 'checkbox';
      groupChk.checked = meal.groupMeal || false;
      groupChk.addEventListener('change', async () => {
        meal.groupMeal = groupChk.checked;
        await saveMeals(arr);
      });
      groupTd.style.textAlign = 'center';
      groupTd.appendChild(groupChk);
      if (ingredients.length > 1) groupTd.rowSpan = ingredients.length;
      spanCells.push(groupTd);

      imageTd = document.createElement('td');
      const img = document.createElement('img');
      img.className = 'meal-img';
      img.style.display = 'none';
      imageTd.appendChild(img);
      if (ingredients.length > 1) imageTd.rowSpan = ingredients.length;
      spanCells.push(imageTd);

      nameTd = document.createElement('td');
      nameTd.style.minWidth = '200px';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = meal.name || '';
      nameTd.appendChild(nameSpan);
      if (ingredients.length > 1) nameTd.rowSpan = ingredients.length;
      spanCells.push(nameTd);

      setMealImage(img, meal);

      editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.style.display = deleteMode ? '' : 'none';
      deleteButtons.push(delBtn);
      delBtn.addEventListener('click', async () => {
        const idx = arr.indexOf(meal);
        if (idx !== -1) arr.splice(idx, 1);
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
        loadAndRender();
      });

      nameTd.appendChild(document.createElement('br'));
      nameTd.appendChild(editBtn);
      nameTd.appendChild(document.createTextNode(' '));
      const instructionsBtn = buildInstructionsButton();
      nameTd.appendChild(instructionsBtn);
      nameTd.appendChild(document.createTextNode(' '));
      const nutritionBtn = buildNutritionButton();
      nameTd.appendChild(nutritionBtn);
      nameTd.appendChild(document.createTextNode(' '));
      nameTd.appendChild(delBtn);

      const summaryNode = buildNutritionSummary(meal);
      if (summaryNode) {
        nameTd.appendChild(document.createElement('br'));
        nameTd.appendChild(summaryNode);
      }

      tr.appendChild(useTd);
      tr.appendChild(imageTd);
      tr.appendChild(nameTd);
      tr.appendChild(prepTd);
      tr.appendChild(leftoverTd);
      tr.appendChild(weightTd);
      tr.appendChild(portionTd);
      tr.appendChild(groupTd);
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';
    if (ing.name) ingTd.dataset.name = ing.name;

    const prepItemTd = document.createElement('td');
    prepItemTd.style.textAlign = 'center';
    const prepItemChk = document.createElement('input');
    prepItemChk.type = 'checkbox';
    prepItemChk.checked = !!ing.prepAhead;
    prepItemChk.addEventListener('change', async () => {
      ing.prepAhead = prepItemChk.checked;
      await persistMealChange();
    });
    prepItemTd.appendChild(prepItemChk);

    const amtTd = document.createElement('td');
    amtTd.textContent = formatIngredientAmount(ing);

    ingCells.push({ ingTd, amtTd, prepTd: prepItemTd, tr });

    const costTd = document.createElement('td');
    let totalTd;
    if (idx === 0) {
      totalTd = document.createElement('td');
      if (ingredients.length > 1) totalTd.rowSpan = ingredients.length;
      spanCells.push(totalTd);
      firstTotalTd = totalTd;
    }

    const actionTd = document.createElement('td');
    if (ing.name) actionTd.dataset.name = ing.name;
    const key = ing.name ? canonicalName(ing.name) : '';
    if (ing.name && !inventorySet.has(key)) {
      ingTd.style.color = 'red';
      actionTd.appendChild(createAddButton(ing.name));
    }

    const nutritionControls = buildIngredientNutritionControls(ing);
    if (nutritionControls) {
      actionTd.appendChild(nutritionControls);
    }

    tr.appendChild(ingTd);
    tr.appendChild(prepItemTd);
    tr.appendChild(amtTd);
    tr.appendChild(costTd);
    if (totalTd) tr.appendChild(totalTd);
    tr.appendChild(actionTd);
    rows.push(tr);

    if (ing.name) {
      if (!ingredientCells[key]) ingredientCells[key] = [];
      ingredientCells[key].push({ ingTd, actionTd, displayName: ing.name });
      const promise = ingredientCost(ing.name, ing.amount || ing.serving_size).then(c => {
        if (c != null) {
          costTd.textContent = `$${c.toFixed(2)}`;
          mealCost.total += c;
        }
      });
      costPromises.push(promise);
    }
  });

  Promise.all(costPromises).then(async () => {
    if (firstTotalTd && mealCost.total > 0) {
      const total = parseFloat(mealCost.total.toFixed(2));
      firstTotalTd.textContent = `$${total.toFixed(2)}`;
      if (meal.totalCost !== total) {
        meal.totalCost = total;
        await saveMeals(arr);
      }
    }
  });

  if (ingredients.length === 0) {
    const tr = document.createElement('tr');
    if (canonicalMeal) {
      tr.dataset.mealName = canonicalMeal;
    }
    const useTd = document.createElement('td');
    useTd.classList.add('use-cell');
    const useContainer = document.createElement('div');
    useContainer.className = 'use-cell-content';
    useTd.appendChild(useContainer);
    const chks = [];
    userNames.forEach((u, i) => {
      const lbl = document.createElement('label');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = meal.users[i];
      chk.addEventListener('change', async () => {
        meal.users[i] = chk.checked;
        meal.people = meal.users.filter(Boolean).length;
        meal.active = meal.people > 0;
        await persistMealChange();
      });
      chks.push(chk);
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(` ${u} `));
      const portionInput = document.createElement('input');
      portionInput.type = 'number';
      portionInput.step = '0.01';
      portionInput.className = 'portion-input';
      portionInput.value = String(
        (Array.isArray(meal.userPortionOverrides)
          ? meal.userPortionOverrides[i]
          : undefined) ?? defaultPortionFor(i)
      );
      portionInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          portionInput.blur();
        }
      });
      portionInput.addEventListener('blur', async () => {
        const base = defaultPortionFor(i);
        const current = Array.isArray(meal.userPortionOverrides)
          ? meal.userPortionOverrides
          : [];
        const previous = current.slice();
        const prevValue = previous[i];
        const raw = portionInput.value.trim();
        if (raw === '') {
          if (previous.length > i) {
            previous[i] = undefined;
          }
          const sanitized = sanitizeOverrides(previous, userNames.length);
          if (!overridesEqual(sanitized, current)) {
            meal.userPortionOverrides = sanitized;
            await persistMealChange();
          }
          portionInput.value = String(base);
          return;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          const fallback = prevValue !== undefined ? prevValue : base;
          portionInput.value = String(fallback);
          return;
        }
        const newOverrides = previous.slice();
        if (sameMultiplier(num, base)) {
          if (newOverrides.length > i) newOverrides[i] = undefined;
        } else {
          newOverrides[i] = num;
        }
        const sanitized = sanitizeOverrides(newOverrides, userNames.length);
        if (!overridesEqual(sanitized, current)) {
          meal.userPortionOverrides = sanitized;
          await persistMealChange();
        }
        portionInput.value = String(sameMultiplier(num, base) ? base : num);
      });
      lbl.appendChild(portionInput);
      useContainer.appendChild(lbl);
    });
    imageTd = document.createElement('td');
    const img = document.createElement('img');
    img.className = 'meal-img';
    img.style.display = 'none';
    imageTd.appendChild(img);
    spanCells.push(useTd);
    spanCells.push(imageTd);

    nameTd = document.createElement('td');
    nameTd.style.minWidth = '200px';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = meal.name || '';
    nameTd.appendChild(nameSpan);
    setMealImage(img, meal);
    spanCells.push(nameTd);
    editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.display = deleteMode ? '' : 'none';
    deleteButtons.push(delBtn);
    delBtn.addEventListener('click', async () => {
      const idx = arr.indexOf(meal);
      if (idx !== -1) arr.splice(idx, 1);
      await saveMeals(arr);
      await calculateAndSaveMealNeeds();
      loadAndRender();
    });
    nameTd.appendChild(document.createElement('br'));
    nameTd.appendChild(editBtn);
    nameTd.appendChild(document.createTextNode(' '));
    const instructionsBtn = buildInstructionsButton();
    nameTd.appendChild(instructionsBtn);
    nameTd.appendChild(document.createTextNode(' '));
    nameTd.appendChild(delBtn);

    const prepTd = document.createElement('td');
    const prepChk = document.createElement('input');
    prepChk.type = 'checkbox';
    prepChk.checked = meal.prepared || false;
    const prepAheadLabel = document.createElement('label');
    prepAheadLabel.style.marginLeft = '4px';
    const prepAheadChk = document.createElement('input');
    prepAheadChk.type = 'checkbox';
    prepAheadChk.checked = meal.prepAhead || false;
    prepAheadLabel.appendChild(prepAheadChk);
    prepAheadLabel.appendChild(document.createTextNode(' prep ahead'));
    function togglePrepAhead2() {
      prepAheadLabel.style.display = prepChk.checked ? '' : 'none';
      if (!prepChk.checked) {
        prepAheadChk.checked = false;
        meal.prepAhead = false;
      }
    }
    togglePrepAhead2();
    prepChk.addEventListener('change', async () => {
      meal.prepared = prepChk.checked;
      togglePrepAhead2();
      await saveMeals(arr);
    });
    prepAheadChk.addEventListener('change', async () => {
      meal.prepAhead = prepAheadChk.checked;
      await saveMeals(arr);
    });
    prepTd.appendChild(prepChk);
    prepTd.appendChild(prepAheadLabel);
    spanCells.push(prepTd);

    const leftoverTd = document.createElement('td');
    const leftoverChk = document.createElement('input');
    leftoverChk.type = 'checkbox';
    leftoverChk.checked = meal.leftoverOk || false;
    leftoverChk.addEventListener('change', async () => {
      meal.leftoverOk = leftoverChk.checked;
      await saveMeals(arr);
    });
    leftoverTd.style.textAlign = 'center';
    leftoverTd.appendChild(leftoverChk);
    spanCells.push(leftoverTd);

    weightTd = document.createElement('td');
    weightTd.style.textAlign = 'center';
    weightTd.textContent = formatWeightValue(meal.weight);
    spanCells.push(weightTd);

    portionTd = document.createElement('td');
    portionTd.style.textAlign = 'center';
    portionTd.textContent = formatPortionCount(meal.totalPortions);
    spanCells.push(portionTd);

    const groupTd = document.createElement('td');
    const groupChk = document.createElement('input');
    groupChk.type = 'checkbox';
    groupChk.checked = meal.groupMeal || false;
    groupChk.addEventListener('change', async () => {
      meal.groupMeal = groupChk.checked;
      await saveMeals(arr);
    });
    groupTd.style.textAlign = 'center';
    groupTd.appendChild(groupChk);
    spanCells.push(groupTd);

    const ingTd = document.createElement('td');
    const prepItemTd = document.createElement('td');
    prepItemTd.style.textAlign = 'center';
    const amtTd = document.createElement('td');
    ingCells.push({ ingTd, amtTd, prepTd: prepItemTd, tr });
    const costTd = document.createElement('td');
    const totalTd = document.createElement('td');
    spanCells.push(totalTd);
    const actionTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(prepTd);
    tr.appendChild(leftoverTd);
    tr.appendChild(weightTd);
    tr.appendChild(portionTd);
    tr.appendChild(groupTd);
    tr.appendChild(ingTd);
    tr.appendChild(prepItemTd);
    tr.appendChild(amtTd);
    tr.appendChild(costTd);
    tr.appendChild(totalTd);
    tr.appendChild(actionTd);
    rows.push(tr);
  }

  editBtn.addEventListener('click', () => {
    if (editBtn.classList.contains('editing')) {
      hideEdit();
    } else {
      showEdit();
    }
  });

  function showEdit() {
    editBtn.classList.add('editing');
    const rowsInfo = [];
    const addedRows = [];
    const baseSpan = Math.max(ingCells.length, 1);
    const spanElems = spanCells;
    let mealInput;
    let bookInput;
    let categorySelect;
    let mealLabel;
    let categoryLabel;
    let bookLabel;
    let saveBtn;
    let changeBtn;
    let fileInput;
    let newImage = null;
    let newIngBtn;
    let weightInput;
    let portionInput;

    function updateRowSpans() {
      const val = baseSpan + addedRows.length;
      spanElems.forEach(td => {
        if (!td) return;
        if (val > 1) td.rowSpan = val; else td.removeAttribute('rowspan');
      });
    }

    function checkSave() {
      const any =
        (mealInput && mealInput.value.trim()) ||
        (bookInput && bookInput.value.trim()) ||
        (categorySelect && categorySelect.value !== type) ||
        (weightInput && weightInput.value.trim()) ||
        (portionInput && portionInput.value.trim()) ||
        rowsInfo.some(r => {
          if (r.nameInput.value.trim() || r.qtyInput.value.trim()) return true;
          if (r.prepInput && r.prepInput.checked !== r.initialPrep) return true;
          return false;
        }) ||
        newImage;
      if (saveBtn) saveBtn.style.display = any ? '' : 'none';
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }

    function addInputs(cell, ing = {}) {
      const { ingTd, amtTd, prepTd } = cell;
      const nameInput = document.createElement('textarea');
      nameInput.rows = 1;
      nameInput.style.display = 'block';
      nameInput.style.marginTop = '2px';
      nameInput.style.width = '98%';
      nameInput.style.overflow = 'hidden';
      nameInput.value = ing.name || '';
      ingTd.innerHTML = '';
      ingTd.appendChild(nameInput);

      const qtyInput = document.createElement('input');
      qtyInput.type = 'text';
      qtyInput.style.width = '40px';
      qtyInput.style.marginRight = '2px';
      const select = document.createElement('select');
      units.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        select.appendChild(opt);
      });
      const { value, unit } = parseQuantity(ing.amount || ing.serving_size);
      if (value) qtyInput.value = value;
      if (unit) select.value = unit;
      amtTd.innerHTML = '';
      amtTd.appendChild(qtyInput);
      amtTd.appendChild(select);

      const prepChk = document.createElement('input');
      prepChk.type = 'checkbox';
      prepChk.checked = !!ing.prepAhead;
      prepTd.innerHTML = '';
      prepTd.style.textAlign = 'center';
      prepTd.appendChild(prepChk);

      autoResize(nameInput);

      nameInput.addEventListener('input', () => {
        autoResize(nameInput);
        checkSave();
      });
      qtyInput.addEventListener('input', checkSave);
      select.addEventListener('change', checkSave);
      prepChk.addEventListener('change', checkSave);
      [nameInput, qtyInput, select].forEach(el =>
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        })
      );

      rowsInfo.push({
        nameInput,
        qtyInput,
        select,
        prepInput: prepChk,
        initialPrep: !!ing.prepAhead,
        prepCell: prepTd
      });
    }

    mealInput = document.createElement('input');
    mealInput.style.display = 'block';
    mealInput.style.marginTop = '2px';
    mealInput.style.width = '95%';
    saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    saveBtn.style.marginTop = '2px';
    changeBtn = document.createElement('button');
    changeBtn.textContent = 'Change';
    changeBtn.style.display = 'block';
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    changeBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        newImage = reader.result;
        setMealImage(imageTd.querySelector('img.meal-img'), { ...meal, image: newImage });
        checkSave();
      };
      reader.readAsDataURL(file);
    });

    newIngBtn = document.createElement('button');
    newIngBtn.textContent = 'New Ingredient';
    newIngBtn.style.display = 'block';
    newIngBtn.style.marginTop = '2px';
    newIngBtn.addEventListener('click', () => {
      const tr = document.createElement('tr');
      const ingTd = document.createElement('td');
      const prepTd = document.createElement('td');
      prepTd.style.textAlign = 'center';
      const amtTd = document.createElement('td');
      const costTd = document.createElement('td');
      const actionTd = document.createElement('td');
      tr.appendChild(ingTd);
      tr.appendChild(prepTd);
      tr.appendChild(amtTd);
      tr.appendChild(costTd);
      tr.appendChild(actionTd);
      rows[rows.length - 1].after(tr);
      rows.push(tr);
      const cell = { ingTd, amtTd, prepTd, tr };
      ingCells.push(cell);
      addedRows.push(tr);
      addInputs(cell, { prepAhead: meal.prepared && meal.prepAhead });
      updateRowSpans();
    });

    weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0.1';
    weightInput.step = '0.1';
    weightInput.style.width = '40px';
    weightInput.style.marginTop = '2px';
    weightInput.style.display = 'block';
    weightInput.value = meal.weight ?? 1;
    weightInput.addEventListener('input', checkSave);

    if (weightTd) {
      weightTd.textContent = '';
      weightTd.appendChild(weightInput);
    }

    portionInput = document.createElement('input');
    portionInput.type = 'number';
    portionInput.min = '0.01';
    portionInput.step = '0.01';
    portionInput.style.width = '48px';
    portionInput.style.marginTop = '2px';
    portionInput.style.display = 'block';
    portionInput.value = sanitizePortionCount(meal.totalPortions);
    portionInput.addEventListener('input', checkSave);

    if (portionTd) {
      portionTd.textContent = '';
      portionTd.appendChild(portionInput);
    }

    bookInput = document.createElement('input');
    bookInput.style.display = 'block';
    bookInput.style.marginTop = '2px';
    bookInput.style.width = '95%';
    bookInput.value = meal.recipeBook || '';

    categorySelect = document.createElement('select');
    Object.keys(MEAL_TYPES).forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = MEAL_TYPES[cat].label;
      categorySelect.appendChild(opt);
    });
    categorySelect.value = type;
    categorySelect.style.display = 'block';
    categorySelect.style.marginTop = '2px';
    categorySelect.style.width = '95%';
    categorySelect.addEventListener('change', checkSave);

    mealLabel = document.createElement('label');
    mealLabel.textContent = 'Meal Name:';
    mealLabel.style.display = 'block';
    mealLabel.style.marginTop = '2px';
    mealLabel.appendChild(mealInput);

    categoryLabel = document.createElement('label');
    categoryLabel.textContent = 'Meal Category:';
    categoryLabel.style.display = 'block';
    categoryLabel.style.marginTop = '2px';
    categoryLabel.appendChild(categorySelect);

    bookLabel = document.createElement('label');
    bookLabel.textContent = 'Recipe Book:';
    bookLabel.style.display = 'block';
    bookLabel.style.marginTop = '2px';
    bookLabel.appendChild(bookInput);

    imageTd.appendChild(changeBtn);
    imageTd.appendChild(fileInput);
    nameTd.appendChild(mealLabel);
    nameTd.appendChild(categoryLabel);
    nameTd.appendChild(bookLabel);
    nameTd.appendChild(newIngBtn);
    weightTd.appendChild(weightInput);
    nameTd.appendChild(saveBtn);
    mealInput.addEventListener('input', checkSave);
    bookInput.addEventListener('input', checkSave);
    bookInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
    });
    mealInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
    });
    saveBtn.addEventListener('click', commit);

    ingCells.forEach((cell, idx) => addInputs(cell, ingredients[idx]));
    updateRowSpans();

    async function commit() {
      const nameVal = mealInput ? mealInput.value.trim() : '';
      const bookVal = bookInput ? bookInput.value.trim() : '';
      const catVal = categorySelect ? categorySelect.value : type;
      let changed = false;
      if (nameVal) {
        meal.name = nameVal;
        changed = true;
      }
      if (bookInput && bookVal !== meal.recipeBook) {
        meal.recipeBook = bookVal;
        changed = true;
      }
      if (categorySelect && catVal !== type) {
        const idx = arr.indexOf(meal);
        if (idx !== -1) arr.splice(idx, 1);
        const destArr = await loadMealsForType(catVal);
        destArr.push(meal);
        await saveMealsForType(catVal, destArr);
        changed = true;
      }
      if (weightInput) {
        const w = parseFloat(weightInput.value);
        const wt = !isNaN(w) && w > 0 ? w : 1;
        if (wt !== meal.weight) {
          meal.weight = wt;
          changed = true;
        }
      }
      if (portionInput) {
        const normalized = sanitizePortionCount(portionInput.value);
        if (normalized !== meal.totalPortions) {
          meal.totalPortions = normalized;
          changed = true;
        }
      }
      const newIngs = [];
      rowsInfo.forEach(r => {
        const n = r.nameInput.value.trim();
        const q = r.qtyInput.value.trim();
        const u = r.select.value;
        if (!n && !q) return;
        const amt = q ? `${q} ${u}` : '';
        newIngs.push({
          name: n,
          amount: amt,
          serving_size: amt,
          prepAhead: !!(r.prepInput && r.prepInput.checked)
        });
      });
      if (JSON.stringify(newIngs) !== JSON.stringify(meal.ingredients)) {
        meal.ingredients = newIngs;
        changed = true;
      }
      if (newImage) {
        meal.image = newImage;
        changed = true;
      }
      if (changed) {
        refreshMealNutrition(meal);
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
      }
      hideEdit();
      if (changed) loadAndRender();
    }

    function hideEdit() {
      rowsInfo.forEach(r => {
        r.nameInput.remove();
        r.qtyInput.remove();
        r.select.remove();
        if (r.prepInput) {
          const parent = r.prepInput.parentElement;
          if (parent) parent.remove();
          else r.prepInput.remove();
        }
        if (r.prepCell) r.prepCell.innerHTML = '';
      });
      rowsInfo.length = 0;
      addedRows.forEach(tr => tr.remove());
      addedRows.length = 0;
      ingCells.forEach((cell, idx) => {
        const ing = meal.ingredients[idx];
        cell.ingTd.textContent = ing?.name || '';
        if (ing?.name) {
          cell.ingTd.dataset.name = ing.name;
        } else {
          delete cell.ingTd.dataset.name;
        }
        cell.amtTd.textContent = formatIngredientAmount(ing);
        if (cell.prepTd) {
          cell.prepTd.innerHTML = '';
          cell.prepTd.style.textAlign = 'center';
          if (ing && typeof ing === 'object') {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = !!ing.prepAhead;
            chk.addEventListener('change', async () => {
              ing.prepAhead = chk.checked;
              await persistMealChange();
            });
            cell.prepTd.appendChild(chk);
          }
        }
      });
      updateRowSpans();
      if (mealLabel) mealLabel.remove();
      if (categoryLabel) categoryLabel.remove();
      if (bookLabel) bookLabel.remove();
      if (newIngBtn) newIngBtn.remove();
      if (saveBtn) saveBtn.remove();
      if (changeBtn) changeBtn.remove();
      if (fileInput) fileInput.remove();
      if (weightInput) weightInput.remove();
      if (portionInput) portionInput.remove();
      if (weightTd) {
        weightTd.textContent = formatWeightValue(meal.weight);
      }
      if (portionTd) {
        portionTd.textContent = formatPortionCount(meal.totalPortions);
      }
      newImage = null;
      setMealImage(imageTd.querySelector('img.meal-img'), meal);
      editBtn.classList.remove('editing');
    }

    showEdit.hideEdit = hideEdit;
  }

  function hideEdit() {
    if (typeof showEdit.hideEdit === 'function') showEdit.hideEdit();
  }

  return rows;
}

function updateInventoryDisplay() {
  Object.entries(ingredientCells).forEach(([name, cells]) => {
    const inStock = inventorySet.has(name);
    cells.forEach(({ ingTd, actionTd, displayName }) => {
      ingTd.style.color = inStock ? '' : 'red';
      const existingAdd = actionTd.querySelector('.add-inventory-btn');
      if (inStock) {
        if (existingAdd) existingAdd.remove();
      } else if (!existingAdd) {
        const label = displayName || ingTd?.dataset?.name || name;
        actionTd.prepend(createAddButton(label));
      }
    });
  });
}

async function loadAndRender() {
  const scrollTop = window.scrollY;
  const tbody = document.getElementById('mealBody');
  tbody.innerHTML = '';
  deleteButtons.length = 0;
  Object.keys(ingredientCells).forEach(k => delete ingredientCells[k]);
  ingredientNutritionButtons.clear();
  ingredientNutritionContexts.clear();
  const [meals, stock, users, portionMultipliers] = await Promise.all([
    loadMeals(),
    loadStock(),
    loadUsers(),
    loadUserPortionMultipliers()
  ]);
  userNames = users;
  userPortionDefaults = users.map((_, idx) => {
    const val = portionMultipliers[idx];
    return typeof val === 'number' && Number.isFinite(val) ? val : 1;
  });
  let overridesChanged = false;
  meals.forEach(meal => {
    if (normalizeMealOverrides(meal)) overridesChanged = true;
  });
  const nutritionChanged = refreshMealNutrition(meals);
  if (overridesChanged || nutritionChanged) {
    await saveMeals(meals);
  }
  inventorySet = new Set(stock.map(s => canonicalName(s.name)));
  const bookMap = {};
  meals.forEach(m => {
    const book = m.recipeBook || '';
    if (!bookMap[book]) bookMap[book] = [];
    bookMap[book].push(m);
  });
  const headerColspan = 12;
  const bookNames = Object.keys(bookMap).sort((a, b) => a.localeCompare(b));
  const validBooks = new Set(bookNames);
  if (focusBook !== null && validBooks.has(focusBook)) {
    expandedBooks.set(focusBook, true);
  }
  expandedBooks.forEach((_, book) => {
    if (!validBooks.has(book)) {
      expandedBooks.delete(book);
    }
  });
  bookNames.forEach(book => {
    const headerTr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'book-header';
    th.colSpan = headerColspan;
    th.textContent = book || 'Uncategorized';
    headerTr.appendChild(th);
    tbody.appendChild(headerTr);
    const rows = [];
    let expanded = expandedBooks.get(book);
    if (expanded === undefined) expanded = false;
    bookMap[book].forEach(meal => {
      const r = createRows(meal, meals);
      r.forEach(row => {
        row.dataset.book = book;
        row.style.display = expanded ? '' : 'none';
        rows.push(row);
        tbody.appendChild(row);
      });
    });
    th.addEventListener('click', () => {
      expanded = !expanded;
      rows.forEach(r => (r.style.display = expanded ? '' : 'none'));
      if (rows.length > 0) {
        expandedBooks.set(book, expanded);
      } else {
        expandedBooks.delete(book);
      }
    });
  });
  updateInventoryDisplay();
  await calculateAndSaveMealNeeds();
  await updateNutritionButtons();
  if (!focusHandled) {
    let targetRow = null;
    if (focusMealName) {
      const candidates = tbody.querySelectorAll('[data-meal-name]');
      targetRow = Array.from(candidates).find(
        row => row.dataset.mealName === focusMealName
      );
    }
    if (focusMealName && targetRow) {
      focusHandled = true;
      const rect = targetRow.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const offset = rect.top + window.scrollY - Math.max((viewportHeight - rect.height) / 2, 0);
      const clampedOffset = offset < 0 ? 0 : offset;
      window.scrollTo({ top: clampedOffset });
      targetRow.classList.add('focused-meal');
      setTimeout(() => {
        if (targetRow.isConnected) {
          targetRow.classList.remove('focused-meal');
        }
      }, 2000);
      return;
    }
    focusHandled = true;
  }
  window.scrollTo(0, scrollTop);
}

async function init() {
  await initializeMealCategories();
  await initUomTable();
  const [needs, dMap, defaults, u, ingredients] = await Promise.all([
    loadNeeds(),
    loadDensityMap(),
    loadGlobalProduceMeasures(),
    loadUnits(),
    getIngredientMap()
  ]);
  needsMap = new Map(needs.map(n => [canonicalName(n.name), n]));
  densityMap = dMap;
  globalProduceMeasures = defaults || {};
  ingredientMap = ingredients || {};
  await reloadNutritionTargets();
  units = u;
  const info = MEAL_TYPES[type] || MEAL_TYPES.breakfast;
  key = info.key;
  path = info.path;
  label = info.label;
  document.getElementById('title').textContent = `${label} Meals`;
  visibilityCheckbox = document.getElementById('displayOnWhatToCook');
  if (visibilityCheckbox) {
    try {
      whatToCookVisibility = await loadWhatToCookVisibility();
    } catch (err) {
      console.error('Failed to load What To Cook visibility settings', err);
      whatToCookVisibility = {};
    }
    setVisibilityCheckboxState(whatToCookVisibility[type] !== false);
    visibilityCheckbox.addEventListener('change', async () => {
      if (suppressVisibilityChange) return;
      const checked = visibilityCheckbox.checked;
      const nextMap = { ...whatToCookVisibility, [type]: checked };
      whatToCookVisibility = nextMap;
      try {
        await saveWhatToCookVisibility(nextMap);
      } catch (err) {
        console.error('Failed to save What To Cook visibility settings', err);
      }
    });
  }
  const addBtn = document.getElementById('addMeal');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openOrFocusWindow(`addMeal.html?type=${type}`);
    });
  }
  const removeBtn = document.getElementById('removeMeal');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      deleteMode = !deleteMode;
      removeBtn.textContent = deleteMode ? 'Done' : 'Remove Meal';
      deleteButtons.forEach(btn => {
        btn.style.display = deleteMode ? '' : 'none';
      });
    });
  }
  const repairBtn = document.getElementById('repairMealIds');
  if (repairBtn) {
    repairBtn.addEventListener('click', async () => {
      const originalText = repairBtn.textContent;
      repairBtn.disabled = true;
      repairBtn.textContent = 'Correcting…';
      try {
        const { mealsUpdated, mapUpdates } = await correctMealIdErrors();
        if (mealsUpdated === 0 && mapUpdates === 0) {
          alert('No meal id errors were found.');
        } else {
          const parts = [];
          if (mealsUpdated > 0) {
            parts.push(`${mealsUpdated} meal id${mealsUpdated === 1 ? '' : 's'} updated`);
          }
          if (mapUpdates > 0) {
            parts.push(`${mapUpdates} name mapping${mapUpdates === 1 ? '' : 's'} adjusted`);
          }
          alert(`Corrected ${parts.join(' and ')}.`);
          try {
            await loadAndRender();
          } catch (refreshErr) {
            console.error('Failed to refresh meal list after id repair', refreshErr);
          }
        }
      } catch (err) {
        console.error('Failed to repair meal ids', err);
        alert('Failed to correct meal id errors. Please try again.');
      } finally {
        repairBtn.disabled = false;
        repairBtn.textContent = originalText;
      }
    });
  }
  await loadAndRender();

  try {
    const pending = await getPendingMatches();
    if (pending && Object.keys(pending).length) {
      handlePendingMatchesChange({ newValue: pending, oldValue: {} });
    }
  } catch (err) {
    console.error('Failed to preload pending nutrition matches', err);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const reloads = [];
    if (changes.ingredientRecords) {
      reloads.push(
        getIngredientMap()
          .then(map => {
            ingredientMap = map || {};
            return updateNutritionButtons();
          })
          .catch(err => {
            console.error('Failed to refresh ingredient records', err);
          })
      );
    }
    if (changes.pendingIngredientMatches) {
      handlePendingMatchesChange(changes.pendingIngredientMatches);
    }
    if (changes.densityRatios) {
      reloads.push(
        loadDensityMap()
          .then(map => {
            densityMap = map || {};
          })
          .catch(err => {
            console.error('Failed to refresh density ratios', err);
          })
      );
    }
    if (changes[NUTRITION_TARGETS_STORAGE_KEY]) {
      reloads.push(
        reloadNutritionTargets()
      );
    }
    if (reloads.length) {
      Promise.all(reloads)
        .then(() => loadAndRender())
        .catch(err => {
          console.error('Failed to refresh meal list after nutrition data change', err);
        });
    }
    if (changes.currentStock) {
      const newStock = changes.currentStock.newValue || [];
      inventorySet = new Set(newStock.map(s => canonicalName(s.name)));
      updateInventoryDisplay();
    }
    if (changes.users) {
      loadAndRender();
    }
    if (changes[key]) {
      loadAndRender();
    }
    if (changes.fdcApiKey) {
      missingApiKeyWarningShown = false;
    }
    if (changes[WHAT_TO_COOK_VISIBILITY_KEY]) {
      loadWhatToCookVisibility()
        .then(map => {
          whatToCookVisibility = map;
          if (visibilityCheckbox) {
            setVisibilityCheckboxState(map[type] !== false);
          }
        })
        .catch(err => {
          console.error('Failed to refresh What To Cook visibility state', err);
        });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
