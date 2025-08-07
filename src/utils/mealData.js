import { db } from '../db.js';
import { loadJSON } from './dataLoader.js';
import {
  convertArrayToIds,
  convertArrayToNames,
  getItemId,
  loadArray,
  saveArray
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
  const existing = await db.lists.get(key);
  if (!existing) {
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

export async function loadMealsPerDay() {
  const rec = await db.lists.get('mealsPerDay');
  return { ...DEFAULT_MEALS_PER_DAY, ...(rec?.value || {}) };
}

export async function saveMealsPerDay(obj) {
  await db.lists.put({ key: 'mealsPerDay', value: obj });
}

export async function loadCookingDays() {
  const rec = await db.lists.get('cookingDays');
  const obj = rec?.value || {};
  Object.keys(obj).forEach(k => {
    if (!Array.isArray(obj[k])) obj[k] = [];
  });
  return obj;
}

export async function saveCookingDays(obj) {
  await db.lists.put({ key: 'cookingDays', value: obj });
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
