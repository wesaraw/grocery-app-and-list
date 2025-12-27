export const MEAL_TYPES = {
  breakfast: {
    key: 'breakfastMeals',
    path: 'data/required-for-grocery-app/breakfast_meals.json',
    label: 'Breakfast'
  },
  lunchDinner: {
    key: 'lunchDinnerMeals',
    path: 'data/required-for-grocery-app/lunch_dinner_meals.json',
    label: 'Lunch/Dinner'
  },
  snack: {
    key: 'snackMeals',
    path: 'data/required-for-grocery-app/snack_meals.json',
    label: 'Snack'
  },
  dessert: {
    key: 'dessertMeals',
    path: 'data/required-for-grocery-app/dessert_meals.json',
    label: 'Dessert'
  }
};

export const WHAT_TO_COOK_VISIBILITY_KEY = 'whatToCookVisibility';

function normalizeVisibilityMap(raw = {}) {
  const normalized = {};
  if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([categoryId, value]) => {
      if (categoryId == null) return;
      normalized[categoryId] = value !== false;
    });
  }
  Object.keys(MEAL_TYPES).forEach(categoryId => {
    if (normalized[categoryId] === undefined) {
      normalized[categoryId] = true;
    }
  });
  return normalized;
}

export function loadWhatToCookVisibility() {
  return new Promise(resolve => {
    chrome.storage.local.get(WHAT_TO_COOK_VISIBILITY_KEY, data => {
      const raw = data?.[WHAT_TO_COOK_VISIBILITY_KEY];
      resolve(normalizeVisibilityMap(raw));
    });
  });
}

export function saveWhatToCookVisibility(map = {}) {
  const stored = {};
  Object.entries(normalizeVisibilityMap(map)).forEach(([categoryId, value]) => {
    stored[categoryId] = value !== false;
  });
  return new Promise(resolve => {
    chrome.storage.local.set({ [WHAT_TO_COOK_VISIBILITY_KEY]: stored }, () => resolve());
  });
}

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
