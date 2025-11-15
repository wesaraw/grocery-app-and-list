import { loadJSON } from './utils/dataLoader.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadDensityMap } from './utils/unitNormalize.js';
import { getIngredientMap } from './utils/ingredientStorage.js';
import { updateMealNutritionTotals } from './utils/mealNutritionCalculator.js';
import { initUomTable } from './utils/uomConverter.js';
import { loadGlobalProduceMeasures } from './utils/unitResolver.js';
import { NUTRIENT_DEFINITIONS } from './utils/fdcNutrientMap.js';
import { loadNutritionTargetLookup } from './utils/nutritionTargets.js';

const params = new URLSearchParams(location.search);
const mealType = params.get('type') || 'lunchDinner';
let MEAL_KEY, MEAL_PATH, label;
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';
let densityMap = {};
let ingredientMap = {};
let globalProduceMeasures = {};
let nutritionTargetLookup = {};
const DEFAULT_MEALIME_ENDPOINT = 'http://localhost:4000/import/mealime';

function sanitizePortionCount(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) {
    return 1;
  }
  return num;
}

function getStoredMealimeEndpoint() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(DEFAULT_MEALIME_ENDPOINT);
      return;
    }
    try {
      chrome.storage.local.get('mealimeImportEndpoint', (data = {}) => {
        const value = typeof data.mealimeImportEndpoint === 'string' ? data.mealimeImportEndpoint.trim() : '';
        resolve(value || DEFAULT_MEALIME_ENDPOINT);
      });
    } catch (err) {
      resolve(DEFAULT_MEALIME_ENDPOINT);
    }
  });
}

function formatQuantityDisplay(value) {
  if (value == null) {
    return '';
  }
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) {
    return '';
  }
  const rounded = Math.round(num * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toString();
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value != null) {
      return value;
    }
  }
  return null;
}

function setSelectValueIfExists(select, value) {
  if (!select || !value) {
    return false;
  }
  const options = Array.from(select.options || []);
  const match = options.find((opt) => opt.value === value);
  if (match) {
    select.value = value;
    return true;
  }
  return false;
}

function loadMeals() {
  return new Promise(async resolve => {
    chrome.storage.local.get(MEAL_KEY, async data => {
      let arr = data[MEAL_KEY];
      if (!arr) arr = await loadJSON(MEAL_PATH);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.prepAhead === undefined) m.prepAhead = false;
          if (m.leftoverOk === undefined) m.leftoverOk = false;
          if (m.recipeBook === undefined) m.recipeBook = '';
          if (typeof m.instructions !== 'string') {
            m.instructions = '';
          } else {
            m.instructions = m.instructions.trim();
          }
          if (!Array.isArray(m.ingredients)) {
            m.ingredients = [];
          }
          m.totalPortions = sanitizePortionCount(m.totalPortions);
          m.ingredients.forEach(ing => {
            if (!ing || typeof ing !== 'object') return;
            if (ing.prepAhead === undefined) ing.prepAhead = false;
          });
        });
      }
      resolve(arr || []);
    });
  });
}

function saveMeals(arr) {
  if (Array.isArray(arr)) {
    arr.forEach(meal => {
      if (meal && typeof meal === 'object') {
        updateMealNutritionTotals(meal, {
          ingredientMap,
          densityMap,
          globalProduceMeasures,
          nutritionTargets: nutritionTargetLookup
        });
      }
    });
  }
  return new Promise(resolve => {
    chrome.storage.local.set({ [MEAL_KEY]: arr }, () => resolve());
  });
}

async function loadUnits() {
  const data = await loadJSON(UOM_PATH);
  return Object.keys(data);
}

function createRow(units) {
  const tr = document.createElement('tr');
  const mealTd = document.createElement('td');
  const mealInput = document.createElement('input');
  mealInput.type = 'text';
  mealTd.appendChild(mealInput);

  const ingTd = document.createElement('td');
  const ingInput = document.createElement('input');
  ingInput.type = 'text';
  ingTd.appendChild(ingInput);

  const prepTd = document.createElement('td');
  prepTd.style.textAlign = 'center';
  const prepChk = document.createElement('input');
  prepChk.type = 'checkbox';
  prepTd.appendChild(prepChk);

  const amtTd = document.createElement('td');
  const amtInput = document.createElement('input');
  amtInput.type = 'text';
  amtTd.appendChild(amtInput);

  const unitTd = document.createElement('td');
  const select = document.createElement('select');
  units.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    select.appendChild(opt);
  });
  unitTd.appendChild(select);

  tr.appendChild(mealTd);
  tr.appendChild(ingTd);
  tr.appendChild(prepTd);
  tr.appendChild(amtTd);
  tr.appendChild(unitTd);

  return { tr, mealInput, ingInput, amtInput, select, prepChk };
}

function highlightError(el) {
  el.classList.add('error');
  setTimeout(() => el.classList.remove('error'), 1000);
}

function anyFilled(row) {
  return (
    (!row.mealInput.disabled && row.mealInput.value.trim()) ||
    row.ingInput.value.trim() ||
    row.amtInput.value.trim()
  );
}

async function init() {
  await initializeMealCategories();
  await initUomTable();
  const info = MEAL_TYPES[mealType] || MEAL_TYPES.lunchDinner;
  MEAL_KEY = info.key;
  MEAL_PATH = info.path;
  label = info.label;
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = `Add ${label} Meal`;
  const [density, ingredients, defaults, units, targets, storedMealimeEndpoint] = await Promise.all([
    loadDensityMap(),
    getIngredientMap(),
    loadGlobalProduceMeasures(),
    loadUnits(),
    loadNutritionTargetLookup(NUTRIENT_DEFINITIONS),
    getStoredMealimeEndpoint(),
  ]);
  densityMap = density || {};
  ingredientMap = ingredients || {};
  globalProduceMeasures = defaults || {};
  nutritionTargetLookup = targets || {};
  let mealimeEndpoint = storedMealimeEndpoint || DEFAULT_MEALIME_ENDPOINT;
  const tbody = document.getElementById('mealBody');
  const rows = [];
  const preparedBox = document.getElementById('preparedChk');
  const prepAheadBox = document.getElementById('prepAheadChk');
  const prepAheadLabel = document.getElementById('prepAheadLbl');
  const leftoverBox = document.getElementById('leftoverChk');
  const weightInput = document.getElementById('weightInput');
  const portionInput = document.getElementById('portionInput');
  const groupChk = document.getElementById('groupChk');
  const recipeBookInput = document.getElementById('recipeBookInput');
  const mealimeTargetInput = document.getElementById('mealimeTarget');
  const mealimeImportBtn = document.getElementById('mealimeImportBtn');
  const mealimeClearBtn = document.getElementById('mealimeClearBtn');
  const mealimeStatusEl = document.getElementById('mealimeImportStatus');
  const mealimeAugmentChk = document.getElementById('mealimeAugmentChk');
  const mealimeImportBtnDefaultText = mealimeImportBtn ? mealimeImportBtn.textContent : 'Import Mealime Recipe';

  function setMealimeStatus(message = '', level = 'info') {
    if (!mealimeStatusEl) return;
    mealimeStatusEl.textContent = message;
    mealimeStatusEl.classList.remove('success', 'error', 'info');
    mealimeStatusEl.classList.add(level);
  }

  function setMealimeLoading(isLoading) {
    [mealimeImportBtn, mealimeClearBtn, mealimeTargetInput, mealimeAugmentChk].forEach((el) => {
      if (el) {
        el.disabled = isLoading;
      }
    });
    if (mealimeImportBtn) {
      mealimeImportBtn.textContent = isLoading ? 'Importing…' : mealimeImportBtnDefaultText;
    }
  }
  function togglePrepAhead() {
    prepAheadLabel.style.display = preparedBox.checked ? '' : 'none';
    if (!preparedBox.checked) prepAheadBox.checked = false;
    rows.forEach(row => {
      if (!row.ingInput.value.trim() && !row.amtInput.value.trim()) {
        row.prepChk.checked = preparedBox.checked && prepAheadBox.checked;
      }
    });
  }
  preparedBox.addEventListener('change', togglePrepAhead);
  togglePrepAhead();

  function addRow() {
    const row = createRow(units);
    if (rows.length > 0) {
      row.mealInput.disabled = true;
      row.mealInput.value = rows[0].mealInput.value;
    }
    rows.push(row);
    tbody.appendChild(row.tr);
    row.prepChk.checked = preparedBox.checked && prepAheadBox.checked;

    function checkAddNext() {
      if (rows[rows.length - 1] === row && anyFilled(row)) {
        addRow();
      }
    }

    row.mealInput.addEventListener('input', checkAddNext);
    row.ingInput.addEventListener('input', checkAddNext);
    row.amtInput.addEventListener('input', checkAddNext);
    row.select.addEventListener('change', checkAddNext);
    row.prepChk.addEventListener('change', checkAddNext);

    if (rows.length === 1) {
      row.mealInput.addEventListener('input', () => {
        rows.slice(1).forEach(r => {
          r.mealInput.value = row.mealInput.value;
        });
      });
    }
  }

  function ensureRowCapacity(count) {
    while (rows.length < count) {
      addRow();
    }
  }

  function resetRowsForImport() {
    while (rows.length) {
      const row = rows.pop();
      if (row && row.tr && row.tr.parentNode) {
        row.tr.parentNode.removeChild(row.tr);
      }
    }
  }

  function applyMealimeRecipe(recipe) {
    if (!recipe || typeof recipe !== 'object') {
      throw new Error('Mealime importer returned invalid data.');
    }
    resetRowsForImport();
    addRow();
    const importedIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    ensureRowCapacity(Math.max(importedIngredients.length, 1));

    const mealName = recipe.title || '';
    rows[0].mealInput.disabled = false;
    rows[0].mealInput.value = mealName;
    rows[0].mealInput.dispatchEvent(new Event('input', { bubbles: true }));

    const missingAmounts = [];
    const missingUnits = [];

    importedIngredients.forEach((ingredient, index) => {
      const row = rows[index];
      if (!row) return;
      const ingredientName = ingredient.name || ingredient.originalText || '';
      const quantityValue = pickFirstDefined(ingredient.quantity, ingredient.normalizedQuantity);
      const unitValue = pickFirstDefined(ingredient.unit, ingredient.normalizedUnit);
      const amountText = formatQuantityDisplay(quantityValue);

      row.ingInput.value = ingredientName;
      row.amtInput.value = amountText;
      setSelectValueIfExists(row.select, unitValue);

      const warningLabel = ingredient.originalText || ingredient.name || `Ingredient ${index + 1}`;
      if (!amountText) {
        missingAmounts.push(warningLabel);
      }
      if (!unitValue) {
        missingUnits.push(warningLabel);
      }
    });

    if (importedIngredients.length === 0) {
      rows[0].ingInput.value = '';
      rows[0].amtInput.value = '';
    }

    if (rows.length === importedIngredients.length) {
      addRow();
    }

    if (portionInput && recipe.servings != null) {
      portionInput.value = Math.round(recipe.servings * 100) / 100;
    }
    if (recipe.sourceUrl && recipeBookInput && !recipeBookInput.value) {
      recipeBookInput.value = recipe.sourceUrl;
    }

    const missingWarnings = [];
    if (missingAmounts.length) {
      missingWarnings.push(`Missing amount for: ${missingAmounts.join(', ')}`);
    }
    if (missingUnits.length) {
      missingWarnings.push(`Missing unit for: ${missingUnits.join(', ')}`);
    }
    return missingWarnings;
  }

  async function handleMealimeImport() {
    if (!mealimeTargetInput) return;
    const target = mealimeTargetInput.value.trim();
    if (!target) {
      setMealimeStatus('Enter a Mealime recipe URL or numeric ID before importing.', 'error');
      highlightError(mealimeTargetInput);
      mealimeTargetInput.focus();
      return;
    }
    setMealimeLoading(true);
    setMealimeStatus('Importing recipe…', 'info');
    try {
      const response = await fetch(mealimeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, augmentFromSteps: mealimeAugmentChk ? mealimeAugmentChk.checked : true }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (parseErr) {
        payload = null;
      }
      if (!response.ok) {
        const message = payload && payload.error ? payload.error : `Mealime import failed (${response.status})`;
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('Mealime importer returned an empty response.');
      }
      const missingWarnings = applyMealimeRecipe(payload);
      const serverWarnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      const warnings = [...serverWarnings, ...missingWarnings];
      const ingredientCount = Array.isArray(payload.ingredients) ? payload.ingredients.length : 0;
      const lines = [`Imported "${payload.title || 'Mealime recipe'}" with ${ingredientCount} ingredient(s).`];
      if (payload.servings != null) {
        lines.push(`Servings: ${Math.round(payload.servings * 100) / 100}`);
      }
      if (payload.timeMinutes != null) {
        lines.push(`Time: ${Math.round(payload.timeMinutes)} min`);
      }
      if (payload.sourceUrl) {
        lines.push(payload.sourceUrl);
      }
      if (warnings.length) {
        lines.push('', 'Warnings:', ...warnings.map((w) => `• ${w}`));
      }
      setMealimeStatus(lines.join('\n'), warnings.length ? 'info' : 'success');
    } catch (err) {
      console.error('Mealime import failed', err);
      setMealimeStatus(err && err.message ? err.message : 'Mealime import failed.', 'error');
    } finally {
      setMealimeLoading(false);
    }
  }

  function handleMealimeClear() {
    if (mealimeTargetInput) {
      mealimeTargetInput.value = '';
      mealimeTargetInput.focus();
    }
    resetRowsForImport();
    addRow();
    if (portionInput) {
      portionInput.value = 1;
    }
    if (recipeBookInput) {
      recipeBookInput.value = '';
    }
    setMealimeStatus('Cleared Mealime import fields.', 'info');
  }

  addRow();

  if (mealimeImportBtn && mealimeTargetInput) {
    mealimeImportBtn.addEventListener('click', handleMealimeImport);
    mealimeTargetInput.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        handleMealimeImport();
      }
    });
  }
  if (mealimeClearBtn) {
    mealimeClearBtn.addEventListener('click', handleMealimeClear);
  }

  document.getElementById('submit').addEventListener('click', async () => {
    const validRows = [];
    let hasError = false;

    const mealName = rows[0].mealInput.value.trim();
    if (!mealName) {
      highlightError(rows[0].mealInput);
      hasError = true;
    }

    rows.forEach(row => {
      const ing = row.ingInput.value.trim();
      const amt = row.amtInput.value.trim();
      const unit = row.select.value;
      if (!ing && !amt) {
        if (row.prepChk.checked) {
          highlightError(row.ingInput);
          highlightError(row.amtInput);
          hasError = true;
        }
        return;
      }
      if (!ing || !amt) {
        if (!ing) highlightError(row.ingInput);
        if (!amt) highlightError(row.amtInput);
        hasError = true;
        return;
      }
      validRows.push({ ing, amt, unit, prepAhead: row.prepChk.checked });
    });
    if (hasError || !mealName || !validRows.length) {
      document.getElementById('warning').style.display = 'block';
      return;
    }
    document.getElementById('warning').style.display = 'none';

    const ingredients = validRows.map(r => ({
      name: r.ing,
      amount: `${r.amt} ${r.unit}`,
      serving_size: `${r.amt} ${r.unit}`,
      prepAhead: !!r.prepAhead
    }));

    const weight = parseFloat(weightInput.value);
    const mealWeight = !isNaN(weight) && weight > 0 ? weight : 1;
    const mealPortions = sanitizePortionCount(portionInput ? portionInput.value : 1);

    const meals = await loadMeals();
    const newMeal = {
      name: mealName,
      recipeBook: recipeBookInput.value.trim() || '',
      ingredients,
      people: 1,
      prepared: preparedBox.checked,
      prepAhead: preparedBox.checked && prepAheadBox.checked,
      image: null,
      weight: mealWeight,
      totalPortions: mealPortions,
      groupMeal: groupChk.checked,
      leftoverOk: leftoverBox.checked,
      instructions: '',
    };
    updateMealNutritionTotals(newMeal, {
      ingredientMap,
      densityMap,
      globalProduceMeasures,
      nutritionTargets: nutritionTargetLookup
    });
    meals.push(newMeal);
    await saveMeals(meals);
    await calculateAndSaveMealNeeds();
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
