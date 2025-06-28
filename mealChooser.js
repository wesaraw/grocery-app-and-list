import { loadUsers } from './utils/userData.js';
import { MEAL_TYPES, DEFAULT_MEALS_PER_DAY } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
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

function loadMealSlots() {
  return new Promise(resolve => {
    chrome.storage.local.get('mealSlots', data => {
      const week = getCurrentWeek();
      let slots = data.mealSlots || { week, users: {} };
      if (slots.week !== week) {
        slots = { week, users: {} };
      }
      resolve(slots);
    });
  });
}

function saveMealSlots(slots) {
  return new Promise(resolve => {
    chrome.storage.local.set({ mealSlots: slots }, () => resolve());
  });
}

function weeklySpotsPerUser(category, userCount) {
  const perDay = DEFAULT_MEALS_PER_DAY[category] || 0;
  const yearlySpots = perDay * (userCount * 7) * 52;
  const perPersonYear = yearlySpots / userCount;
  return perPersonYear / 52;
}

function usesMeal(meal, idx, userNames) {
  if (Array.isArray(meal.users)) {
    if (meal.users.length < userNames.length) {
      for (let i = meal.users.length; i < userNames.length; i++) {
        meal.users.push(false);
      }
    }
    return meal.users[idx];
  }
  if (idx === 0) {
    const people = meal.people ?? meal.multiplier ?? (meal.active === false ? 0 : 1);
    return people > 0;
  }
  return false;
}

async function init() {
  const userButtons = document.getElementById('userButtons');
  const categorySelect = document.getElementById('categorySelect');
  const mealButtons = document.getElementById('mealButtons');
  const remainingDiv = document.getElementById('remaining');

  const users = await loadUsers();
  let slots = await loadMealSlots();
  let currentUser = 0;

  function renderUserButtons() {
    userButtons.innerHTML = '';
    users.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        currentUser = idx;
        renderMeals();
      });
      userButtons.appendChild(btn);
    });
  }

  async function renderMeals() {
    const type = categorySelect.value;
    const meals = await loadMeals(type);
    mealButtons.innerHTML = '';
    const userName = users[currentUser];
    const userSlots = slots.users[userName] || {};
    const consumed = userSlots[type] || 0;
    const weekly = weeklySpotsPerUser(type, users.length);
    const remaining = weekly - consumed;
    remainingDiv.textContent = `Remaining slots: ${remaining.toFixed(0)} / ${weekly}`;
    if (remaining <= 0) return;
    meals.forEach(meal => {
      if (usesMeal(meal, currentUser, users)) {
        const btn = document.createElement('button');
        btn.textContent = meal.name || '';
        btn.addEventListener('click', async () => {
          slots = await loadMealSlots();
          const rec = (slots.users[userName] = slots.users[userName] || {});
          rec[type] = (rec[type] || 0) + 1;
          await saveMealSlots(slots);
          renderMeals();
        });
        mealButtons.appendChild(btn);
      }
    });
  }

  renderUserButtons();
  categorySelect.addEventListener('change', renderMeals);
  renderMeals();
}

document.addEventListener('DOMContentLoaded', init);
