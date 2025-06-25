import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

const params = new URLSearchParams(location.search);
const type = params.get('type') || 'breakfast';
const { key, path, label } = MEAL_TYPES[type] || MEAL_TYPES.breakfast;

function loadMeals() {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      if (data[key]) {
        resolve(data[key]);
      } else {
        const arr = await loadJSON(path);
        resolve(arr);
      }
    });
  });
}

function saveMeals(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: arr }, () => resolve());
  });
}

function createRows(meal, arr) {
  const rows = [];
  const ingredients = meal.ingredients || [];

  ingredients.forEach((ing, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0) {
      const useTd = document.createElement('td');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = meal.active !== false;
      chk.addEventListener('change', async () => {
        meal.active = chk.checked;
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
      });
      useTd.appendChild(chk);
      if (ingredients.length > 1) useTd.rowSpan = ingredients.length;

      const nameTd = document.createElement('td');
      nameTd.textContent = meal.name || '';
      if (ingredients.length > 1) nameTd.rowSpan = ingredients.length;

      tr.appendChild(useTd);
      tr.appendChild(nameTd);
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';

    const amtTd = document.createElement('td');
    amtTd.textContent = ing.amount || ing.serving_size || '';

    tr.appendChild(ingTd);
    tr.appendChild(amtTd);
    rows.push(tr);
  });

  if (ingredients.length === 0) {
    const tr = document.createElement('tr');
    const useTd = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = meal.active !== false;
    chk.addEventListener('change', async () => {
      meal.active = chk.checked;
      await saveMeals(arr);
      await calculateAndSaveMealNeeds();
    });
    useTd.appendChild(chk);
    const nameTd = document.createElement('td');
    nameTd.textContent = meal.name || '';
    const ingTd = document.createElement('td');
    const amtTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(nameTd);
    tr.appendChild(ingTd);
    tr.appendChild(amtTd);
    rows.push(tr);
  }

  return rows;
}

async function init() {
  document.getElementById('title').textContent = `${label} Meals`;
  const tbody = document.getElementById('mealBody');
  const meals = await loadMeals();
  meals.forEach(meal => {
    const rows = createRows(meal, meals);
    rows.forEach(row => tbody.appendChild(row));
  });
  await calculateAndSaveMealNeeds();
}

document.addEventListener('DOMContentLoaded', init);
