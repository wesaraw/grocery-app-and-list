import { MEAL_TYPES, DEFAULT_MEALS_PER_DAY, loadMealsPerDay, initializeMealCategories } from './mealData.js';
import { loadJSON } from './dataLoader.js';
import { calculateMonthlyMealSpots } from './mealMath.js';

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
  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter(m => (m.people ?? m.multiplier ?? 1) > 0);
    if (!active.length) continue;
    const totalCount = active.length;
    const baseSpots = calculateMonthlyMealSpots(
      mealsPerDay[type] ?? DEFAULT_MEALS_PER_DAY[type],
      1,
      7,
      totalCount
    );
    active.forEach(meal => {
      const people = meal.people ?? meal.multiplier ?? 1;
      const mealSpots = baseSpots * people;
      (meal.ingredients || []).forEach(ing => {
        const serving = parseAmount(ing.serving_size || ing.amount);
        if (!serving) return;
        const need = serving * mealSpots;
        monthlyMap[ing.name] = (monthlyMap[ing.name] || 0) + need;
      });
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
