import { MEAL_TYPES, initializeMealCategories, loadCookingDays } from './utils/mealData.js';
import { loadUsers, loadUserPortionMultipliers } from './utils/userData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { parseQuantity } from './utils/calendarUtils.js';

function loadCalendar() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('whatToEatCalendar', data => {
        resolve(data.whatToEatCalendar || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

async function loadAllMeals() {
  const map = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    const { key, path } = MEAL_TYPES[type];
    await new Promise(res => {
      chrome.storage.local.get(key, async data => {
        let arr = data[key];
        if (!arr) {
          const resp = await fetch(path).catch(() => null);
          arr = resp ? await resp.json().catch(() => []) : [];
        }
        if (Array.isArray(arr)) {
          arr.forEach(m => {
            if (m.prepared === undefined) m.prepared = false;
            if (m.prepAhead === undefined) m.prepAhead = false;
            map[m.id || m.name] = m;
          });
        }
        res();
      });
    });
  }
  return map;
}

function sanitizeMultiplier(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

function pushUnique(arr, value) {
  if (!arr.some(item => item === value)) {
    arr.push(value);
  }
}

function buildUserEntries(users = [], multipliers = [], calendar = {}) {
  const entries = [];
  const seen = new Set();
  users.forEach((name, idx) => {
    const keys = [];
    if (name !== undefined && name !== null) {
      pushUnique(keys, name);
      seen.add(String(name));
    }
    const idxKey = String(idx);
    pushUnique(keys, idxKey);
    seen.add(idxKey);
    pushUnique(keys, idx);
    entries.push({ keys, multiplier: sanitizeMultiplier(multipliers[idx]) });
  });
  Object.keys(calendar || {}).forEach(key => {
    const strKey = String(key);
    if (seen.has(strKey)) return;
    entries.push({ keys: [key], multiplier: 1 });
    seen.add(strKey);
  });
  return entries;
}

function getDayRecord(calendar, entry, dateStr) {
  for (const key of entry.keys) {
    const day = calendar?.[key]?.[dateStr];
    if (day) return day;
  }
  return {};
}

function increment(map, key, amount) {
  if (!amount) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    start: p.get('start'),
    days: parseInt(p.get('days') || '7', 10)
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  let rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) rounded = 0;
  let str = rounded.toFixed(3);
  str = str.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return str;
}

function extractUnitText(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([\d\s./+-]+)(.*)$/);
  if (match) {
    return match[2].trim();
  }
  return trimmed;
}

function formatIngredientAmount(ingredient, multiplier) {
  if (!ingredient) return '';
  const raw = (ingredient.serving_size || ingredient.amount || '').trim();
  if (!raw) return '';
  const { value } = parseQuantity(raw);
  if (!value) {
    return raw;
  }
  const total = value * multiplier;
  const formatted = formatNumber(total);
  if (!formatted) {
    return raw;
  }
  const unitText = extractUnitText(raw);
  if (!unitText) return formatted;
  return `${formatted} ${unitText}`;
}

function formatPortions(multiplier) {
  const formatted = formatNumber(multiplier);
  if (!formatted) return '';
  return `${formatted} ${formatted === '1' ? 'portion' : 'portions'}`;
}

function renderMealColumn(container, entries, mealMap) {
  container.innerHTML = '';
  if (!entries?.length) {
    return;
  }
  entries.forEach(([id, totalMultiplier]) => {
    const meal = mealMap[id];
    const block = document.createElement('div');
    block.className = 'meal-block';
    const title = document.createElement('div');
    title.className = 'meal-title';
    const name = meal?.name || id;
    const portionText = formatPortions(totalMultiplier);
    title.textContent = portionText ? `${name} (${portionText})` : name;
    block.appendChild(title);

    const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
    if (ingredients.length) {
      const list = document.createElement('ul');
      list.className = 'ingredient-list';
      ingredients.forEach(ing => {
        const li = document.createElement('li');
        const ingName = ing?.name?.trim() || 'Unnamed ingredient';
        const amountText = formatIngredientAmount(ing, totalMultiplier);
        li.textContent = amountText ? `${ingName}: ${amountText}` : ingName;
        list.appendChild(li);
      });
      block.appendChild(list);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-ingredients';
      placeholder.textContent = 'No ingredient details available';
      block.appendChild(placeholder);
    }

    container.appendChild(block);
  });
}

function buildData(calendar, userEntries, mealMap, start, days, prepDay) {
  const date = start ? new Date(start) : new Date();

  let calcDays = days;
  if (prepDay) {
    const last = new Date(date);
    last.setDate(last.getDate() + days - 1);
    while (true) {
      last.setDate(last.getDate() + 1);
      calcDays++;
      const dayName = last.toLocaleDateString('en-US', { weekday: 'long' });
      if (dayName === prepDay) break;
    }
  }

  const rows = [];
  for (let i = 0; i < calcDays; i++) {
    const dStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const counts = new Map();
    const ahead = new Map();
    userEntries.forEach(entry => {
      const rec = getDayRecord(calendar, entry, dStr) || {};
      Object.values(rec).forEach(val => {
        const meals = Array.isArray(val) ? val : [val];
        meals.forEach(id => {
          const meal = mealMap[id];
          if (!meal) return;
          if (meal.prepared) increment(counts, id, entry.multiplier);
          if (meal.prepAhead) increment(ahead, id, entry.multiplier);
        });
      });
    });
    rows.push({ date: dStr, dayName, counts, ahead });
    date.setDate(date.getDate() + 1);
  }

  if (prepDay) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].dayName !== prepDay) continue;
      const totals = new Map();
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].dayName === prepDay) break;
        rows[j].ahead.forEach((value, id) => {
          increment(totals, id, value);
        });
      }
      rows[i].prepList = totals;
    }
  }

  return rows.slice(0, days).map(row => ({
    date: row.date,
    dayName: row.dayName,
    meals: Array.from(row.counts.entries()),
    prepList: row.prepList ? Array.from(row.prepList.entries()) : []
  }));
}

function renderRows(data, mealMap) {
  const tbody = document.getElementById('cookBody');
  tbody.innerHTML = '';
  data.forEach(({ date, dayName, meals, prepList }) => {
    const row = document.createElement('tr');
    const dtd = document.createElement('td');
    dtd.textContent = dayName ? `${date} (${dayName})` : date;
    row.appendChild(dtd);
    const mealsTd = document.createElement('td');
    renderMealColumn(mealsTd, meals, mealMap);
    row.appendChild(mealsTd);
    const prepTd = document.createElement('td');
    renderMealColumn(prepTd, prepList, mealMap);
    row.appendChild(prepTd);
    tbody.appendChild(row);
  });
}

function openEatView() {
  const params = new URLSearchParams();
  const start = document.getElementById('startDate').value;
  const days = document.getElementById('numDays').value;
  if (start) params.set('start', start);
  if (days) params.set('days', days);
  const url = 'whatToEatCalendar.html' + (params.toString() ? '?' + params.toString() : '');
  if (chrome.runtime?.getURL) {
    openOrFocusWindow(url);
  } else {
    location.href = url;
  }
}

async function init() {
  await initializeMealCategories();
  const users = await loadUsers();
  const calendar = await loadCalendar();
  const multipliers = await loadUserPortionMultipliers();
  const userEntries = buildUserEntries(users, multipliers, calendar);
  const mealMap = await loadAllMeals();
  const cookingDays = await loadCookingDays();
  const prepDay = Array.isArray(cookingDays.prepDay) ? cookingDays.prepDay[0] : null;
  const { start, days } = getParams();
  document.getElementById('startDate').value = start || new Date().toISOString().split('T')[0];
  document.getElementById('numDays').value = days;

  function update() {
    const startVal = document.getElementById('startDate').value;
    const daysVal = parseInt(document.getElementById('numDays').value, 10) || 7;
    const data = buildData(calendar, userEntries, mealMap, startVal, daysVal, prepDay);
    renderRows(data, mealMap);
  }

  document.getElementById('showBtn').addEventListener('click', update);
  document.getElementById('eatViewBtn').addEventListener('click', openEatView);

  update();
}

document.addEventListener('DOMContentLoaded', init);
