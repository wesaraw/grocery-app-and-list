import { loadJSON } from './utils/dataLoader.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

const params = new URLSearchParams(location.search);
const mealType = params.get('type') || 'lunchDinner';
let MEAL_KEY, MEAL_PATH, label;
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';

function sanitizePortionCount(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) {
    return 1;
  }
  return num;
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
  const info = MEAL_TYPES[mealType] || MEAL_TYPES.lunchDinner;
  MEAL_KEY = info.key;
  MEAL_PATH = info.path;
  label = info.label;
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = `Add ${label} Meal`;
  const units = await loadUnits();
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

  addRow();

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

    const weight = parseFloat(weightInput?.value);
    const mealWeight = !isNaN(weight) && weight > 0 ? weight : 1;
    const mealPortions = sanitizePortionCount(portionInput ? portionInput.value : 1);

    const meals = await loadMeals();
    meals.push({
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
      leftoverOk: leftoverBox.checked
    });
    await saveMeals(meals);
    await calculateAndSaveMealNeeds();
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
