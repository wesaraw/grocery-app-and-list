import { MEAL_TYPES, initializeMealCategories, loadCookingDays } from './utils/mealData.js';
import { loadUsers, loadUserPortionMultipliers } from './utils/userData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { parseQuantity, expandCalendarValue } from './utils/calendarUtils.js';

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
            if (m.leftoverOk === undefined) m.leftoverOk = false;
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
  entries.forEach(entry => {
    let mealId = null;
    let totalMultiplier = null;
    let leftoverDates = [];
    if (Array.isArray(entry)) {
      mealId = entry[0];
      totalMultiplier = entry[1];
    } else if (entry && typeof entry === 'object') {
      mealId = entry.id || entry.mealId || entry.name || null;
      if (entry.total != null) totalMultiplier = entry.total;
      if (Array.isArray(entry.leftoverDates)) {
        leftoverDates = entry.leftoverDates.filter(Boolean);
      }
    } else if (entry) {
      mealId = entry;
    }
    if (!mealId) return;
    const meal = mealMap[mealId];
    const block = document.createElement('div');
    block.className = 'meal-block';
    const title = document.createElement('div');
    title.className = 'meal-title';
    const name = meal?.name || mealId;
    const portionText = formatPortions(totalMultiplier);
    title.textContent = portionText ? `${name} (${portionText})` : name;
    block.appendChild(title);

    if (leftoverDates.length) {
      const detail = document.createElement('div');
      detail.className = 'leftover-detail';
      detail.textContent = `Includes leftovers for ${leftoverDates.join(', ')}`;
      block.appendChild(detail);
    }

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

function normalizePrepDays(prepDays) {
  if (!Array.isArray(prepDays)) return [];
  const seen = new Set();
  const result = [];
  prepDays.forEach(day => {
    if (typeof day === 'string') {
      const trimmed = day.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  });
  return result;
}

function buildData(calendar, userEntries, mealMap, start, days, prepDays) {
  const normalizedPrepDays = normalizePrepDays(prepDays);
  const prepSet = new Set(normalizedPrepDays);
  const date = start ? new Date(start) : new Date();

  let calcDays = days;
  if (prepSet.size) {
    const last = new Date(date);
    last.setDate(last.getDate() + days - 1);
    while (true) {
      last.setDate(last.getDate() + 1);
      calcDays++;
      const dayName = last.toLocaleDateString('en-US', { weekday: 'long' });
      if (prepSet.has(dayName)) break;
    }
  }

  const rows = [];
  for (let i = 0; i < calcDays; i++) {
    const dStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const counts = new Map();
    const ahead = new Map();
    function addCookTotal(id, amount, leftovers, prepared) {
      if (!id || !amount) return;
      let record = counts.get(id);
      if (!record) {
        record = { total: 0, leftoverDates: new Set(), prepared: !!prepared };
        counts.set(id, record);
      }
      record.total += amount;
      if (prepared) record.prepared = true;
      if (Array.isArray(leftovers)) {
        leftovers.forEach(target => {
          if (target?.date) {
            record.leftoverDates.add(target.date);
          }
        });
      }
    }
    userEntries.forEach(userEntry => {
      const rec = getDayRecord(calendar, userEntry, dStr) || {};
      Object.values(rec).forEach(val => {
        const entries = expandCalendarValue(val);
        entries.forEach(calEntry => {
          if (!calEntry) return;
          const meal = mealMap[calEntry.mealId];
          if (!meal) return;
          if (calEntry.type === 'cook') {
            const leftoverCount = Array.isArray(calEntry.leftoverTargets)
              ? calEntry.leftoverTargets.length
              : 0;
            const totalMultiplier = userEntry.multiplier * (1 + leftoverCount);
            if (totalMultiplier) {
              addCookTotal(
                calEntry.mealId,
                totalMultiplier,
                calEntry.leftoverTargets,
                meal.prepared
              );
            }
            if (meal.prepAhead) {
              increment(ahead, calEntry.mealId, userEntry.multiplier);
            }
          }
        });
      });
    });
    rows.push({ date: dStr, dayName, counts, ahead });
    date.setDate(date.getDate() + 1);
  }

  if (prepSet.size) {
    for (let i = 0; i < rows.length; i++) {
      if (!prepSet.has(rows[i].dayName)) continue;
      const totals = new Map();
      for (let j = i + 1; j < rows.length; j++) {
        if (prepSet.has(rows[j].dayName)) break;
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
    meals: Array.from(row.counts.entries()).map(([id, info]) => ({
      id,
      total: info.total,
      leftoverDates: Array.from(info.leftoverDates).sort()
    })),
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
  const prepDays = normalizePrepDays(cookingDays.prepDay);
  const { start, days } = getParams();
  document.getElementById('startDate').value = start || new Date().toISOString().split('T')[0];
  document.getElementById('numDays').value = days;

  function update() {
    const startVal = document.getElementById('startDate').value;
    const daysVal = parseInt(document.getElementById('numDays').value, 10) || 7;
    const data = buildData(calendar, userEntries, mealMap, startVal, daysVal, prepDays);
    renderRows(data, mealMap);
  }

  document.getElementById('showBtn').addEventListener('click', update);
  document.getElementById('eatViewBtn').addEventListener('click', openEatView);

  update();
}

document.addEventListener('DOMContentLoaded', init);
