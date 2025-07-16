import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

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
            map[m.id || m.name] = m;
          });
        }
        res();
      });
    });
  }
  return map;
}

function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    start: p.get('start'),
    days: parseInt(p.get('days') || '7', 10)
  };
}

function buildCounts(cal, users, mealMap, start, days) {
  const date = start ? new Date(start) : new Date();
  const result = [];
  for (let i = 0; i < days; i++) {
    const dStr = date.toISOString().split('T')[0];
    const counts = {};
    users.forEach(u => {
      const rec = cal[u]?.[dStr] || {};
      Object.values(rec).forEach(val => {
        const meals = Array.isArray(val) ? val : [val];
        meals.forEach(id => {
          const meal = mealMap[id];
          if (!meal || !meal.prepared) return;
          counts[id] = (counts[id] || 0) + 1;
        });
      });
    });
    result.push({ date: dStr, counts });
    date.setDate(date.getDate() + 1);
  }
  return result;
}

function renderRows(data, mealMap) {
  const tbody = document.getElementById('cookBody');
  tbody.innerHTML = '';
  data.forEach(({ date, counts }) => {
    const row = document.createElement('tr');
    const dtd = document.createElement('td');
    dtd.textContent = date;
    row.appendChild(dtd);
    const mealsTd = document.createElement('td');
    Object.entries(counts).forEach(([id, cnt]) => {
      const div = document.createElement('div');
      const name = mealMap[id]?.name || id;
      div.textContent = `${name} (${cnt})`;
      mealsTd.appendChild(div);
    });
    row.appendChild(mealsTd);
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
  const mealMap = await loadAllMeals();
  const { start, days } = getParams();
  document.getElementById('startDate').value = start || new Date().toISOString().split('T')[0];
  document.getElementById('numDays').value = days;

  function update() {
    const startVal = document.getElementById('startDate').value;
    const daysVal = parseInt(document.getElementById('numDays').value, 10) || 7;
    const data = buildCounts(calendar, users, mealMap, startVal, daysVal);
    renderRows(data, mealMap);
  }

  document.getElementById('showBtn').addEventListener('click', update);
  document.getElementById('eatViewBtn').addEventListener('click', openEatView);

  update();
}

document.addEventListener('DOMContentLoaded', init);
