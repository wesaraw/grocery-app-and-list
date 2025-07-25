import {
  MEAL_TYPES,
  DEFAULT_MEALS_PER_DAY,
  loadMealsPerDay,
  initializeMealCategories,
  loadCookingDays
} from './mealData.js';
import {
  generatePreparedMealsCalendar
} from './preparedMealsCalendar.js';
import { generateWhatToEatCalendar } from './whatToEatCalendar.js';
import { loadJSON } from './dataLoader.js';
import { initUomTable, convert } from './uomConverter.js';
import { loadDensityMap, convertWithDensity } from './unitNormalize.js';
import {
  loadUsers,
  loadUserCategoryDays,
  loadUserPriceThresholds
} from './userData.js';
import { loadItemSeasons } from './seasonData.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function parseQuantity(str) {
  if (!str) return { value: 0, unit: null };
  const text = str.trim().toLowerCase();
  if (/^(?:just\s+a\s+)?pinch(?:\b|\s|$)/i.test(text)) {
    return { value: 1 / 16, unit: 'tsp' };
  }
  const m = text.match(/^([\d.]+(?:\/\d+)?)\s*([a-zA-Z-]+)?/);
  if (!m) return { value: 0, unit: null };
  let numStr = m[1];
  let value;
  const frac = numStr.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    value = !isNaN(num) && !isNaN(den) && den !== 0 ? num / den : 0;
  } else {
    value = parseFloat(numStr);
  }
  if (isNaN(value)) value = 0;
  let unit = m[2] ? m[2].toLowerCase() : null;
  if (!unit) unit = 'ea';
  return { value, unit };
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) {
        arr = await loadJSON(path);
      }
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.weight === undefined) m.weight = 1;
          if (m.groupMeal === undefined) m.groupMeal = false;
        });
      }
      resolve(arr || []);
    });
  });
}

export async function calculateAndSaveMealNeeds() {
  await initializeMealCategories();
  await initUomTable();
  const densityMap = await loadDensityMap();
  const needsList = await loadJSON(YEARLY_NEEDS_PATH).catch(() => []);
  const unitMap = new Map(needsList.map(n => [n.name, n.home_unit]));
  const monthlyMap = {};
  const monthlyBreakdown = {};
  const mealsPerDay = await loadMealsPerDay();
  const users = await loadUsers();
  const userDays = await loadUserCategoryDays();
  const priceThresholds = await loadUserPriceThresholds();
  const itemSeasons = await loadItemSeasons();

  while (userDays.length < users.length) userDays.push({});

  for (const type of Object.keys(MEAL_TYPES)) {
    const label = MEAL_TYPES[type].label;
    const meals = await loadMeals(type);
    const active = meals.filter(m => {
      if (Array.isArray(m.users)) return m.users.some(Boolean);
      return (m.people ?? m.multiplier ?? 1) > 0;
    });
    if (!active.length) continue;
    const perDay = mealsPerDay[type] ?? DEFAULT_MEALS_PER_DAY[type];

    // Count how many meals each user has in this category
    const userMealCounts = users.map(() => 0);
    active.forEach(m => {
      if (!Array.isArray(m.users)) return;
      m.users.forEach((use, idx) => {
        if (use) userMealCounts[idx]++;
      });
    });

    active.forEach(meal => {
      const details = {
        perDay,
        activeMeals: active.length,
        factors: []
      };
      let monthlySpots = 0;

      if (Array.isArray(meal.users)) {
        meal.users.forEach((use, idx) => {
          if (!use) return;
          let val = userDays[idx]?.[label];
          let days = 0;
          if (Array.isArray(val)) days = val.length;
          else {
            const num = parseFloat(val);
            days = isNaN(num) ? 0 : num;
          }
          const count = userMealCounts[idx] || 1;
          details.factors.push({ people: 1, days });
          monthlySpots += (perDay * days * 52) / count / 12;
        });
      } else {
        const people = meal.people ?? meal.multiplier ?? 1;
        if (people <= 0) return;
        const avgDays =
          users.length > 0
            ?
                users.reduce((sum, _u, idx) => {
                  const val = userDays[idx]?.[label];
                  if (Array.isArray(val)) return sum + val.length;
                  const num = parseFloat(val);
                  return sum + (isNaN(num) ? 0 : num);
                }, 0) / users.length
            : 0;
        details.factors.push({ people, days: avgDays });
        monthlySpots = (perDay * people * avgDays * 52) / active.length / 12;
      }

      if (monthlySpots <= 0) return;
      (meal.ingredients || []).forEach(ing => {
        const { value, unit } = parseQuantity(ing.serving_size || ing.amount);
        if (!value) return;
        let qty = value;
        const target = unitMap.get(ing.name);
        if (unit && target && unit !== target) {
          const info = densityMap[ing.name] || {};
          qty = convertWithDensity(value, unit, target, {
            convert_volume_to_weight: info.convert,
            custom_density_ratio: info.ratio
          });
        }
        const need = qty * monthlySpots;
        monthlyMap[ing.name] = (monthlyMap[ing.name] || 0) + need;
        if (!monthlyBreakdown[ing.name]) monthlyBreakdown[ing.name] = {};
        if (!monthlyBreakdown[ing.name][meal.name]) {
          monthlyBreakdown[ing.name][meal.name] = { amount: 0, details };
        }
        monthlyBreakdown[ing.name][meal.name].amount += need;
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
      {
        mealPlanMonthly: monthlyArr,
        mealPlanYearly: yearlyArr,
        mealPlanMonthlyBreakdown: monthlyBreakdown
      },
      () => resolve()
    );
  });

  // build prepared and What To Eat calendars
  const cookingDays = await loadCookingDays();
  const dayCats = {};
  Object.keys(cookingDays).forEach(key => {
    if (MEAL_TYPES[key]) dayCats[key] = cookingDays[key];
  });
  const mealsByCategory = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    mealsByCategory[type] = await loadMeals(type);
  }
  const startDate = new Date();
  const preparedCal = generatePreparedMealsCalendar(
    dayCats,
    mealsByCategory,
    startDate,
    4,
    itemSeasons
  );

  const subscriptions = {};
  users.forEach(u => (subscriptions[u] = {}));
  Object.entries(mealsByCategory).forEach(([cat, meals]) => {
    meals.forEach(meal => {
      if (!Array.isArray(meal.users)) return;
      meal.users.forEach((use, idx) => {
        if (!use) return;
        const user = users[idx];
        if (!subscriptions[user][cat]) subscriptions[user][cat] = [];
        subscriptions[user][cat].push(meal);
      });
    });
  });

  const eatingDays = {};
  users.forEach((u, idx) => {
    const rec = userDays[idx] || {};
    eatingDays[u] = {};
    Object.entries(rec).forEach(([label, days]) => {
      const cat = Object.keys(MEAL_TYPES).find(
        k => MEAL_TYPES[k].label === label
      );
      if (cat) eatingDays[u][cat] = Array.isArray(days) ? days : [];
    });
  });

  const whatCal = generateWhatToEatCalendar(
    users,
    preparedCal,
    subscriptions,
    eatingDays,
    mealsPerDay,
    startDate,
    4,
    priceThresholds,
    itemSeasons
  );

  await new Promise(resolve => {
    chrome.storage.local.set(
      {
        preparedMealsCalendar: preparedCal,
        whatToEatCalendar: whatCal
      },
      () => resolve()
    );
  });
  return { monthlyArr, yearlyArr, monthlyBreakdown };
}

export function loadMealPlanData() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['mealPlanMonthly', 'mealPlanYearly', 'mealPlanMonthlyBreakdown'],
      data => {
        resolve({
          monthly: data.mealPlanMonthly || [],
          yearly: data.mealPlanYearly || [],
          breakdown: data.mealPlanMonthlyBreakdown || {}
        });
      }
    );
  });
}
