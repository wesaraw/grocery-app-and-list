import {
  MEAL_TYPES,
  initializeMealCategories,
  loadMealsPerDay
} from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';

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

let calendar = {};
let users = [];
let slotOrder = [];

function buildSlotOrder(mealsPerDay) {
  const base = [
    'drinks',
    'breakfast',
    'snack',
    'drinks',
    'lunchDinner',
    'snack',
    'drinks',
    'lunchDinner',
    'snack',
    'drinks',
    'dessert',
    'drinks'
  ];

  let pattern = base.map((cat, i) => ({ index: i, cat }));
  const baseCounts = {};
  base.forEach(c => (baseCounts[c] = (baseCounts[c] || 0) + 1));

  const allCats = Object.keys(mealsPerDay);
  for (const cat of allCats) {
    let desired = Math.round(mealsPerDay[cat] || 0);
    let current = baseCounts[cat] || 0;
    let diff = desired - current;
    if (diff < 0) {
      let indices = pattern
        .filter(p => p.cat === cat)
        .map(p => p.index)
        .sort((a, b) => a - b);
      let removeStart = true;
      while (diff < 0 && indices.length) {
        const idx = removeStart ? indices.shift() : indices.pop();
        pattern = pattern.filter(p => p.index !== idx);
        removeStart = !removeStart;
        diff++;
      }
    } else if (diff > 0) {
      let left = Math.min(...pattern.map(p => p.index));
      let right = Math.max(...pattern.map(p => p.index));
      let addEnd = true;
      while (diff > 0) {
        if (addEnd) {
          right += 1;
          pattern.push({ index: right, cat });
        } else {
          left -= 1;
          pattern.push({ index: left, cat });
        }
        addEnd = !addEnd;
        diff--;
      }
    }
  }

  Object.keys(baseCounts).forEach(cat => {
    if (mealsPerDay[cat] === undefined) {
      pattern = pattern.filter(p => p.cat !== cat);
    }
  });

  pattern.sort((a, b) => a.index - b.index);
  return pattern.map(p => p.cat);
}

function buildHeader() {
  const head = document.getElementById('tableHead');
  head.innerHTML = '';
  const tr = document.createElement('tr');
  const dateTh = document.createElement('th');
  dateTh.textContent = 'Date';
  tr.appendChild(dateTh);
  const counts = {};
  slotOrder.forEach(cat => {
    const th = document.createElement('th');
    counts[cat] = (counts[cat] || 0) + 1;
    const label = MEAL_TYPES[cat]?.label || cat;
    th.textContent = counts[cat] > 1 ? `${label} ${counts[cat]}` : label;
    tr.appendChild(th);
  });
  head.appendChild(tr);
}

function render() {
  const user = document.getElementById('userSelect').value;
  const startStr = document.getElementById('startDate').value;
  let date = startStr ? new Date(startStr) : new Date();
  const days = parseInt(document.getElementById('numDays').value, 10) || 7;
  const body = document.getElementById('calendarBody');
  body.innerHTML = '';
  for (let i = 0; i < days; i++) {
    const dStr = date.toISOString().split('T')[0];
    const row = document.createElement('tr');
    const dateTd = document.createElement('td');
    dateTd.textContent = dStr;
    row.appendChild(dateTd);
    const rec = calendar[user]?.[dStr] || {};
    const used = {};
    slotOrder.forEach(cat => {
      const td = document.createElement('td');
      const idx = used[cat] || 0;
      let val = rec[cat];
      if (Array.isArray(val)) val = val[idx];
      else if (idx > 0) val = '';
      used[cat] = idx + 1;
      td.textContent = val || '';
      row.appendChild(td);
    });
    body.appendChild(row);
    date.setDate(date.getDate() + 1);
  }
}

async function init() {
  await initializeMealCategories();
  const mealsPerDay = await loadMealsPerDay();
  users = await loadUsers();
  calendar = await loadCalendar();

  slotOrder = buildSlotOrder(mealsPerDay);

  const userSelect = document.getElementById('userSelect');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    userSelect.appendChild(opt);
  });
  if (users.length) userSelect.value = users[0];
  document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
  buildHeader();
  document.getElementById('showBtn').addEventListener('click', render);
  render();
}

document.addEventListener('DOMContentLoaded', init);
