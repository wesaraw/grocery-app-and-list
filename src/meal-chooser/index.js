import { get, set } from '../services/storageService.js';
import { MEAL_CATEGORIES, DEFAULT_MEALS_PER_DAY } from '../meal-multiplier/constants.js';

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

async function loadOverrides() {
  const week = getCurrentWeek();
  const stored =
    (await get('manual-meal-overrides')) || { week, users: {}, version: 1 };
  if (stored.week !== week || !stored.users) {
    return { week, users: {}, version: 1 };
  }
  return stored;
}

async function saveOverrides(obj) {
  await set('manual-meal-overrides', obj);
}

function userUsesMeal(meal, userId) {
  return Array.isArray(meal.users) ? meal.users.includes(userId) : false;
}

export async function renderMealChooser(root) {
  const [users = [], meals = [], multiplierArr = []] = await Promise.all([
    get('users', []),
    get('meals', []),
    get('meal-per-day', [])
  ]);

  const multipliers = Object.fromEntries(
    (Array.isArray(multiplierArr) ? multiplierArr : []).map(e => [
      e.id,
      e.mealsPerDay
    ])
  );
  const perDay = { ...DEFAULT_MEALS_PER_DAY, ...multipliers };

  let overrides = await loadOverrides();
  let currentUserId = users[0]?.id;

  root.innerHTML = '';
  const userButtons = document.createElement('div');
  userButtons.id = 'userButtons';
  const categorySelect = document.createElement('select');
  categorySelect.id = 'categorySelect';
  MEAL_CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.label;
    categorySelect.appendChild(opt);
  });
  const remainingDiv = document.createElement('div');
  remainingDiv.id = 'remaining';
  const mealButtons = document.createElement('div');
  mealButtons.id = 'mealButtons';
  const resetBtn = document.createElement('button');
  resetBtn.id = 'resetBtn';
  resetBtn.textContent = 'Reset Week';
  resetBtn.addEventListener('click', async () => {
    overrides = { week: getCurrentWeek(), users: {}, version: 1 };
    await saveOverrides(overrides);
    renderMeals();
  });

  function weeklySpotsPerUser(catId) {
    const daily = perDay[catId] || 0;
    return daily * 7;
  }

  function renderUsers() {
    userButtons.innerHTML = '';
    users.forEach(u => {
      const btn = document.createElement('button');
      btn.textContent = u.name;
      btn.addEventListener('click', () => {
        currentUserId = u.id;
        renderMeals();
      });
      userButtons.appendChild(btn);
    });
  }

  async function renderMeals() {
    const scrollTop = window.scrollY;
    const type = categorySelect.value;
    mealButtons.innerHTML = '';

    const userSlots = overrides.users[currentUserId] || {};
    const slotArr = userSlots[type] || [];
    const consumedTotal = slotArr.length;
    const weekly = weeklySpotsPerUser(type);
    const remaining = weekly - consumedTotal;
    remainingDiv.textContent = `Remaining slots: ${remaining} / ${weekly}`;
    if (remaining <= 0) return;

    const allowedMeals = meals.filter(
      m => m.type === type && userUsesMeal(m, currentUserId)
    );
    const subscribedCount = allowedMeals.length || 1;
    const perMealLimit = Math.floor(weekly / subscribedCount);

    allowedMeals.forEach(meal => {
      const used = slotArr.filter(id => id === meal.id).length;
      if (used >= perMealLimit) return;
      const btn = document.createElement('button');
      btn.textContent = meal.name;
      btn.addEventListener('click', async () => {
        overrides = await loadOverrides();
        const rec = (overrides.users[currentUserId] =
          overrides.users[currentUserId] || {});
        const arr = (rec[type] = rec[type] || []);
        arr.push(meal.id);
        await saveOverrides(overrides);
        renderMeals();
      });
      mealButtons.appendChild(btn);
    });
    window.scrollTo(0, scrollTop);
  }

  categorySelect.addEventListener('change', renderMeals);
  renderUsers();
  renderMeals();
  root.append(userButtons, categorySelect, remainingDiv, mealButtons, resetBtn);
}
