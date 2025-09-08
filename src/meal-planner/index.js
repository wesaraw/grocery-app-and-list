import { get, set } from '../services/storageService.js';
import { DEFAULT_MEALS_PER_DAY, MEAL_CATEGORIES } from '../meal-multiplier/constants.js';

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

// Stub for future meal import logic.
export async function importMealsFromFiles(_files) {
  // no-op placeholder
}

export async function calculateMealNeeds() {
  const [users = [], meals = [], multiplierArr = []] = await Promise.all([
    get('users', []),
    get('meals', []),
    get('meal-per-day', [])
  ]);

  const multipliers = Object.fromEntries(
    (Array.isArray(multiplierArr) ? multiplierArr : []).map(e => [e.id, e.mealsPerDay])
  );
  const perDay = { ...DEFAULT_MEALS_PER_DAY, ...multipliers };

  const monthly = [];
  const yearly = [];

  MEAL_CATEGORIES.forEach(cat => {
    const mealsInCat = meals.filter(m => m.type === cat.id);
    if (!mealsInCat.length) return;
    const A = perDay[cat.id] || 0;
    if (!A) return;
    let totalDays = 0;
    users.forEach(u => {
      const days = Number(u.categoryDays?.[cat.id]) || 0;
      totalDays += days;
    });
    if (!totalDays) return;
    const D = mealsInCat.length;
    const yearlySpots = A * totalDays * 52;
    const monthlySpotsPerMeal = yearlySpots / D / 12;
    mealsInCat.forEach(meal => {
      monthly.push({ mealId: meal.id, monthlySpots: monthlySpotsPerMeal });
      yearly.push({ mealId: meal.id, yearlySpots: monthlySpotsPerMeal * 12 });
    });
  });

  const plan = { monthly, yearly, version: 1 };
  await set('meal-plan', plan);
  return plan;
}

export async function rebuildCalendars() {
  const plan = await calculateMealNeeds();
  const [users = [], meals = [], multiplierArr = []] = await Promise.all([
    get('users', []),
    get('meals', []),
    get('meal-per-day', [])
  ]);

  const multipliers = Object.fromEntries(
    (Array.isArray(multiplierArr) ? multiplierArr : []).map(e => [e.id, e.mealsPerDay])
  );
  const perDay = { ...DEFAULT_MEALS_PER_DAY, ...multipliers };

  const prepared = {};
  MEAL_CATEGORIES.forEach(cat => {
    const catMeals = meals.filter(m => m.type === cat.id);
    if (!catMeals.length) return;
    const daily = perDay[cat.id] || 0;
    const totalSlots = Math.round(daily * 7 * 4); // four-week calendar
    const seq = [];
    for (let i = 0; i < totalSlots; i++) {
      seq.push(catMeals[i % catMeals.length].id);
    }
    prepared[cat.id] = seq;
  });

  const whatToEat = {};
  users.forEach(u => {
    const map = {};
    MEAL_CATEGORIES.forEach(cat => {
      const allowed = meals.filter(
        m => m.type === cat.id && Array.isArray(m.users) && m.users.includes(u.id)
      );
      if (allowed.length) {
        const seq = prepared[cat.id] || [];
        map[cat.id] = seq.filter(id => allowed.some(m => m.id === id));
      }
    });
    whatToEat[u.id] = map;
  });

  const overrides = await get('manual-meal-overrides');
  const currentWeek = getCurrentWeek();
  if (overrides?.week === currentWeek && overrides.users) {
    const catOverrides = {};
    Object.entries(overrides.users).forEach(([userId, cats]) => {
      if (!whatToEat[userId]) return;
      Object.entries(cats).forEach(([catId, arr]) => {
        if (!Array.isArray(arr) || !arr.length) return;
        const seq = whatToEat[userId][catId] || [];
        for (let i = 0; i < arr.length; i++) seq[i] = arr[i];
        whatToEat[userId][catId] = seq;
        if (!catOverrides[catId]) catOverrides[catId] = arr;
      });
    });
    Object.entries(catOverrides).forEach(([catId, arr]) => {
      const seq = prepared[catId] || [];
      for (let i = 0; i < arr.length; i++) seq[i] = arr[i];
      prepared[catId] = seq;
    });
  }

  const preparedObj = { calendar: prepared, version: 1 };
  const eatObj = { calendar: whatToEat, version: 1 };
  await set('prepared-meals-calendar', preparedObj);
  await set('what-to-eat-calendar', eatObj);
  return { prepared: preparedObj, whatToEat: eatObj, plan };
}

export async function renderMealPlanner(root) {
  const users = await get('users', []);
  root.innerHTML = '';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async e => {
    const files = e.target.files;
    if (files && files.length) {
      await importMealsFromFiles(files);
      await rebuildCalendars();
      e.target.value = '';
    }
  });

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import Meals';
  importBtn.addEventListener('click', () => fileInput.click());

  const userSelect = document.createElement('select');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  });

  const thresholdInput = document.createElement('input');
  thresholdInput.type = 'number';
  thresholdInput.step = 'any';

  function updateInput() {
    const user = users.find(u => u.id === userSelect.value);
    thresholdInput.value = user?.priceThresholds?.default ?? '';
  }
  userSelect.addEventListener('change', updateInput);
  if (users.length) {
    userSelect.value = users[0].id;
    updateInput();
  }

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Threshold';
  saveBtn.addEventListener('click', async () => {
    const user = users.find(u => u.id === userSelect.value);
    const val = parseFloat(thresholdInput.value);
    if (user && !Number.isNaN(val)) {
      user.priceThresholds = { ...(user.priceThresholds || {}), default: val };
      await set('users', users);
      await rebuildCalendars();
    }
  });

  const rebuildBtn = document.createElement('button');
  rebuildBtn.textContent = 'Rebuild Calendars';
  rebuildBtn.addEventListener('click', async () => {
    await rebuildCalendars();
  });

  root.append(fileInput, importBtn, userSelect, thresholdInput, saveBtn, rebuildBtn);
}
