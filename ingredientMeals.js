import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

let filterText = '';
const headerState = {};
let allItems = [];
let ingredientUl;
let mealUl;
const ingredientMealMap = new Map();
const mealNameById = new Map();
const scheduledMeals = new Set();
let currentIngredient = null;

function loadArray(key, path) {
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

const loadNeeds = () => loadArray('yearlyNeeds', YEARLY_NEEDS_PATH);

function loadMealsForType({ key, path }) {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      resolve(arr || []);
    });
  });
}

function loadStoredArray(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || []));
  });
}

function loadCalendar() {
  return new Promise(resolve => {
    chrome.storage.local.get('whatToEatCalendar', data => {
      resolve(data.whatToEatCalendar || {});
    });
  });
}

async function buildIngredientMealMap() {
  await initializeMealCategories();
  const types = Object.keys(MEAL_TYPES);
  for (const type of types) {
    const info = MEAL_TYPES[type];
    const meals = await loadMealsForType(info);
    meals.forEach(meal => {
      const id = meal.id || meal.name;
      mealNameById.set(id, meal.name);
      (meal.ingredients || []).forEach(ing => {
        const name = ing.name;
        if (!ingredientMealMap.has(name)) ingredientMealMap.set(name, []);
        ingredientMealMap.get(name).push({ name: meal.name, type });
      });
    });
  }
}

async function buildScheduledMealSet() {
  const [monthArr, calendar] = await Promise.all([
    loadStoredArray('mealPlanMonthly'),
    loadCalendar()
  ]);
  monthArr.forEach(m => scheduledMeals.add(m.name));
  Object.values(calendar).forEach(userDays => {
    Object.values(userDays).forEach(day => {
      Object.values(day).forEach(val => {
        if (Array.isArray(val)) {
          val.forEach(v => {
            const name = mealNameById.get(v) || v;
            scheduledMeals.add(name);
          });
        } else if (val) {
          const name = mealNameById.get(val) || val;
          scheduledMeals.add(name);
        }
      });
    });
  });
}

function createIngredientItem(name) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.addEventListener('click', () => showMealsForIngredient(name));
  li.appendChild(btn);
  return li;
}

function renderIngredients() {
  ingredientUl.innerHTML = '';
  const arr = filterText
    ? allItems.filter(it => it.name.toLowerCase().includes(filterText))
    : allItems;
  renderItemsWithCategoryHeaders(arr, ingredientUl, it => createIngredientItem(it.name), headerState);
}

function renderMealList(meals) {
  mealUl.innerHTML = '';
  const filterOn = document.getElementById('filterCurrent').checked;
  meals
    .filter(m => !filterOn || scheduledMeals.has(m.name))
    .forEach(m => {
      const li = document.createElement('li');
      const label = MEAL_TYPES[m.type]?.label || m.type;
      li.textContent = label ? `${m.name} (${label})` : m.name;
      mealUl.appendChild(li);
    });
}

function showMealsForIngredient(name) {
  currentIngredient = name;
  const meals = ingredientMealMap.get(name) || [];
  renderMealList(meals);
}

async function init() {
  ingredientUl = document.getElementById('ingredientList');
  mealUl = document.getElementById('mealList');
  const needs = await loadNeeds();
  allItems = sortItemsByCategory(needs);
  await buildIngredientMealMap();
  await buildScheduledMealSet();
  renderIngredients();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    renderIngredients();
  });

  document.getElementById('filterCurrent').addEventListener('change', () => {
    if (currentIngredient) showMealsForIngredient(currentIngredient);
  });
}

document.addEventListener('DOMContentLoaded', init);
