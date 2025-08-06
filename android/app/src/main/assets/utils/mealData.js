import { db } from '../db.js';
import { loadJSON } from './dataLoader.js';
import {
  convertArrayToIds,
  convertArrayToNames,
  getItemId
} from './itemRegistry.js';

export const MEAL_TYPES = {
  breakfast: {
    key: 'breakfastMeals',
    path: 'Required for grocery app/breakfast_meals.json',
    label: 'Breakfast'
  },
  lunchDinner: {
    key: 'lunchDinnerMeals',
    path: 'Required for grocery app/lunch_dinner_meals.json',
    label: 'Lunch/Dinner'
  },
  snack: {
    key: 'snackMeals',
    path: 'Required for grocery app/snack_meals.json',
    label: 'Snack'
  },
  dessert: {
    key: 'dessertMeals',
    path: 'Required for grocery app/dessert_meals.json',
    label: 'Dessert'
  }
};

export async function initializeMealCategories() {
  return new Promise(resolve => {
    chrome.storage.local.get('mealCategories', data => {
      const cats = data.mealCategories || [];
      cats.forEach(cat => {
        MEAL_TYPES[cat.id] = cat;
      });
      resolve();
    });
  });
}

export async function addMealCategory(label) {
  const id = (label || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!id) return null;
  const key = `${id}Meals`;
  const cat = { id, key, path: '', label };
  const cats = await new Promise(resolve => {
    chrome.storage.local.get('mealCategories', d => resolve(d.mealCategories || []));
  });
  if (!cats.find(c => c.id === id)) {
    cats.push(cat);
    await new Promise(res => chrome.storage.local.set({ mealCategories: cats }, () => res()));
  }
  MEAL_TYPES[id] = cat;
  const mealsPerDay = await loadMealsPerDay();
  if (mealsPerDay[id] === undefined) {
    mealsPerDay[id] = 1;
    await saveMealsPerDay(mealsPerDay);
  }
  await new Promise(res => chrome.storage.local.get(key, data => {
    if (!data[key]) {
      chrome.storage.local.set({ [key]: [] }, () => res());
    } else res();
  }));
  return cat;
}

// Default daily meal counts used by mealMath.js
export const DEFAULT_MEALS_PER_DAY = {
  breakfast: 1,
  lunchDinner: 2, // lunch and dinner combined
  snack: 1,
  dessert: 1
};

export function loadMealsPerDay() {
  return new Promise(resolve => {
    chrome.storage.local.get('mealsPerDay', data => {
      resolve({ ...DEFAULT_MEALS_PER_DAY, ...(data.mealsPerDay || {}) });
    });
  });
}

export function saveMealsPerDay(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set({ mealsPerDay: obj }, () => resolve());
  });
}

export function loadCookingDays() {
  return new Promise(resolve => {
    chrome.storage.local.get('cookingDays', data => {
      const obj = data.cookingDays || {};
      Object.keys(obj).forEach(k => {
        if (!Array.isArray(obj[k])) obj[k] = [];
      });
      resolve(obj);
    });
  });
}

export function saveCookingDays(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set({ cookingDays: obj }, () => resolve());
  });
}

export async function loadMealsByType(type) {
  const info = MEAL_TYPES[type];
  if (!info) return [];
  let arr = await db.meals.where('category').equals(type).toArray();
  if (!arr.length && info.path) {
    arr = await loadJSON(info.path).catch(() => []);
    for (const m of arr) {
      m.id = m.id || (m.name ? await getItemId(m.name) : undefined);
      m.category = type;
      m.ingredients = await convertArrayToIds(m.ingredients || []);
      if (m.prepared === undefined) m.prepared = false;
      if (m.prepAhead === undefined) m.prepAhead = false;
      if (m.recipeBook === undefined) m.recipeBook = '';
      if (m.weight === undefined) m.weight = 1;
      if (m.groupMeal === undefined) m.groupMeal = false;
    }
    if (arr.length) {
      await db.meals.bulkPut(arr);
    }
  } else {
    arr = await Promise.all(
      arr.map(async m => ({
        ...m,
        ingredients: await convertArrayToNames(m.ingredients || [])
      }))
    );
    arr.forEach(m => {
      if (m.prepared === undefined) m.prepared = false;
      if (m.prepAhead === undefined) m.prepAhead = false;
      if (m.recipeBook === undefined) m.recipeBook = '';
      if (m.weight === undefined) m.weight = 1;
      if (m.groupMeal === undefined) m.groupMeal = false;
    });
  }
  return arr;
}

export async function saveMealRecord(meal) {
  const id = meal.id || (meal.name ? await getItemId(meal.name) : undefined);
  if (!id) return;
  const ingredients = await convertArrayToIds(meal.ingredients || []);
  await db.meals.put({ ...meal, id, ingredients });
}
