import {
  MEAL_TYPES,
  initializeMealCategories,
  loadMealsPerDay
} from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';
import { loadJSON } from './utils/dataLoader.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

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

function loadColumnOrder() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('calendarColumnOrder', data => {
        resolve(data.calendarColumnOrder || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

function saveColumnOrder(order) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ calendarColumnOrder: order }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

let calendar = {};
let users = [];
let slotOrder = [];
let slotOrderIds = [];
let columnOrder = {};
let editMode = false;
const mealMap = {};

function loadFinalProduct(item) {
  return new Promise(resolve => {
    const key = `final_product_${encodeURIComponent(item)}`;
    chrome.storage.local.get([key], data => resolve(data[key] || null));
  });
}

async function getMealImage(meal) {
  if (meal.image) return meal.image;
  const first = meal.ingredients?.[0]?.name;
  if (!first) return null;
  const prod = await loadFinalProduct(first);
  return prod && prod.image ? prod.image : null;
}

function setMealImage(imgEl, meal) {
  getMealImage(meal).then(src => {
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
  });
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
        });
      }
      resolve(arr || []);
    });
  });
}

async function loadAllMeals() {
  const types = Object.keys(MEAL_TYPES);
  for (const type of types) {
    const meals = await loadMeals(type);
    meals.forEach(m => {
      const id = m.id || m.name;
      mealMap[id] = m;
    });
  }
}

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

function buildSlotIds(order) {
  const counts = {};
  return order.map(cat => {
    counts[cat] = (counts[cat] || 0) + 1;
    return `${cat}#${counts[cat]}`;
  });
}

function applySavedOrder(ids, saved) {
  if (!Array.isArray(saved)) return ids.slice();
  const remaining = ids.slice();
  const result = [];
  saved.forEach(id => {
    const idx = remaining.indexOf(id);
    if (idx !== -1) {
      result.push(remaining.splice(idx, 1)[0]);
    }
  });
  result.push(...remaining);
  return result;
}

function moveColumn(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= slotOrderIds.length) return;
  const [item] = slotOrderIds.splice(idx, 1);
  slotOrderIds.splice(newIdx, 0, item);
  slotOrder = slotOrderIds.map(id => id.split('#')[0]);
  buildHeader(true);
  render();
}

function buildHeader(editing = false) {
  const head = document.getElementById('tableHead');
  head.innerHTML = '';
  if (editing) {
    const arrowRow = document.createElement('tr');
    const blank = document.createElement('th');
    arrowRow.appendChild(blank);
    slotOrder.forEach((_, idx) => {
      const th = document.createElement('th');
      const left = document.createElement('button');
      left.textContent = '\u2190';
      left.addEventListener('click', () => moveColumn(idx, -1));
      const right = document.createElement('button');
      right.textContent = '\u2192';
      right.addEventListener('click', () => moveColumn(idx, 1));
      th.appendChild(left);
      th.appendChild(document.createTextNode(' '));
      th.appendChild(right);
      arrowRow.appendChild(th);
    });
    head.appendChild(arrowRow);
  }
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
      if (val) {
        const meal = mealMap[val];
        const name = meal ? meal.name || val : val;
        const nameDiv = document.createElement('div');
        nameDiv.textContent = name;
        td.appendChild(nameDiv);
        if (meal) {
          const img = document.createElement('img');
          img.className = 'meal-img';
          setMealImage(img, meal);
          td.appendChild(img);
        }
      }
      row.appendChild(td);
    });
    body.appendChild(row);
    date.setDate(date.getDate() + 1);
  }
}

function applySavedOrderForUser(user) {
  slotOrderIds = buildSlotIds(slotOrder);
  slotOrderIds = applySavedOrder(slotOrderIds, columnOrder[user]);
  slotOrder = slotOrderIds.map(id => id.split('#')[0]);
}

function startReorder() {
  if (editMode) return;
  editMode = true;
  document.getElementById('saveOrderBtn').classList.remove('hidden');
  buildHeader(true);
}

async function saveOrder() {
  const user = document.getElementById('userSelect').value;
  columnOrder[user] = slotOrderIds.slice();
  await saveColumnOrder(columnOrder);
  editMode = false;
  document.getElementById('saveOrderBtn').classList.add('hidden');
  buildHeader(false);
}

function openCookView() {
  const params = new URLSearchParams();
  const start = document.getElementById('startDate').value;
  const days = document.getElementById('numDays').value;
  if (start) params.set('start', start);
  if (days) params.set('days', days);
  const url = 'whatToCookWhen.html' + (params.toString() ? '?' + params.toString() : '');
  if (chrome.runtime?.getURL) {
    openOrFocusWindow(url);
  } else {
    location.href = url;
  }
}

async function recalcCalendar() {
  await calculateAndSaveMealNeeds();
}

async function init() {
  await initializeMealCategories();
  const mealsPerDay = await loadMealsPerDay();
  users = await loadUsers();
  calendar = await loadCalendar();
  if (!Object.keys(calendar).length) {
    await calculateAndSaveMealNeeds();
    calendar = await loadCalendar();
  }
  columnOrder = await loadColumnOrder();
  await loadAllMeals();

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
  applySavedOrderForUser(userSelect.value);
  buildHeader();
  document.getElementById('showBtn').addEventListener('click', render);
  document.getElementById('cookViewBtn').addEventListener('click', openCookView);
  document.getElementById('recalcBtn').addEventListener('click', recalcCalendar);
  document.getElementById('reorderBtn').addEventListener('click', startReorder);
  document.getElementById('saveOrderBtn').addEventListener('click', saveOrder);
  userSelect.addEventListener('change', () => {
    applySavedOrderForUser(userSelect.value);
    buildHeader(editMode);
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.whatToEatCalendar) {
      calendar = changes.whatToEatCalendar.newValue || {};
      render();
    }
  });
  render();
}

document.addEventListener('DOMContentLoaded', init);
