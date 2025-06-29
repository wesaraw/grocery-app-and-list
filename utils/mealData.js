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
