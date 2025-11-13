import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadArray as loadItemArray, saveArray as saveItemArray } from './utils/itemStorage.js';
import { canonicalName } from './utils/nameUtils.js';
import {
  NUTRIENT_DEFINITIONS,
  formatDisplayValue,
  convertNutrientValueToDisplay
} from './utils/fdcNutrientMap.js';
import {
  calculateMealNutritionTotals,
  MEAL_NUTRITION_VERSION,
  updateMealNutritionTotals
} from './utils/mealNutritionCalculator.js';
import { getIngredientMap, updateIngredient } from './utils/ingredientStorage.js';
import { loadDensityMap } from './utils/unitNormalize.js';
import { loadGlobalProduceMeasures } from './utils/unitResolver.js';
import {
  loadNutritionTargetLookup,
  NUTRITION_TARGETS_STORAGE_KEY
} from './utils/nutritionTargets.js';

const params = new URLSearchParams(window.location.search);
const requestedType = params.get('type') || '';
const requestedMealId = params.get('mealId') || '';
const requestedMealName = params.get('meal') || '';
const serializedMealData = params.get('mealData') || '';
const NUTRIENT_DEFINITION_MAP = new Map(
  NUTRIENT_DEFINITIONS.map(def => [def.key, def])
);

const titleEl = document.getElementById('mealTitle');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const missingSectionEl = document.getElementById('missingSection');
const missingListEl = document.getElementById('missingList');
const nutritionOutputEl = document.getElementById('nutritionOutput');
const resolvedSectionEl = document.getElementById('resolvedSection');
const resolvedListEl = document.getElementById('resolvedList');
const scoreSectionEl = document.getElementById('scoreSection');
const scoreListEl = document.getElementById('scoreList');
const fixDialog = document.getElementById('fixDialog');
const fixForm = document.getElementById('fixForm');
const fixDescriptionEl = document.getElementById('fixDescription');
const fixOptionsEl = document.getElementById('fixOptions');
const fixCustomRadio = document.getElementById('fixCustomRadio');
const fixCustomInput = document.getElementById('fixCustomInput');
const fixErrorEl = document.getElementById('fixError');
const fixCancelBtn = document.getElementById('fixCancel');
const fixConfirmBtn = document.getElementById('fixConfirm');

let fallbackMeal = parseMealData(serializedMealData);
let ingredientMap = {};
let densityMap = {};
let globalProduceMeasures = {};
let nutritionTargetLookup = {};
let currentMeals = [];
let currentMealIndex = -1;
let currentTypeId = requestedType && MEAL_TYPES[requestedType] ? requestedType : null;
let mealNotFound = false;
let activeFixState = null;

registerFixDialogEvents();

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

function formatScoreValue(value, key) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const def = NUTRIENT_DEFINITION_MAP.get(key);
  if (!def) return null;
  const displayValue = convertNutrientValueToDisplay(value, def);
  if (!Number.isFinite(displayValue)) return null;
  const decimals = typeof def.decimals === 'number' ? def.decimals : 2;
  const rounded = Number(displayValue.toFixed(decimals));
  if (!Number.isFinite(rounded)) return null;
  const unit = def.displayUnit || def.targetUnit || '';
  return `${rounded}${unit ? ` ${unit}` : ''}`.trim();
}

function formatScoreTarget(entry) {
  if (!entry) return null;
  if (Number.isFinite(entry.targetInputValue) && entry.targetInputValue > 0 && entry.targetInputUnit) {
    return `${entry.targetInputValue} ${entry.targetInputUnit}`.trim();
  }
  return formatScoreValue(entry.targetValue, entry.key);
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
    valueText = formatScoreValue(entry.upperLimitValue, entry.key);
  }
  if (!valueText) return null;
  const percentText = formatScorePercent(entry.upperLimitPercent);
  return `Safe upper limit ${valueText} (${percentText})`;
}

function formatScorePercent(percent) {
  if (!Number.isFinite(percent) || percent < 0) return '0%';
  return `${Math.min(999, Math.round(percent))}%`;
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

function compareNutrientScoreEntries(a, b) {
  const rankA = Number.isFinite(a?.importanceRank) ? Number(a.importanceRank) : null;
  const rankB = Number.isFinite(b?.importanceRank) ? Number(b.importanceRank) : null;
  if (rankA != null && rankB != null && rankA !== rankB) {
    return rankA - rankB;
  }
  const labelA = (a?.label || a?.key || '').toLowerCase();
  const labelB = (b?.label || b?.key || '').toLowerCase();
  if (labelA < labelB) return -1;
  if (labelA > labelB) return 1;
  return 0;
}

function formatOunceEquivalent(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const grams = Number(meta.grams);
  if (!Number.isFinite(grams) || grams <= 0) return '';
  const source = meta.source;
  if (!source) return '';
  const normalized = String(source).toLowerCase();
  if (!normalized.startsWith('density')) return '';
  const ounces = grams / 28.349523125;
  const formatted = formatDisplayValue(ounces, 'oz', 2);
  return formatted && formatted !== '—' ? formatted : '';
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

function formatResolutionSource(source) {
  if (source == null) return '';
  const raw = String(source).trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'fdc:portion') return 'FDC portion average';
  if (normalized === 'density:fallback') return 'Density (water default)';
  if (normalized === 'density') return 'Density override';
  if (normalized.startsWith('density:')) {
    const suffix = raw.slice('density:'.length).trim();
    return suffix ? `Density (${suffix})` : 'Density override';
  }
  if (normalized === 'unit:mass') return 'Mass unit';
  if (normalized === 'global') return 'Global default';
  if (normalized === 'label') return 'Package label';
  if (normalized === 'user') return 'User entry';
  return raw;
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
    const text = document.createElement('span');
    text.textContent = `${name} — ${reason}`;
    li.appendChild(text);
    if (entry?.reason === 'conversion-failed') {
      const fixBtn = document.createElement('button');
      fixBtn.type = 'button';
      fixBtn.className = 'missing-fix-button';
      fixBtn.textContent = 'Fix';
      fixBtn.addEventListener('click', () => openFixDialog(entry));
      li.appendChild(fixBtn);
    }
    missingListEl.appendChild(li);
  });
  missingSectionEl.style.display = '';
}

function renderResolvedIngredients(totals) {
  if (!resolvedSectionEl || !resolvedListEl) return;
  const resolvedMap = totals?.resolvedIngredients && typeof totals.resolvedIngredients === 'object'
    ? totals.resolvedIngredients
    : {};
  const names = Object.keys(resolvedMap);
  if (!names.length) {
    resolvedSectionEl.style.display = 'none';
    resolvedListEl.innerHTML = '';
    return;
  }
  names.sort((a, b) => (a || '').localeCompare(b || '', undefined, { sensitivity: 'base' }));
  resolvedListEl.innerHTML = '';
  names.forEach(name => {
    const li = document.createElement('li');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = name || 'Ingredient';
    li.appendChild(titleSpan);
    const meta = resolvedMap[name] || {};
    const details = [];
    const weight = formatWeight(meta.grams);
    if (weight && weight !== '—') {
      details.push(weight);
      const ounceEquivalent = formatOunceEquivalent(meta);
      if (ounceEquivalent) {
        details.push(ounceEquivalent);
      }
    }
    if (meta.source) {
      const sourceLabel = formatResolutionSource(meta.source);
      details.push(`Source: ${sourceLabel || meta.source}`);
    }
    if (meta.confidence) {
      details.push(`Confidence: ${meta.confidence}`);
    }
    if (meta.sizeTag) {
      details.push(`Size: ${meta.sizeTag}`);
    }
    if (details.length) {
      const detailText = details.join(' • ');
      const metaSpan = document.createElement('span');
      metaSpan.className = 'resolved-meta';
      metaSpan.textContent = detailText;
      metaSpan.title = detailText;
      li.appendChild(metaSpan);
    }
    resolvedListEl.appendChild(li);
  });
  resolvedSectionEl.style.display = '';
}

function renderNutrientScores(totals) {
  if (!scoreSectionEl || !scoreListEl) return;
  const perServingScores = totals?.nutrientScores?.perServing;
  if (!perServingScores) {
    scoreSectionEl.style.display = 'none';
    scoreListEl.innerHTML = '';
    return;
  }
  const entries = Object.values(perServingScores);
  if (!entries.length) {
    scoreSectionEl.style.display = 'none';
    scoreListEl.innerHTML = '';
    return;
  }
  scoreListEl.innerHTML = '';
  entries
    .slice()
    .sort(compareNutrientScoreEntries)
    .forEach(entry => {
      if (!entry) return;
      const item = document.createElement('div');
      item.className = 'nutrient-score';
      const header = document.createElement('div');
      header.className = 'nutrient-score__header';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'nutrient-score__label';
      labelSpan.textContent = entry.label || entry.key || 'Nutrient';
      const directionDescription = describeImportanceDirection(entry.importanceDirection);
      if (directionDescription) {
        labelSpan.title = directionDescription;
      }
      const percentText = formatScorePercent(entry.percentComplete);
      const valueSpan = document.createElement('span');
      valueSpan.className = 'nutrient-score__value';
      valueSpan.textContent = `${entry.points ?? 0}/10 • ${percentText}`;
      header.appendChild(labelSpan);
      header.appendChild(valueSpan);
      item.appendChild(header);
      const details = [];
      const targetText = formatScoreTarget(entry);
      if (targetText) {
        details.push(`Target ${targetText}`);
      }
      const perServingText = formatScoreValue(entry.perServingValue, entry.key);
      if (perServingText) {
        details.push(`${perServingText} per serving`);
      }
      if (directionDescription) {
        details.push(directionDescription);
      }
      if (details.length) {
        const detailEl = document.createElement('div');
        detailEl.className = 'nutrient-score__details';
        detailEl.textContent = details.join(' • ');
        item.appendChild(detailEl);
      }
      const upperLimitText = formatScoreUpperLimit(entry);
      if (upperLimitText) {
        const upperLimitEl = document.createElement('div');
        upperLimitEl.className = 'nutrient-score__upper-limit';
        upperLimitEl.textContent = upperLimitText;
        item.appendChild(upperLimitEl);
      }
      const bar = document.createElement('div');
      bar.className = 'nutrient-score__bar';
      for (let i = 0; i < 10; i += 1) {
        const block = document.createElement('span');
        block.className = 'nutrient-score__block';
        if (i < (entry.points ?? 0)) {
          block.classList.add('nutrient-score__block--filled');
        }
        bar.appendChild(block);
      }
      bar.setAttribute('aria-hidden', 'true');
      item.appendChild(bar);
      scoreListEl.appendChild(item);
    });
  scoreSectionEl.style.display = '';
}

function getGlobalPresets(name) {
  if (!name) return [];
  const normalized = canonicalName(name);
  if (!normalized) return [];
  const entry = globalProduceMeasures?.[normalized];
  if (!entry || !Array.isArray(entry.measures)) return [];
  return entry.measures
    .map(measure => ({
      label: measure.label || 'Portion',
      unit: measure.unit || 'each',
      qty: Number(measure.qty) || 1,
      grams: Number(measure.grams),
      source: measure.source || 'global',
      confidence: measure.confidence || null,
      sizeTag: measure.sizeTag || null
    }))
    .filter(measure => Number.isFinite(measure.grams) && measure.grams > 0);
}

function findIngredientInMeal(meal, ingredientName) {
  if (!meal || !Array.isArray(meal.ingredients)) return null;
  const target = canonicalName(ingredientName || '');
  if (!target) return null;
  return (
    meal.ingredients.find(ingredient => canonicalName(ingredient?.name || '') === target) || null
  );
}

function setFixError(message = '') {
  if (!fixErrorEl) return;
  fixErrorEl.textContent = message;
}

function updateCustomInputState() {
  if (!fixCustomInput) return;
  const isCustom = Boolean(fixCustomRadio?.checked);
  fixCustomInput.disabled = !isCustom;
  if (!isCustom) {
    fixCustomInput.value = '';
  }
}

function openDialogElement() {
  if (!fixDialog) return;
  if (typeof fixDialog.showModal === 'function') {
    if (!fixDialog.open) {
      fixDialog.showModal();
    }
  } else {
    fixDialog.setAttribute('open', 'open');
    fixDialog.style.display = 'block';
  }
}

function closeDialogElement() {
  if (!fixDialog) return;
  if (typeof fixDialog.close === 'function') {
    if (fixDialog.open) {
      fixDialog.close();
    }
  } else {
    fixDialog.removeAttribute('open');
    fixDialog.style.display = 'none';
  }
}

function resetFixDialogState() {
  activeFixState = null;
  if (fixOptionsEl) {
    fixOptionsEl.innerHTML = '';
  }
  if (fixCustomRadio) {
    fixCustomRadio.checked = false;
  }
  if (fixCustomInput) {
    fixCustomInput.value = '';
    fixCustomInput.disabled = false;
  }
  if (fixConfirmBtn) {
    fixConfirmBtn.disabled = false;
  }
  setFixError('');
}

function openFixDialog(entry) {
  if (!fixDialog || !fixForm) return;
  const meal = getActiveMeal();
  if (!meal) return;
  const ingredientName = entry?.name || '';
  const ingredient = findIngredientInMeal(meal, ingredientName);
  activeFixState = {
    meal,
    ingredient,
    ingredientName,
    presets: [],
    defaultIndex: -1
  };
  const amountText = ingredient?.amount || ingredient?.serving_size || '';
  if (fixDescriptionEl) {
    if (ingredientName && amountText) {
      fixDescriptionEl.textContent = `Provide a gram weight for ${amountText} of ${ingredientName}.`;
    } else if (ingredientName) {
      fixDescriptionEl.textContent = `Provide a gram weight for ${ingredientName}.`;
    } else {
      fixDescriptionEl.textContent = 'Provide a gram weight for this ingredient.';
    }
  }
  const presets = getGlobalPresets(ingredientName);
  activeFixState.presets = presets;
  const defaultsEntry = globalProduceMeasures?.[canonicalName(ingredientName)];
  let defaultIndex = -1;
  if (presets.length) {
    const defaultSize = defaultsEntry?.defaultEachSize || null;
    if (defaultSize) {
      defaultIndex = presets.findIndex(preset => preset.sizeTag === defaultSize);
    }
    if (defaultIndex === -1) {
      defaultIndex = 0;
    }
  }
  activeFixState.defaultIndex = defaultIndex;
  if (fixOptionsEl) {
    fixOptionsEl.innerHTML = '';
    presets.forEach((preset, index) => {
      const optionId = `fixPreset_${index}`;
      const label = document.createElement('label');
      label.className = 'fix-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'measureChoice';
      radio.value = String(index);
      radio.id = optionId;
      if (index === defaultIndex) {
        radio.checked = true;
      }
      const textSpan = document.createElement('span');
      const parts = [preset.label || `Option ${index + 1}`];
      const weightText = formatWeight(preset.grams);
      if (weightText && weightText !== '—') {
        parts.push(weightText);
      }
      if (preset.sizeTag) {
        parts.push(`Size: ${preset.sizeTag}`);
      }
      if (preset.source) {
        const presetSource = formatResolutionSource(preset.source) || preset.source;
        parts.push(`Source: ${presetSource}`);
      }
      textSpan.textContent = parts.join(' • ');
      label.appendChild(radio);
      label.appendChild(textSpan);
      fixOptionsEl.appendChild(label);
    });
  }
  if (fixCustomRadio) {
    fixCustomRadio.checked = defaultIndex === -1;
  }
  if (fixConfirmBtn) {
    fixConfirmBtn.disabled = false;
  }
  if (fixCustomInput) {
    fixCustomInput.value = '';
  }
  setFixError('');
  updateCustomInputState();
  openDialogElement();
  if (fixForm) {
    const firstOption = fixForm.querySelector('input[name="measureChoice"]');
    if (firstOption) {
      firstOption.focus();
    } else if (fixCustomInput) {
      fixCustomInput.focus();
    }
  }
}

async function persistResolvedMeasureEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  const now = new Date().toISOString();
  for (const entry of entries) {
    const ingredientName = entry?.ingredient?.name;
    const measure = entry?.measure;
    if (!ingredientName || !measure) continue;
    const grams = Number(measure.grams);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const qty = Number(measure.qty) || 1;
    const normalizedMeasure = {
      label: measure.label || measure.unit || 'portion',
      unit: measure.unit || 'each',
      qty,
      grams,
      source: measure.source || 'local',
      confidence: measure.confidence || null,
      sizeTag: measure.sizeTag || null,
      updatedAt: now
    };
    const record = ingredientMap[canonicalName(ingredientName)] || ingredientMap[ingredientName];
    const existingMeasures = Array.isArray(record?.measures) ? record.measures.slice() : [];
    let replaced = false;
    const merged = existingMeasures.map(existing => {
      if (
        (existing.label || '') === normalizedMeasure.label &&
        (existing.unit || '') === normalizedMeasure.unit &&
        (existing.sizeTag || '') === (normalizedMeasure.sizeTag || '')
      ) {
        replaced = true;
        return { ...existing, ...normalizedMeasure };
      }
      return existing;
    });
    if (!replaced) {
      merged.push(normalizedMeasure);
    }
    const updatedRecord = await updateIngredient(ingredientName, { measures: merged });
    if (updatedRecord) {
      const key = updatedRecord.normalized_name || canonicalName(ingredientName);
      ingredientMap = {
        ...ingredientMap,
        [key]: updatedRecord,
        [ingredientName]: updatedRecord
      };
    }
  }
}

async function persistActiveMeal(meal) {
  if (!meal) return;
  if (!currentMeals.length || currentMealIndex < 0 || !currentTypeId) {
    fallbackMeal = sanitizeMeal(meal);
    return;
  }
  const info = MEAL_TYPES[currentTypeId];
  if (!info || !info.key) {
    fallbackMeal = sanitizeMeal(meal);
    return;
  }
  currentMeals[currentMealIndex] = sanitizeMeal(meal);
  await saveItemArray(info.key, currentMeals);
}

async function applyFixMeasure(state, measure) {
  if (!state || !measure) return;
  const meal = state.meal;
  const ingredient = state.ingredient;
  if (!meal || !ingredient) return;
  const grams = Number(measure.grams);
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error('Invalid gram weight');
  }
  const normalizedTarget = canonicalName(state.ingredientName || ingredient.name || '');
  const promptResponse = {
    qty: Number(measure.qty) || 1,
    grams,
    unit: measure.unit || 'each',
    label: measure.label || 'manual-entry',
    source: measure.source || 'user',
    confidence: measure.confidence || null,
    sizeTag: measure.sizeTag || null
  };
  const pendingPersists = [];
  const changed = updateMealNutritionTotals(meal, {
    ingredientMap,
    densityMap,
    globalProduceMeasures,
    nutritionTargets: nutritionTargetLookup,
    promptForMeasure: payload => {
      const name = payload?.ingredient?.name || '';
      if (canonicalName(name) === normalizedTarget) {
        return { ...promptResponse };
      }
      return null;
    },
    persistResolvedMeasure: data => {
      if (data?.ingredient?.name && data?.measure) {
        pendingPersists.push({
          ingredient: data.ingredient,
          measure: data.measure
        });
      }
    }
  });
  if (pendingPersists.length) {
    await persistResolvedMeasureEntries(pendingPersists);
  }
  await persistActiveMeal(meal);
  render();
  return changed;
}

async function handleFixSubmit(event) {
  event.preventDefault();
  if (!activeFixState) {
    closeFixDialog();
    return;
  }
  const formData = new FormData(fixForm);
  let choice = formData.get('measureChoice');
  if (!choice) {
    if (activeFixState.presets.length) {
      setFixError('Select a portion size to continue.');
      return;
    }
    choice = 'custom';
  }
  let selectedMeasure = null;
  if (choice === 'custom') {
    const grams = Number(fixCustomInput?.value);
    if (!Number.isFinite(grams) || grams <= 0) {
      setFixError('Enter a gram weight greater than zero.');
      if (fixCustomInput) fixCustomInput.focus();
      return;
    }
    selectedMeasure = {
      label: 'Custom grams',
      unit: 'each',
      qty: 1,
      grams,
      source: 'user',
      confidence: 'medium',
      sizeTag: null
    };
  } else {
    const index = parseInt(choice, 10);
    if (Number.isNaN(index) || !activeFixState.presets[index]) {
      setFixError('Select a valid portion option.');
      return;
    }
    selectedMeasure = activeFixState.presets[index];
  }
  setFixError('');
  if (fixConfirmBtn) {
    fixConfirmBtn.disabled = true;
  }
  try {
    await applyFixMeasure(activeFixState, selectedMeasure);
    closeFixDialog();
  } catch (error) {
    console.error('Failed to resolve ingredient measure', error);
    setFixError('Unable to save this weight. Please try again.');
    if (fixConfirmBtn) {
      fixConfirmBtn.disabled = false;
    }
  }
}

function closeFixDialog() {
  closeDialogElement();
  resetFixDialogState();
}

function registerFixDialogEvents() {
  if (fixForm) {
    fixForm.addEventListener('change', event => {
      if (event.target && event.target.name === 'measureChoice') {
        updateCustomInputState();
        setFixError('');
      }
    });
    fixForm.addEventListener('submit', event => {
      handleFixSubmit(event).catch(err => {
        console.error('Unexpected error handling fix submission', err);
        setFixError('An unexpected error occurred.');
        if (fixConfirmBtn) {
          fixConfirmBtn.disabled = false;
        }
      });
    });
  }
  if (fixCancelBtn) {
    fixCancelBtn.addEventListener('click', () => {
      closeFixDialog();
    });
  }
  if (fixDialog) {
    fixDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeFixDialog();
    });
    fixDialog.addEventListener('close', () => {
      resetFixDialogState();
    });
  }
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
  const messages = [];
  let statusType = '';
  if (mealNotFound && meal === fallbackMeal) {
    messages.push('Meal could not be found in storage. Displaying the provided snapshot.');
    statusType = 'warning';
  }
  if (missingCount > 0) {
    messages.push(
      `Missing data for ${missingCount} ingredient${missingCount === 1 ? '' : 's'}. Totals may be incomplete.`
    );
    statusType = 'warning';
  }
  if (source === 'computed') {
    messages.push('Nutrition totals calculated from current data. Save the meal to persist them.');
    if (!statusType) {
      statusType = 'info';
    }
  }
  if (!messages.length) {
    renderStatus('');
    return;
  }
  renderStatus(messages.join(' '), statusType || 'info');
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
  const calculated = calculateMealNutritionTotals(meal, {
    ingredientMap,
    densityMap,
    globalProduceMeasures,
    nutritionTargets: nutritionTargetLookup
  });
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
  renderResolvedIngredients(totals);
  renderNutrientScores(totals);
  renderNutrients(totals);
  renderMealStatus(meal, totals, source);
}

async function loadContext() {
  const [ingredients, density, defaults, targets] = await Promise.all([
    getIngredientMap(),
    loadDensityMap(),
    loadGlobalProduceMeasures(),
    loadNutritionTargetLookup(NUTRIENT_DEFINITIONS)
  ]);
  ingredientMap = ingredients || {};
  densityMap = density || {};
  globalProduceMeasures = defaults || {};
  nutritionTargetLookup = targets || {};
}

function registerStorageListener() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = Object.keys(changes || {});
    const mealKeys = keys.filter(key => key.endsWith('Meals'));
    const ingredientChanged = Boolean(changes.ingredientRecords);
    const densityChanged = Boolean(changes.densityRatios);
    const nutritionTargetsChanged = Boolean(changes[NUTRITION_TARGETS_STORAGE_KEY]);
    const categoriesChanged = Boolean(changes.mealCategories);
    if (
      !mealKeys.length &&
      !ingredientChanged &&
      !densityChanged &&
      !categoriesChanged &&
      !nutritionTargetsChanged
    ) {
      return;
    }
    (async () => {
      if (categoriesChanged || mealKeys.length) {
        await initializeMealCategories();
        await locateMeal();
      }
      if (ingredientChanged || densityChanged || nutritionTargetsChanged) {
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
