import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadArray as loadItemArray, saveArray as saveItemArray } from './utils/itemStorage.js';
import { canonicalName } from './utils/nameUtils.js';

const params = new URLSearchParams(location.search);
const requestedType = params.get('type');
const requestedMealId = params.get('mealId');
const requestedMealName = params.get('meal');

const titleEl = document.getElementById('mealTitle');
const toggleBtn = document.getElementById('toggleEdit');
const listEl = document.getElementById('instructionsView');
const textarea = document.getElementById('instructionsEdit');
const emptyMessageEl = document.getElementById('emptyMessage');
const statusEl = document.getElementById('statusMessage');

let currentMeals = [];
let currentMealIndex = -1;
let currentTypeKey = null;
let isEditing = false;
let mealNotFound = false;

function normalizeMeal(meal) {
  if (!meal || typeof meal !== 'object') return;
  if (typeof meal.instructions !== 'string') {
    meal.instructions = '';
  } else {
    meal.instructions = meal.instructions.trim();
  }
  if (typeof meal.name !== 'string') {
    meal.name = meal.name == null ? '' : String(meal.name);
  }
}

function clearStatus() {
  statusEl.textContent = '';
}

function showStatus(message, timeout = 2000) {
  statusEl.textContent = message;
  if (timeout > 0) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = '';
      }
    }, timeout);
  }
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

function renderView() {
  if (!currentMeals.length || currentMealIndex < 0) {
    document.title = 'Meal Instructions';
    titleEl.textContent = 'Meal Instructions';
    toggleBtn.disabled = true;
    toggleBtn.textContent = 'Edit';
    listEl.innerHTML = '';
    emptyMessageEl.textContent = mealNotFound
      ? 'Meal could not be found.'
      : 'No instructions recorded yet.';
    emptyMessageEl.classList.remove('hidden');
    textarea.style.display = 'none';
    return;
  }

  const meal = currentMeals[currentMealIndex];
  const mealName = meal.name || 'Meal';
  document.title = `${mealName} Instructions`;
  titleEl.textContent = mealName;
  toggleBtn.disabled = false;
  toggleBtn.textContent = isEditing ? 'Save' : 'Edit';
  listEl.innerHTML = '';

  const instructions = meal.instructions || '';
  const trimmed = instructions.trim();
  if (!trimmed) {
    emptyMessageEl.classList.remove('hidden');
    emptyMessageEl.textContent = 'No instructions recorded yet.';
  } else {
    emptyMessageEl.classList.add('hidden');
    const steps = trimmed.split(/\r?\n+/).map(step => step.trim()).filter(Boolean);
    if (steps.length === 0) {
      emptyMessageEl.classList.remove('hidden');
      emptyMessageEl.textContent = 'No instructions recorded yet.';
    } else {
      steps.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        listEl.appendChild(li);
      });
    }
  }

  if (isEditing) {
    textarea.value = instructions;
    textarea.style.display = 'block';
    listEl.classList.add('hidden');
  } else {
    textarea.style.display = 'none';
    listEl.classList.remove('hidden');
  }
}

async function locateMeal() {
  await initializeMealCategories();
  const searchOrder = [];
  if (requestedType && MEAL_TYPES[requestedType]) {
    searchOrder.push(requestedType);
  }
  Object.keys(MEAL_TYPES).forEach(typeId => {
    if (!searchOrder.includes(typeId)) {
      searchOrder.push(typeId);
    }
  });

  for (const typeId of searchOrder) {
    const info = MEAL_TYPES[typeId];
    if (!info || !info.key) continue;
    const meals = await loadItemArray(info.key);
    meals.forEach(normalizeMeal);
    const index = meals.findIndex(matchesMeal);
    if (index !== -1) {
      currentMeals = meals;
      currentMealIndex = index;
      currentTypeKey = info.key;
      mealNotFound = false;
      return;
    }
  }

  currentMeals = [];
  currentMealIndex = -1;
  currentTypeKey = null;
  mealNotFound = true;
}

async function persistInstructions() {
  if (!currentMeals.length || currentMealIndex < 0 || !currentTypeKey) return;
  const meal = currentMeals[currentMealIndex];
  const raw = textarea.value.replace(/\r\n/g, '\n');
  meal.instructions = raw.trim();
  await saveItemArray(currentTypeKey, currentMeals);
  showStatus('Instructions saved');
}

function enterEditMode() {
  if (isEditing || currentMealIndex < 0) return;
  isEditing = true;
  textarea.value = currentMeals[currentMealIndex].instructions || '';
  textarea.style.display = 'block';
  textarea.focus();
  renderView();
}

async function saveAndExitEditMode() {
  if (!isEditing) return;
  await persistInstructions();
  isEditing = false;
  renderView();
}

toggleBtn.addEventListener('click', async () => {
  if (toggleBtn.disabled || currentMealIndex < 0) return;
  if (!isEditing) {
    clearStatus();
    enterEditMode();
  } else {
    await saveAndExitEditMode();
  }
});

textarea.addEventListener('keydown', async event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    await saveAndExitEditMode();
  }
});

(async function init() {
  await locateMeal();
  renderView();
  if (isEditing) {
    textarea.focus();
  }
})();
