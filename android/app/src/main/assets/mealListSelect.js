import { MEAL_TYPES, initializeMealCategories, addMealCategory } from './utils/mealData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { convertArrayToNames, loadArrayWithFallback } from './utils/itemRegistry.js';
import { subscribeToChanges } from './db.js';

async function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  let arr = await loadArrayWithFallback(key, path);
  if (Array.isArray(arr)) {
    for (const m of arr) {
      if (Array.isArray(m.ingredients)) {
        m.ingredients = await convertArrayToNames(m.ingredients);
      }
      if (m.prepared === undefined) m.prepared = false;
      if (m.prepAhead === undefined) m.prepAhead = false;
      if (m.recipeBook === undefined) m.recipeBook = '';
    }
  }
  return arr || [];
}

async function renderButtons() {
  const div = document.getElementById('listButtons');
  div.innerHTML = '';
  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter(m => m.active !== false).length;
    const btn = document.createElement('button');
    btn.textContent = `${MEAL_TYPES[type].label} (${active})`;
    btn.addEventListener('click', () => {
      openOrFocusWindow(`mealListView.html?type=${type}`);
    });
    div.appendChild(btn);
  }
}

function startAddCategory() {
  const div = document.getElementById('listButtons');
  if (div.querySelector('input.newCat')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'newCat';
  input.placeholder = 'Category name';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.display = 'none';
  input.addEventListener('input', () => {
    saveBtn.style.display = input.value.trim() ? '' : 'none';
  });
  saveBtn.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;
    await addMealCategory(val);
    input.remove();
    saveBtn.remove();
  });
  div.appendChild(input);
  div.appendChild(saveBtn);
  input.focus();
}

async function init() {
  await initializeMealCategories();
  await renderButtons();
  const newBtn = document.getElementById('newCategoryBtn');
  if (newBtn) newBtn.addEventListener('click', startAddCategory);
  const unsubscribe = subscribeToChanges(table => {
    if (table === 'meals') renderButtons();
  });
  window.addEventListener('unload', unsubscribe);
}

document.addEventListener('DOMContentLoaded', init);
