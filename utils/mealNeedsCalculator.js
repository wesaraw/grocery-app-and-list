import { MEAL_TYPES, DEFAULT_MEALS_PER_DAY } from './mealData.js';
import { loadJSON } from './dataLoader.js';
import { calculateMonthlyMealSpots } from './mealMath.js';
import { normalizeName } from './nameUtils.js';

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
  const monthlyMap = {};
  const nameLookup = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter(m => (m.multiplier || 0) > 0);
    if (!active.length) continue;
    const totalCount = active.reduce((sum, m) => sum + (m.multiplier || 1), 0);
    const baseSpots = calculateMonthlyMealSpots(
      DEFAULT_MEALS_PER_DAY[type],
      1,
      7,
      totalCount
    );
    active.forEach(meal => {
      const mealSpots = baseSpots * (meal.multiplier || 1);
      (meal.ingredients || []).forEach(ing => {
        const serving = parseAmount(ing.serving_size || ing.amount);
        if (!serving) return;
        const need = serving * mealSpots;
        const key = normalizeName(ing.name);
        if (!nameLookup[key]) nameLookup[key] = ing.name;
        monthlyMap[key] = (monthlyMap[key] || 0) + need;
      });
    });
  }
  const yearlyMap = {};
  Object.keys(monthlyMap).forEach(key => {
    yearlyMap[key] = monthlyMap[key] * 12;
  });
  const monthlyArr = Object.entries(monthlyMap).map(([key, monthly_consumption]) => ({
    name: nameLookup[key],
    monthly_consumption
  }));
  const yearlyArr = Object.entries(yearlyMap).map(([key, total_needed_year]) => ({
    name: nameLookup[key],
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
