import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';

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

function createRow(meal, arr) {
  const tr = document.createElement('tr');
  const useTd = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = meal.active !== false;
  chk.addEventListener('change', async () => {
    meal.active = chk.checked;
    await saveMeals(arr);
  });
  useTd.appendChild(chk);
  const nameTd = document.createElement('td');
  nameTd.textContent = meal.name || '';
  const ingTd = document.createElement('td');
  ingTd.textContent = (meal.ingredients || []).map(i => i.name).join(', ');
  const amtTd = document.createElement('td');
  amtTd.textContent = (meal.ingredients || []).map(i => i.amount).join(', ');
  const servTd = document.createElement('td');
  servTd.textContent = (meal.ingredients || []).map(i => i.serving_size).join(', ');
  tr.appendChild(useTd);
  tr.appendChild(nameTd);
  tr.appendChild(ingTd);
  tr.appendChild(amtTd);
  tr.appendChild(servTd);
  return tr;
}

async function init() {
  document.getElementById('title').textContent = `${label} Meals`;
  const tbody = document.getElementById('mealBody');
  const meals = await loadMeals();
  meals.forEach(meal => {
    tbody.appendChild(createRow(meal, meals));
  });
}

document.addEventListener('DOMContentLoaded', init);
