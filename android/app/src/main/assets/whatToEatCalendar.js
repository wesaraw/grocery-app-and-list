import {
  MEAL_TYPES,
  initializeMealCategories,
  loadMealsPerDay
} from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';
import { loadJSON } from './utils/dataLoader.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  loadArray as loadItemArray,
  convertArrayToNames
} from './utils/itemStorage.js';
import { normalizeCalendarEntry } from './utils/calendarUtils.js';
import { NUTRIENT_DEFINITIONS } from './utils/fdcNutrientMap.js';
import { loadNutritionTargetLookup } from './utils/nutritionTargets.js';

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
const DEFAULT_MAX_NUTRIENT_SCORE = 10;
const nutrientLabelMap = new Map(
  NUTRIENT_DEFINITIONS.map(def => [def.key, def.label || def.key])
);
let nutritionTargetLookup = {};
let nutrientGoalConfig = null;
const nutrientToggleState = {};

function buildNutrientGoalConfig(targetLookup = {}, options = {}) {
  if (!targetLookup || typeof targetLookup !== 'object') {
    return null;
  }
  const entries = Object.values(targetLookup).filter(entry => entry && entry.key);
  if (!entries.length) return null;
  const sortedByRank = entries
    .map((entry, index) => {
      const rankValue = Number(entry.importanceRank);
      return {
        ...entry,
        normalizedRank: Number.isFinite(rankValue) ? rankValue : index + 1
      };
    })
    .sort((a, b) => {
      if (a.normalizedRank !== b.normalizedRank) {
        return a.normalizedRank - b.normalizedRank;
      }
      return (a.key || '').localeCompare(b.key || '');
    });
  const uniqueEntries = [];
  const seenKeys = new Set();
  sortedByRank.forEach(entry => {
    if (!entry.key || seenKeys.has(entry.key)) return;
    seenKeys.add(entry.key);
    uniqueEntries.push(entry);
  });
  const total = uniqueEntries.length;
  if (!total) return null;
  const maxPoints = Number.isFinite(options?.maxPointsPerNutrient)
    ? Math.max(1, Number(options.maxPointsPerNutrient))
    : DEFAULT_MAX_NUTRIENT_SCORE;
  const goalsByKey = {};
  const orderedKeys = [];
  uniqueEntries.forEach((entry, index) => {
    const key = entry.key;
    if (!key) return;
    const resolvedRank = Number(entry.normalizedRank);
    const clampedRank = Number.isFinite(resolvedRank)
      ? Math.max(1, Math.min(total, Math.round(resolvedRank)))
      : index + 1;
    const multiplier = Math.max(1, total - clampedRank + 1);
    const goalPoints = multiplier * maxPoints;
    goalsByKey[key] = {
      key,
      label: entry.label || nutrientLabelMap.get(key) || key,
      multiplier,
      goalPoints
    };
    orderedKeys.push(key);
  });
  return {
    goalsByKey,
    orderedKeys,
    totalNutrients: total,
    maxPointsPerNutrient: maxPoints
  };
}

function getNutrientToggleSet(user) {
  if (!nutrientToggleState[user]) {
    nutrientToggleState[user] = new Set();
  }
  return nutrientToggleState[user];
}

function isDaySummaryExpanded(user, dateStr) {
  const set = nutrientToggleState[user];
  if (!set) return false;
  return set.has(dateStr);
}

function setDaySummaryExpanded(user, dateStr, expanded) {
  const set = getNutrientToggleSet(user);
  if (expanded) {
    set.add(dateStr);
  } else {
    set.delete(dateStr);
  }
}

function getNutrientLabel(key) {
  if (!key) return '';
  if (nutrientGoalConfig?.goalsByKey?.[key]?.label) {
    return nutrientGoalConfig.goalsByKey[key].label;
  }
  if (nutritionTargetLookup?.[key]?.label) {
    return nutritionTargetLookup[key].label;
  }
  return nutrientLabelMap.get(key) || key;
}

function extractTotalFromScore(score) {
  if (!score || typeof score !== 'object') return null;
  const total = Number(
    score.total != null ? score.total : score.totalPoints != null ? score.totalPoints : null
  );
  if (!Number.isFinite(total)) return null;
  return total;
}

function computeMealNutrientPoints(meal, daySummary) {
  if (!meal) return null;
  const perServing = meal?.nutritionTotals?.nutrientScores?.perServing;
  if (!perServing || typeof perServing !== 'object') return null;
  const orderedKeys =
    (Array.isArray(daySummary?.orderedKeys) && daySummary.orderedKeys.length
      ? daySummary.orderedKeys
      : nutrientGoalConfig?.orderedKeys) || [];
  if (!orderedKeys.length) return null;
  const maxPoints =
    Number(daySummary?.maxPointsPerNutrient) > 0
      ? Number(daySummary.maxPointsPerNutrient)
      : nutrientGoalConfig?.maxPointsPerNutrient || DEFAULT_MAX_NUTRIENT_SCORE;
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) return null;
  let total = 0;
  orderedKeys.forEach(key => {
    const perScore = Number(perServing[key]);
    if (!Number.isFinite(perScore) || perScore <= 0) return;
    let goalPoints = null;
    if (daySummary?.perNutrient?.[key]) {
      const goal = Number(daySummary.perNutrient[key].goal);
      if (Number.isFinite(goal) && goal > 0) {
        goalPoints = goal;
      }
    }
    if (goalPoints == null && nutrientGoalConfig?.goalsByKey?.[key]) {
      const fallbackGoal = Number(nutrientGoalConfig.goalsByKey[key].goalPoints);
      if (Number.isFinite(fallbackGoal) && fallbackGoal > 0) {
        goalPoints = fallbackGoal;
      }
    }
    if (!Number.isFinite(goalPoints) || goalPoints <= 0) return;
    const multiplier = goalPoints / maxPoints;
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    total += perScore * multiplier;
  });
  return total;
}

function getEntryNutrientPoints(entry, meal, daySummary) {
  const fromEntry = extractTotalFromScore(entry?.nutrientScore);
  if (fromEntry != null) {
    return fromEntry;
  }
  return computeMealNutrientPoints(meal, daySummary);
}

function formatPoints(value) {
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return Math.round(value).toLocaleString();
  }
  if (abs >= 100) {
    return Math.round(value).toString();
  }
  if (abs >= 10) {
    return value.toFixed(0);
  }
  return value.toFixed(1).replace(/\.0$/, '');
}

function buildNutrientBreakdownElement(summary) {
  const container = document.createElement('div');
  container.className = 'nutrient-breakdown';
  const keys = Array.isArray(summary?.orderedKeys) ? summary.orderedKeys : [];
  keys.forEach(key => {
    const info = summary?.perNutrient?.[key];
    if (!info) return;
    const line = document.createElement('div');
    line.className = 'nutrient-line';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'nutrient-label';
    labelSpan.textContent = getNutrientLabel(key);
    const valueSpan = document.createElement('span');
    valueSpan.className = 'nutrient-value';
    const achievedText = formatPoints(Number(info.achieved));
    const goalText = formatPoints(Number(info.goal));
    const valueLabel = [achievedText, goalText]
      .filter(text => text != null)
      .join(' / ');
    valueSpan.textContent = valueLabel ? `${valueLabel} pts` : '—';
    line.appendChild(labelSpan);
    line.appendChild(document.createTextNode(': '));
    line.appendChild(valueSpan);
    container.appendChild(line);
  });
  if (!container.childElementCount) {
    const empty = document.createElement('div');
    empty.textContent = 'No nutrient summary available.';
    container.appendChild(empty);
  }
  return container;
}

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

async function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  let arr = await loadItemArray(key);

  if (!Array.isArray(arr) || arr.length === 0) {
    let fallback = await loadJSON(path);
    if (!Array.isArray(fallback)) {
      fallback = [];
    }
    arr = await convertArrayToNames(fallback);
  }

  if (Array.isArray(arr)) {
    arr.forEach(m => {
      if (m.prepared === undefined) m.prepared = false;
      if (m.leftoverOk === undefined) m.leftoverOk = false;
      if (m.recipeBook === undefined) m.recipeBook = '';
      if (typeof m.instructions !== 'string') {
        m.instructions = '';
      } else {
        m.instructions = m.instructions.trim();
      }
    });
  }

  return arr || [];
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
    const rec = calendar[user]?.[dStr] || {};
    const daySummary = rec._nutrientSummary || null;
    const summaryAvailable = Boolean(
      Array.isArray(daySummary?.orderedKeys) && daySummary.orderedKeys.length
    );
    if (summaryAvailable) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'nutrient-toggle';
      toggleBtn.textContent = isDaySummaryExpanded(user, dStr)
        ? 'Hide Nutrients'
        : 'Show Nutrients';
      toggleBtn.addEventListener('click', () => {
        const expandedNow = isDaySummaryExpanded(user, dStr);
        setDaySummaryExpanded(user, dStr, !expandedNow);
        render();
      });
      dateTd.appendChild(document.createElement('br'));
      dateTd.appendChild(toggleBtn);
    }
    row.appendChild(dateTd);
    const used = {};
    slotOrder.forEach(cat => {
      const td = document.createElement('td');
      const idx = used[cat] || 0;
      const rawVal = rec[cat];
      let slotVal = null;
      if (Array.isArray(rawVal)) {
        slotVal = rawVal[idx];
      } else if (idx === 0) {
        slotVal = rawVal;
      }
      used[cat] = idx + 1;
      const entry = normalizeCalendarEntry(slotVal);
      if (entry) {
        const meal = mealMap[entry.mealId];
        const name = meal ? meal.name || entry.mealId : entry.mealId;
        const cost = meal && meal.totalCost != null ? ` - $${meal.totalCost.toFixed(2)}` : '';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'meal-label';
        let label = name + cost;
        if (entry.type === 'leftover') {
          const srcDate = entry.leftoverSource?.date;
          const leftoverNote = srcDate ? `Leftover from ${srcDate}` : 'Leftover';
          label += ` (${leftoverNote})`;
          td.classList.add('leftover-slot');
        } else if (Array.isArray(entry.leftoverTargets) && entry.leftoverTargets.length) {
          const dateSet = new Set();
          entry.leftoverTargets.forEach(target => {
            if (target?.date) dateSet.add(target.date);
          });
          if (dateSet.size) {
            label += ` (Cook extra for ${Array.from(dateSet).join(', ')})`;
          }
          td.classList.add('cook-with-leftover');
        }
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        nameDiv.appendChild(labelSpan);
        const pointsTotal = getEntryNutrientPoints(entry, meal, daySummary);
        const formattedPoints = formatPoints(pointsTotal);
        if (formattedPoints != null) {
          const badge = document.createElement('span');
          badge.className = 'nutrient-points';
          badge.textContent = `${formattedPoints} pts`;
          nameDiv.appendChild(badge);
        }
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
    if (summaryAvailable) {
      const breakdownRow = document.createElement('tr');
      breakdownRow.className = 'nutrient-breakdown-row';
      if (!isDaySummaryExpanded(user, dStr)) {
        breakdownRow.classList.add('hidden');
      }
      const breakdownCell = document.createElement('td');
      breakdownCell.colSpan = slotOrder.length + 1;
      breakdownCell.appendChild(buildNutrientBreakdownElement(daySummary));
      breakdownRow.appendChild(breakdownCell);
      body.appendChild(breakdownRow);
    }
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

async function init() {
  await initializeMealCategories();
  const mealsPerDay = await loadMealsPerDay();
  users = await loadUsers();
  calendar = await loadCalendar();
  columnOrder = await loadColumnOrder();
  await loadAllMeals();
  nutritionTargetLookup =
    (await loadNutritionTargetLookup(NUTRIENT_DEFINITIONS).catch(() => ({}))) || {};
  nutrientGoalConfig = buildNutrientGoalConfig(nutritionTargetLookup);

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
  document.getElementById('reorderBtn').addEventListener('click', startReorder);
  document.getElementById('saveOrderBtn').addEventListener('click', saveOrder);
  userSelect.addEventListener('change', () => {
    applySavedOrderForUser(userSelect.value);
    buildHeader(editMode);
    render();
  });
  render();
}

document.addEventListener('DOMContentLoaded', init);
