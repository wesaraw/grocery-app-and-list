import { MEAL_TYPES, initializeMealCategories, loadCookingDays } from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';
import { loadJSON } from './utils/dataLoader.js';
import { loadArray } from './utils/itemStorage.js';
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

function hasStoredValue(key) {
  return new Promise(resolve => {
    try {
      if (
        typeof chrome === 'undefined' ||
        !chrome.storage ||
        !chrome.storage.local ||
        !chrome.storage.local.getBytesInUse
      ) {
        resolve(false);
        return;
      }
      chrome.storage.local.getBytesInUse(key, bytes => resolve(bytes > 0));
    } catch (e) {
      resolve(false);
    }
  });
}

async function loadAllMeals() {
  const map = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    const { key, path } = MEAL_TYPES[type];
    let arr = await loadArray(key);
    const hasStored = await hasStoredValue(key);
    if ((!arr || arr.length === 0) && !hasStored) {
      try {
        const fallback = await loadJSON(path);
        arr = Array.isArray(fallback) ? fallback : [];
      } catch (e) {
        arr = Array.isArray(arr) ? arr : [];
      }
    }
    if (!Array.isArray(arr)) arr = [];
    arr.forEach(m => {
      if (m.prepared === undefined) m.prepared = false;
      if (m.prepAhead === undefined) m.prepAhead = false;
      map[m.id || m.name] = m;
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

function buildData(cal, users, mealMap, start, days, prepDay) {
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
    const counts = {};
    const ahead = {};
    users.forEach(u => {
      const rec = cal[u]?.[dStr] || {};
      Object.values(rec).forEach(val => {
        const meals = Array.isArray(val) ? val : [val];
        meals.forEach(id => {
          const meal = mealMap[id];
          if (meal?.prepared) counts[id] = (counts[id] || 0) + 1;
          if (meal?.prepAhead) ahead[id] = (ahead[id] || 0) + 1;
        });
      });
    });
    rows.push({ date: dStr, dayName, counts, ahead });
    date.setDate(date.getDate() + 1);
  }

  // compute prep ahead lists for prep days
  for (let i = 0; i < rows.length; i++) {
    if (prepDay && rows[i].dayName === prepDay) {
      const next = rows.slice(i + 1).findIndex(r => r.dayName === prepDay);
      const end = next === -1 ? rows.length : i + 1 + next;
      const totals = {};
      for (let j = i + 1; j < end; j++) {
        Object.entries(rows[j].ahead).forEach(([id, c]) => {
          totals[id] = (totals[id] || 0) + c;
        });
      }
      rows[i].prepList = totals;
    }
  }

  return rows.slice(0, days);
}

function renderRows(data, mealMap) {
  const tbody = document.getElementById('cookBody');
  tbody.innerHTML = '';
  data.forEach(({ date, counts, prepList }) => {
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
    const prepTd = document.createElement('td');
    if (prepList) {
      Object.entries(prepList).forEach(([id, cnt]) => {
        const div = document.createElement('div');
        const name = mealMap[id]?.name || id;
        div.textContent = `${name} (${cnt})`;
        prepTd.appendChild(div);
      });
    }
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
  const mealMap = await loadAllMeals();
  const cookingDays = await loadCookingDays();
  const prepDay = Array.isArray(cookingDays.prepDay) ? cookingDays.prepDay[0] : null;
  const { start, days } = getParams();
  document.getElementById('startDate').value = start || new Date().toISOString().split('T')[0];
  document.getElementById('numDays').value = days;

  function update() {
    const startVal = document.getElementById('startDate').value;
    const daysVal = parseInt(document.getElementById('numDays').value, 10) || 7;
    const data = buildData(calendar, users, mealMap, startVal, daysVal, prepDay);
    renderRows(data, mealMap);
  }

  document.getElementById('showBtn').addEventListener('click', update);
  document.getElementById('eatViewBtn').addEventListener('click', openEatView);

  update();
}

document.addEventListener('DOMContentLoaded', init);
