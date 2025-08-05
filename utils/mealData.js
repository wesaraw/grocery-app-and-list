import { loadArray, saveArray } from './itemRegistry.js';

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
  const cats = await loadArray('mealCategories');
  cats.forEach(cat => {
    MEAL_TYPES[cat.id] = cat;
  });
}

export async function addMealCategory(label) {
  const id = (label || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!id) return null;
  const key = `${id}Meals`;
  const cat = { id, key, path: '', label };
  const cats = await loadArray('mealCategories');
  if (!cats.find(c => c.id === id)) {
    cats.push(cat);
    await saveArray('mealCategories', cats);
  }
  MEAL_TYPES[id] = cat;
  const mealsPerDay = await loadMealsPerDay();
  if (mealsPerDay[id] === undefined) {
    mealsPerDay[id] = 1;
    await saveMealsPerDay(mealsPerDay);
  }
  const existing = await loadArray(key);
  if (existing.length === 0) {
    await saveArray(key, []);
  }
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
