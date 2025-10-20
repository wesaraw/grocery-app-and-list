import { MEAL_TYPES, initializeMealCategories, loadCookingDays } from './utils/mealData.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
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
    let meals = await loadItemArray(key);
    if (!Array.isArray(meals) || meals.length === 0) {
      const resp = await fetch(path).catch(() => null);
      const fallback = resp ? await resp.json().catch(() => []) : [];
      meals = await convertArrayToNames(Array.isArray(fallback) ? fallback : []);
    }
    if (!Array.isArray(meals)) continue;
    meals.forEach(meal => {
      if (meal.prepared === undefined) meal.prepared = false;
      if (meal.prepAhead === undefined) meal.prepAhead = false;
      if (meal.leftoverOk === undefined) meal.leftoverOk = false;
      if (Array.isArray(meal.ingredients)) {
        meal.ingredients.forEach(ing => {
          if (!ing || typeof ing !== 'object') return;
          ing.prepAhead = !!ing.prepAhead;
        });
      }
      if (!meal.categoryId) meal.categoryId = type;
      if (!meal.categoryLabel) {
        const category = MEAL_TYPES[type];
        const label = category?.label || meal.category || meal.categoryId || type;
        meal.categoryLabel = label;
      }
      map[meal.id || meal.name] = meal;
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

function parseLocalDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
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
    let prepItems = null;
    let wholeMeal = false;
    let targetLabels = [];
    if (Array.isArray(entry)) {
      mealId = entry[0];
      totalMultiplier = entry[1];
    } else if (entry && typeof entry === 'object') {
      mealId = entry.id || entry.mealId || entry.name || null;
      if (entry.total != null) totalMultiplier = entry.total;
      if (Array.isArray(entry.leftoverDates)) {
        leftoverDates = entry.leftoverDates.filter(Boolean);
      }
      if (Array.isArray(entry.items)) {
        prepItems = entry.items;
      }
      if (entry.wholeMeal) {
        wholeMeal = true;
      }
      if (Array.isArray(entry.targets)) {
        const labels = [];
        entry.targets.forEach(target => {
          if (!target) return;
          const label = target.dayName || target.date;
          if (!label) return;
          if (!labels.includes(label)) {
            labels.push(label);
          }
        });
        if (labels.length) {
          targetLabels = labels;
        }
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
    const categoryLabel =
      meal?.categoryLabel ||
      (meal?.categoryId && (MEAL_TYPES[meal.categoryId]?.label || meal.categoryId));
    const displayName = categoryLabel ? `${categoryLabel}: ${name}` : name;
    const portionText = formatPortions(totalMultiplier);
    const targetText = targetLabels.length ? ` for ${targetLabels.join(', ')}` : '';
    title.textContent = portionText
      ? `${displayName} (${portionText})${targetText}`
      : `${displayName}${targetText}`;
    block.appendChild(title);

    if (leftoverDates.length) {
      const detail = document.createElement('div');
      detail.className = 'leftover-detail';
      detail.textContent = `Includes leftovers for ${leftoverDates.join(', ')}`;
      block.appendChild(detail);
    }

    const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
    const hasPartialPrep = !wholeMeal && Array.isArray(prepItems) && prepItems.length;
    if (ingredients.length) {
      const list = document.createElement('ul');
      list.className = 'ingredient-list';
      if (hasPartialPrep) {
        const aggregated = new Map();
        prepItems.forEach(item => {
          const idx = typeof item.index === 'number' ? item.index : parseInt(item.index, 10);
          if (!Number.isFinite(idx)) return;
          if (idx < 0 || idx >= ingredients.length) return;
          const amt = Number(item.total);
          if (!Number.isFinite(amt) || amt <= 0) return;
          aggregated.set(idx, (aggregated.get(idx) || 0) + amt);
        });
        const sorted = Array.from(aggregated.entries()).sort((a, b) => a[0] - b[0]);
        sorted.forEach(([idx, amt]) => {
          const ing = ingredients[idx];
          const li = document.createElement('li');
          const ingName = ing?.name?.trim() || 'Unnamed ingredient';
          const amountText = formatIngredientAmount(ing, amt);
          li.textContent = amountText ? `${ingName}: ${amountText}` : ingName;
          list.appendChild(li);
        });
        if (!sorted.length) {
          ingredients.forEach(ing => {
            const li = document.createElement('li');
            const ingName = ing?.name?.trim() || 'Unnamed ingredient';
            li.textContent = ingName;
            list.appendChild(li);
          });
        }
      } else {
        ingredients.forEach(ing => {
          const li = document.createElement('li');
          const ingName = ing?.name?.trim() || 'Unnamed ingredient';
          const amountText = formatIngredientAmount(ing, totalMultiplier);
          li.textContent = amountText ? `${ingName}: ${amountText}` : ingName;
          list.appendChild(li);
        });
      }
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
  const startDate = start ? parseLocalDate(start) : null;
  const date = startDate ? new Date(startDate) : new Date();

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

  function addPrepRecord(map, mealId, amount, options = {}) {
    if (!mealId || !amount) return;
    let record = map.get(mealId);
    if (!record) {
      record = { mealId, total: 0, wholeMeal: false, itemTotals: null, targets: [] };
      map.set(mealId, record);
    }
    record.total += amount;

    const targetList = [];
    if (options.target && typeof options.target === 'object') {
      targetList.push(options.target);
    }
    if (Array.isArray(options.targets)) {
      targetList.push(...options.targets);
    }
    if (targetList.length) {
      if (!Array.isArray(record.targets)) record.targets = [];
      targetList.forEach(target => {
        if (!target || typeof target !== 'object') return;
        const rawDate = target.date != null ? String(target.date) : null;
        const rawDayName = target.dayName != null ? String(target.dayName) : null;
        const date = rawDate ? rawDate.trim() || null : null;
        const dayName = rawDayName ? rawDayName.trim() || null : null;
        if (!date && !dayName) return;
        const exists = record.targets.some(
          existing => existing.date === date && existing.dayName === dayName
        );
        if (!exists) {
          record.targets.push({ date, dayName });
        }
      });
    }

    if (options.wholeMeal) {
      record.wholeMeal = true;
      record.itemTotals = null;
      return;
    }
    if (record.wholeMeal) return;
    const items = Array.isArray(options.items) ? options.items : [];
    if (!items.length) return;
    if (!record.itemTotals) record.itemTotals = {};
    items.forEach(idx => {
      if (idx === null || idx === undefined) return;
      const key = String(idx);
      record.itemTotals[key] = (record.itemTotals[key] || 0) + amount;
    });
  }

  function clonePrepRecord(record) {
    return {
      mealId: record.mealId,
      total: record.total,
      wholeMeal: record.wholeMeal,
      itemTotals: record.itemTotals ? { ...record.itemTotals } : null,
      targets: Array.isArray(record.targets)
        ? record.targets.map(target => ({ ...target }))
        : []
    };
  }

  function mergePrepRecords(target, source) {
    target.total += source.total;
    if (!Array.isArray(target.targets)) target.targets = [];
    if (Array.isArray(source.targets)) {
      source.targets.forEach(targetInfo => {
        if (!targetInfo) return;
        const rawDate = targetInfo.date != null ? String(targetInfo.date) : null;
        const rawDayName = targetInfo.dayName != null ? String(targetInfo.dayName) : null;
        const date = rawDate ? rawDate.trim() || null : null;
        const dayName = rawDayName ? rawDayName.trim() || null : null;
        if (!date && !dayName) return;
        const exists = target.targets.some(
          existing => existing.date === date && existing.dayName === dayName
        );
        if (!exists) {
          target.targets.push({ date, dayName });
        }
      });
    }
    if (source.wholeMeal) {
      target.wholeMeal = true;
      target.itemTotals = null;
      return;
    }
    if (target.wholeMeal) return;
    if (!source.itemTotals) return;
    if (!target.itemTotals) target.itemTotals = {};
    Object.keys(source.itemTotals).forEach(key => {
      target.itemTotals[key] = (target.itemTotals[key] || 0) + source.itemTotals[key];
    });
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
              addPrepRecord(ahead, calEntry.mealId, userEntry.multiplier, {
                wholeMeal: true,
                targets: [{ date: dStr, dayName }]
              });
            } else if (Array.isArray(meal.ingredients)) {
              const indices = [];
              meal.ingredients.forEach((ing, idx) => {
                if (ing && ing.prepAhead) {
                  indices.push(idx);
                }
              });
              if (indices.length) {
                addPrepRecord(ahead, calEntry.mealId, userEntry.multiplier, {
                  items: indices,
                  targets: [{ date: dStr, dayName }]
                });
              }
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
        rows[j].ahead.forEach((record, mealId) => {
          if (!mealId || !record) return;
          const existing = totals.get(mealId);
          if (existing) {
            mergePrepRecords(existing, record);
          } else {
            totals.set(mealId, clonePrepRecord(record));
          }
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
    prepList: row.prepList
      ? Array.from(row.prepList.values()).map(record => {
          const result = {
            mealId: record.mealId,
            total: record.total
          };
          if (Array.isArray(record.targets) && record.targets.length) {
            result.targets = record.targets.map(target => ({ ...target }));
          }
          if (record.itemTotals) {
            result.items = Object.entries(record.itemTotals).map(([idx, total]) => {
              const parsedIndex = Number(idx);
              return {
                index: Number.isNaN(parsedIndex) ? idx : parsedIndex,
                total
              };
            });
          }
          if (record.wholeMeal) {
            result.wholeMeal = true;
          }
          return result;
        })
      : []
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
