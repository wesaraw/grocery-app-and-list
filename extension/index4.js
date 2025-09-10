import { get, set } from './storageService.js';
import { DEFAULT_MEALS_PER_DAY, MEAL_CATEGORIES } from './constants.js';
export { renderCalendarView } from './calendarView.js';
export { renderCookScheduleView } from './cookScheduleView.js';
import './meals.js';
import './users.js';
import './cookingDays.js';
import './validators.js';

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function readAsText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function readAsDataURL(file) {
  if (typeof file.arrayBuffer === 'function') {
    const buf = await file.arrayBuffer();
    const base64 =
      typeof Buffer !== 'undefined'
        ? Buffer.from(buf).toString('base64')
        : btoa(String.fromCharCode(...new Uint8Array(buf)));
    const mime = file.type || 'application/octet-stream';
    return `data:${mime};base64,${base64}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseMealsFromXml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const meals = [];
  const mealEls = doc.getElementsByTagName('meal');
  for (let i = 0; i < mealEls.length; i++) {
    const mEl = mealEls[i];
    const getText = tag => {
      const el = mEl.getElementsByTagName(tag)[0];
      return el && el.textContent ? el.textContent.trim() : '';
    };
    const meal = {};
    meal.category = getText('category') || 'lunchDinner';
    meal.name = getText('name');
    meal.recipeBook = getText('recipeBook');
    meal.image = getText('image') || null;
    meal.userBits = getText('users');
    meal.prepared = getText('prepared').toLowerCase() === 'true';
    meal.group = getText('group').toLowerCase() === 'true';
    const weight = parseFloat(getText('weight'));
    meal.weight = !isNaN(weight) && weight > 0 ? weight : 1;
    meal.ingredients = [];
    const ingRoot = mEl.getElementsByTagName('ingredients')[0];
    if (ingRoot) {
      const itemEls = ingRoot.getElementsByTagName('item');
      for (let j = 0; j < itemEls.length; j++) {
        const iEl = itemEls[j];
        const iname = iEl.getElementsByTagName('name')[0]?.textContent?.trim();
        const amt = parseFloat(iEl.getElementsByTagName('amount')[0]?.textContent?.trim());
        const unit = iEl.getElementsByTagName('unit')[0]?.textContent?.trim();
        if (iname && !isNaN(amt) && unit) {
          meal.ingredients.push({ name: iname, amount: amt, unit });
        }
      }
    }
    if (meal.name && meal.ingredients.length) meals.push(meal);
  }
  return meals;
}

async function importMealsFromFiles(files) {
  const arr = Array.from(files || []);
  const xmlFile = arr.find(f => /\.xml$/i.test(f.name));
  if (!xmlFile) return;
  const imageFiles = arr.filter(f => f !== xmlFile);
  const images = {};
  await Promise.all(
    imageFiles.map(async f => {
      images[f.name] = await readAsDataURL(f);
    })
  );
  const xmlText = await readAsText(xmlFile);
  const parsedMeals = parseMealsFromXml(xmlText);

  const [items = [], meals = [], users = []] = await Promise.all([
    get('items', []),
    get('meals', []),
    get('users', []),
  ]);

  const newMeals = [];
  let itemsModified = false;

  parsedMeals.forEach(m => {
    m.ingredients.forEach(ing => {
      if (!items.find(i => i.name === ing.name)) {
        const id = slugify(ing.name);
        items.push({
          id,
          name: ing.name,
          unit: ing.unit,
          category: 'Mass Import',
          stock: [],
          consumption: [],
          consumptionPlan: { monthly: 0, yearly: 0 },
          version: 1,
        });
        itemsModified = true;
      }
    });

    const id = slugify(m.name) + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10));
    const userArr = [];
    for (let i = 0; i < m.userBits.length && i < users.length; i++) {
      if (m.userBits[i] === '1') userArr.push(users[i].id);
    }
    const meal = {
      id,
      name: m.name,
      type: m.category,
      ingredients: m.ingredients.map(ing => ({ name: ing.name, amount: ing.amount, unit: ing.unit })),
      flags: { prepared: m.prepared, prepAhead: false, group: m.group },
      weight: m.weight,
      recipeBook: m.recipeBook || null,
      users: userArr,
      image: m.image && images[m.image] ? images[m.image] : null,
      version: 2,
    };
    newMeals.push(meal);
  });

  if (itemsModified) await set('items', items);
  if (newMeals.length) await set('meals', [...meals, ...newMeals]);

  await rebuildCalendars();
}

async function calculateMealNeeds() {
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

async function rebuildCalendars() {
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
      const userMeals = meals.filter(
        m => m.type === cat.id && Array.isArray(m.users) && m.users.includes(u.id)
      );
      let allowed = userMeals;
      const threshold = u.priceThresholds?.default;
      if (threshold != null) {
        // Respect legacy Price Threshold controls (Version Old/mealPlanner.html lines 20-25)
        // and Upgrade Notes/Grocery App Feature List V1.0.txt lines 250-253.
        allowed = userMeals.filter(
          m => m.totalCost != null && m.totalCost <= threshold
        );
        if (!allowed.length && userMeals.length) {
          const cheapest = userMeals.reduce((min, m) => {
            const cost = m.totalCost != null ? m.totalCost : Infinity;
            const minCost =
              min.totalCost != null ? min.totalCost : Infinity;
            return cost < minCost ? m : min;
          });
          allowed = [cheapest];
        }
      }
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
  const detail = { prepared: preparedObj, whatToEat: eatObj, plan };
  // Notify calendar views to refresh (Upgrade Notes/Grocery App Feature List V1.0.txt lines 257-259)
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent('calendars-updated', { detail })
    );
  }
  return detail;
}

async function renderMealPlanner(root) {
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

export { calculateMealNeeds, importMealsFromFiles, rebuildCalendars, renderMealPlanner };
//# sourceMappingURL=index4.js.map
