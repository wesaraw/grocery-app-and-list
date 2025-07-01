import {
  MEAL_TYPES,
  DEFAULT_MEALS_PER_DAY,
  loadMealsPerDay,
  initializeMealCategories
} from './mealData.js';
import { loadJSON } from './dataLoader.js';
import { loadUsers, loadUserCategoryDays } from './userData.js';

function parseAmount(str) {
  if (!str) return 0;
  const frac = str.match(/^(\d+)\/(\d+)/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
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

export async function calculateAndSaveMealNeeds() {
  await initializeMealCategories();
  const monthlyMap = {};
  const mealsPerDay = await loadMealsPerDay();
  const users = await loadUsers();
  const userDays = await loadUserCategoryDays();

  while (userDays.length < users.length) userDays.push({});

  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter(m => {
      if (Array.isArray(m.users)) return m.users.some(Boolean);
      return (m.people ?? m.multiplier ?? 1) > 0;
    });
    if (!active.length) continue;
    const perDay = mealsPerDay[type] ?? DEFAULT_MEALS_PER_DAY[type];

    // Precompute how many meals each user is subscribed to for this category
    const userCounts = users.map((_, idx) =>
      active.filter(m => Array.isArray(m.users) && m.users[idx]).length
    );

    active.forEach(meal => {
      if (Array.isArray(meal.users)) {
        meal.users.forEach((use, idx) => {
          if (!use) return;
          const days = userDays[idx]?.[type];
          const personDays = days === undefined ? 1 : parseFloat(days);
          if (personDays <= 0) return;
          const totalCount = userCounts[idx] || 1;
          const monthlySpots = (perDay * personDays * 52) / totalCount / 12;
          (meal.ingredients || []).forEach(ing => {
            const serving = parseAmount(ing.serving_size || ing.amount);
            if (!serving) return;
            const need = serving * monthlySpots;
            monthlyMap[ing.name] = (monthlyMap[ing.name] || 0) + need;
          });
        });
      } else {
        const people = meal.people ?? meal.multiplier ?? 1;
        if (people <= 0) return;
        const personDays = people * 7;
        const monthlySpots = (perDay * personDays * 52) / active.length / 12;
        (meal.ingredients || []).forEach(ing => {
          const serving = parseAmount(ing.serving_size || ing.amount);
          if (!serving) return;
          const need = serving * monthlySpots;
          monthlyMap[ing.name] = (monthlyMap[ing.name] || 0) + need;
        });
      }
    });
  }
  const yearlyMap = {};
  Object.keys(monthlyMap).forEach(name => {
    yearlyMap[name] = monthlyMap[name] * 12;
  });
  const monthlyArr = Object.entries(monthlyMap).map(([name, monthly_consumption]) => ({
    name,
    monthly_consumption
  }));
  const yearlyArr = Object.entries(yearlyMap).map(([name, total_needed_year]) => ({
    name,
    total_needed_year
  }));
  await new Promise(resolve => {
    chrome.storage.local.set(
      { mealPlanMonthly: monthlyArr, mealPlanYearly: yearlyArr },
      () => resolve()
    );
  });
  return { monthlyArr, yearlyArr };
}

export function loadMealPlanData() {
  return new Promise(resolve => {
    chrome.storage.local.get(['mealPlanMonthly', 'mealPlanYearly'], data => {
      resolve({
        monthly: data.mealPlanMonthly || [],
        yearly: data.mealPlanYearly || []
      });
    });
  });
}
