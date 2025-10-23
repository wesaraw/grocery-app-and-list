import {
  MEAL_TYPES,
  initializeMealCategories,
  loadCookingDays,
  loadWhatToCookVisibility
} from './utils/mealData.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { loadUsers, loadUserPortionMultipliers } from './utils/userData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { parseQuantity, expandCalendarValue } from './utils/calendarUtils.js';
import { canonicalName } from './utils/nameUtils.js';
import { loadDensityMap, computeNormalizedQuantity } from './utils/unitNormalize.js';
import { formatQuantity } from './utils/quantityFormat.js';

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

export async function loadAllMeals() {
  const map = {};
  let visibility = {};
  try {
    visibility = await loadWhatToCookVisibility();
  } catch (err) {
    console.error('Failed to load What To Cook visibility map', err);
    visibility = {};
  }
  for (const type of Object.keys(MEAL_TYPES)) {
    if (visibility?.[type] === false) continue;
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

function buildUserDescriptor(userInfo) {
  if (!userInfo) return null;
  let id = null;
  if (userInfo.id !== undefined && userInfo.id !== null) {
    id = String(userInfo.id);
  } else if (
    typeof userInfo.displayName === 'string' &&
    userInfo.displayName.trim()
  ) {
    id = userInfo.displayName.trim();
  } else if (Array.isArray(userInfo.keys) && userInfo.keys.length) {
    id = String(userInfo.keys[0]);
  }
  if (!id) return null;
  const name =
    typeof userInfo.displayName === 'string' && userInfo.displayName.trim()
      ? userInfo.displayName.trim()
      : id;
  const descriptor = { id, name };
  if (Number.isFinite(userInfo.order)) {
    descriptor.order = userInfo.order;
  }
  return descriptor;
}

function incrementUserTotals(container, descriptor, amount) {
  const numeric = Number(amount);
  if (!container || !descriptor || !Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  const key = descriptor.id;
  if (!key) return;
  const order = Number.isFinite(descriptor.order)
    ? descriptor.order
    : Number.POSITIVE_INFINITY;
  const name =
    typeof descriptor.name === 'string' && descriptor.name.trim()
      ? descriptor.name.trim()
      : key;
  if (!container[key]) {
    container[key] = { id: key, name, total: 0, order };
  }
  container[key].total += numeric;
  if (Number.isFinite(order)) {
    container[key].order = Math.min(container[key].order, order);
  }
}

function cloneUserTotals(source) {
  if (!source) return null;
  const clone = {};
  Object.entries(source).forEach(([key, value]) => {
    if (!value) return;
    clone[key] = {
      id: value.id,
      name: value.name,
      total: value.total,
      order: value.order
    };
  });
  return clone;
}

function mergeUserTotals(target, source) {
  if (!source) return target || null;
  let result = target || {};
  Object.values(source).forEach(value => {
    if (!value) return;
    incrementUserTotals(result, value, value.total);
  });
  return result;
}

function serializeUserTotals(source) {
  if (!source) return [];
  return Object.values(source)
    .filter(value => Number.isFinite(value?.total) && value.total > 0)
    .map(value => ({
      id: value.id,
      name: value.name,
      total: value.total,
      order: value.order
    }))
    .sort((a, b) => {
      const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
      const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
}

function cloneItemUsers(source) {
  if (!source) return null;
  const clone = {};
  Object.entries(source).forEach(([key, value]) => {
    const nested = cloneUserTotals(value);
    if (nested) {
      clone[key] = nested;
    }
  });
  return clone;
}

function mergeItemUsers(target, source) {
  if (!source) return target || null;
  let result = target || {};
  Object.entries(source).forEach(([key, value]) => {
    result[key] = mergeUserTotals(result[key], value);
  });
  return result;
}

function buildUserEntries(users = [], multipliers = [], calendar = {}) {
  const entries = [];
  const seen = new Set();
  users.forEach((name, idx) => {
    const keys = [];
    if (name !== undefined && name !== null) {
      const rawName = String(name);
      if (rawName) {
        pushUnique(keys, rawName);
        seen.add(rawName);
      }
      const trimmed = rawName.trim();
      if (trimmed && trimmed !== rawName) {
        pushUnique(keys, trimmed);
        seen.add(trimmed);
      }
    }
    const idxKey = String(idx);
    pushUnique(keys, idxKey);
    seen.add(idxKey);
    pushUnique(keys, idx);
    const displayName =
      typeof name === 'string' && name.trim()
        ? name.trim()
        : `User ${idx + 1}`;
    entries.push({
      keys,
      multiplier: sanitizeMultiplier(multipliers[idx]),
      displayName,
      id: idxKey,
      order: idx
    });
  });
  let extraOrder = users.length;
  Object.keys(calendar || {}).forEach(key => {
    const strKey = String(key);
    if (seen.has(strKey)) return;
    entries.push({
      keys: [key],
      multiplier: 1,
      displayName: strKey,
      id: strKey,
      order: extraOrder
    });
    seen.add(strKey);
    extraOrder += 1;
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
  return formatQuantity(value);
}

function extractUnitText(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([\d\s./+-]+)(.*)$/);
  if (match) {
    return match[2].trim();
  }
  return trimmed;
}

function formatUnitLabel(text) {
  if (!text) return '';
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (lower === 'cooked' || lower === 'dry') {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      if (index === 0 && lower.length > 2) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(' ');
}

let densityMap = {};

function getDensitySettings(name) {
  if (!name) return null;
  if (densityMap[name]) return densityMap[name];
  const canonical = canonicalName(name);
  if (!canonical) return null;
  return densityMap[canonical] || null;
}

function formatNormalizedSuffix(ingredientName, totalQuantity, unit, baseUnitText = '') {
  if (!ingredientName || !Number.isFinite(totalQuantity) || !unit) {
    return '';
  }
  const settings = getDensitySettings(ingredientName);
  if (!settings) return '';
  const normalized = computeNormalizedQuantity(totalQuantity, unit, settings);
  if (!normalized) return '';
  const normalizedUnitRaw =
    typeof normalized.unit === 'string' ? normalized.unit.trim() : '';
  if (!normalizedUnitRaw) return '';
  const normalizedUnit = formatUnitLabel(normalizedUnitRaw);
  if (!normalizedUnit) return '';
  let baseUnitLabel = '';
  if (typeof baseUnitText === 'string' && baseUnitText.trim()) {
    baseUnitLabel = formatUnitLabel(baseUnitText.trim());
  } else if (unit && unit !== 'ea') {
    baseUnitLabel = formatUnitLabel(unit);
  }
  if (
    baseUnitLabel &&
    normalizedUnit.toLowerCase() === baseUnitLabel.toLowerCase()
  ) {
    return '';
  }
  const formatted = formatNumber(normalized.quantity);
  if (!formatted) return '';
  return `(Converts to ${formatted} ${normalizedUnit})`;
}

function formatIngredientAmount(ingredient, multiplier) {
  if (!ingredient) return '';
  const sourceValue =
    ingredient.serving_size != null ? ingredient.serving_size : ingredient.amount;
  const raw =
    typeof sourceValue === 'string'
      ? sourceValue.trim()
      : sourceValue != null
      ? String(sourceValue).trim()
      : '';
  if (!raw) return '';
  const { value, unit } = parseQuantity(raw);
  if (!value) {
    return raw;
  }
  const total = value * multiplier;
  const formatted = formatNumber(total);
  if (!formatted) {
    return raw;
  }
  const unitText = extractUnitText(raw);
  const baseText = unitText ? `${formatted} ${unitText}` : formatted;
  const suffix = formatNormalizedSuffix(ingredient.name, total, unit, unitText);
  return suffix ? `${baseText} ${suffix}` : baseText;
}

function formatPortions(multiplier) {
  const formatted = formatNumber(multiplier);
  if (!formatted) return '';
  return `${formatted} ${formatted === '1' ? 'portion' : 'portions'}`;
}

function parseMultiplier(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildUserBreakdownEntries(ingredient, users) {
  if (!Array.isArray(users) || !users.length) {
    return [];
  }
  return users
    .map(user => {
      if (!user) return null;
      const label =
        typeof user.name === 'string' && user.name.trim()
          ? user.name.trim()
          : user.id != null
          ? String(user.id)
          : null;
      if (!label) return null;
      const amountText = formatIngredientAmount(ingredient, user.total);
      if (!amountText) return null;
      return { name: label, amount: amountText };
    })
    .filter(Boolean);
}

function createIngredientListItem(ingredient, totalMultiplier, users, options = {}) {
  const li = document.createElement('li');
  li.className = 'ingredient-entry';
  const header = document.createElement('div');
  header.className = 'ingredient-header';
  const name = ingredient?.name?.trim() || 'Unnamed ingredient';
  const nameEl = document.createElement('span');
  nameEl.className = 'ingredient-name';
  nameEl.textContent = name;
  header.appendChild(nameEl);
  let amountText = '';
  if (Number.isFinite(totalMultiplier) && totalMultiplier > 0) {
    amountText = formatIngredientAmount(ingredient, totalMultiplier);
  }
  if (amountText) {
    const amountEl = document.createElement('span');
    amountEl.className = 'ingredient-amount';
    amountEl.textContent = amountText;
    header.appendChild(amountEl);
  }
  li.appendChild(header);
  const breakdown = buildUserBreakdownEntries(ingredient, users);
  if (breakdown.length) {
    const list = document.createElement('ul');
    list.className = 'user-breakdown';
    breakdown.forEach(entry => {
      const item = document.createElement('li');
      item.className = 'user-breakdown-item';
      const label = document.createElement('span');
      label.className = 'user-name';
      label.textContent = entry.name;
      item.appendChild(label);
      const amount = document.createElement('span');
      amount.className = 'user-amount';
      amount.textContent = entry.amount;
      item.appendChild(amount);
      list.appendChild(item);
    });
    li.appendChild(list);
  }
  return li;
}

function normalizeMealEntry(entry, mealMap) {
  if (!entry) return null;
  let mealId = null;
  let totalMultiplier = null;
  let leftoverDates = [];
  let wholeMeal = false;
  let prepItems = [];
  let userList = null;
  let targetLabels = [];

  if (Array.isArray(entry)) {
    if (entry.length) mealId = entry[0];
    totalMultiplier = parseMultiplier(entry[1]);
  } else if (typeof entry === 'object') {
    mealId = entry.id || entry.mealId || entry.name || null;
    totalMultiplier = parseMultiplier(entry.total);
    if (Array.isArray(entry.leftoverDates)) {
      leftoverDates = entry.leftoverDates
        .map(value => (value != null ? String(value).trim() : ''))
        .filter(Boolean);
    }
    if (entry.wholeMeal) {
      wholeMeal = true;
    }
    if (Array.isArray(entry.items)) {
      prepItems = entry.items
        .map(item => {
          if (!item) return null;
          const rawIndex = item.index;
          const parsedIndex =
            typeof rawIndex === 'number' && Number.isFinite(rawIndex)
              ? rawIndex
              : parseInt(rawIndex, 10);
          if (!Number.isFinite(parsedIndex)) return null;
          const total = parseMultiplier(item.total);
          const users = Array.isArray(item.users)
            ? item.users.filter(Boolean)
            : null;
          return { index: parsedIndex, total, users };
        })
        .filter(Boolean);
    }
    if (Array.isArray(entry.users) && entry.users.length) {
      userList = entry.users.filter(Boolean);
    }
    if (Array.isArray(entry.targets)) {
      const labels = [];
      entry.targets.forEach(target => {
        if (!target || typeof target !== 'object') return;
        const source = target.dayName || target.date;
        if (!source && source !== 0) return;
        const label = String(source).trim();
        if (!label) return;
        if (!labels.includes(label)) {
          labels.push(label);
        }
      });
      if (labels.length) {
        targetLabels = labels;
      }
    }
  } else {
    mealId = entry;
  }

  if (!mealId) return null;
  const meal = mealMap[mealId];
  if (!meal) return null;

  const leftoverUnique = Array.from(new Set(leftoverDates)).sort();
  const categoryLabel =
    meal?.categoryLabel ||
    (meal?.categoryId && (MEAL_TYPES[meal.categoryId]?.label || meal.categoryId));
  const name = meal?.name || mealId;
  const displayName = categoryLabel ? `${categoryLabel}: ${name}` : name;

  return {
    mealId,
    meal,
    displayName,
    totalMultiplier,
    leftoverDates: leftoverUnique,
    wholeMeal,
    prepItems,
    userList,
    targetLabels
  };
}

function buildIngredientEntries(meal, normalized) {
  const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  if (!ingredients.length) return [];
  const result = [];
  const baseUsers =
    Array.isArray(normalized.userList) && normalized.userList.length
      ? normalized.userList
      : null;
  const hasPartialPrep =
    !normalized.wholeMeal &&
    Array.isArray(normalized.prepItems) &&
    normalized.prepItems.length;

  if (hasPartialPrep) {
    const aggregated = new Map();
    normalized.prepItems.forEach(item => {
      if (!item || !Number.isFinite(item.index)) return;
      if (item.index < 0 || item.index >= ingredients.length) return;
      const amount = Number(item.total);
      if (!Number.isFinite(amount) || amount <= 0) return;
      let record = aggregated.get(item.index);
      if (!record) {
        record = { total: 0, users: null };
        aggregated.set(item.index, record);
      }
      record.total += amount;
      const itemUsers = Array.isArray(item.users) ? item.users : null;
      if (itemUsers && itemUsers.length) {
        record.users = record.users || {};
        itemUsers.forEach(user => {
          if (!user) return;
          incrementUserTotals(record.users, user, user.total);
        });
      }
    });
    if (aggregated.size) {
      const sorted = Array.from(aggregated.entries()).sort((a, b) => a[0] - b[0]);
      sorted.forEach(([idx, info]) => {
        const ingredient = ingredients[idx];
        const userTotals = serializeUserTotals(info.users);
        const breakdownUsers = userTotals.length ? userTotals : baseUsers;
        result.push({ ingredient, amount: info.total, users: breakdownUsers });
      });
      return result;
    }
    ingredients.forEach(ingredient => {
      result.push({ ingredient, amount: null, users: baseUsers });
    });
    return result;
  }

  ingredients.forEach(ingredient => {
    result.push({ ingredient, amount: normalized.totalMultiplier, users: baseUsers });
  });
  return result;
}

function buildMealBlockFromEntries(normalized, ingredientEntries, options = {}) {
  if (!normalized) return null;
  const entries = Array.isArray(ingredientEntries) ? ingredientEntries : [];
  const block = document.createElement('div');
  block.className = 'meal-block';
  const title = document.createElement('div');
  title.className = 'meal-title';
  const portionText = formatPortions(normalized.totalMultiplier);
  const targetText = normalized.targetLabels.length
    ? ` for ${normalized.targetLabels.join(', ')}`
    : '';
  title.textContent = portionText
    ? `${normalized.displayName} (${portionText})${targetText}`
    : `${normalized.displayName}${targetText}`;
  block.appendChild(title);

  if (normalized.leftoverDates.length) {
    const detail = document.createElement('div');
    detail.className = 'leftover-detail';
    detail.textContent = `Includes leftovers for ${normalized.leftoverDates.join(', ')}`;
    block.appendChild(detail);
  }

  if (options?.partInfo && options.partInfo.count > 1) {
    const part = document.createElement('div');
    part.className = 'meal-part-label';
    const partIndex = Number(options.partInfo.index);
    const partCount = Number(options.partInfo.count);
    const displayIndex = Number.isFinite(partIndex) ? partIndex + 1 : 1;
    const displayCount = Number.isFinite(partCount) && partCount > 0 ? partCount : 1;
    part.textContent = `Part ${displayIndex}/${displayCount}`;
    block.appendChild(part);
  }

  if (entries.length) {
    const list = document.createElement('ul');
    list.className = 'ingredient-list';
    entries.forEach(entry => {
      list.appendChild(
        createIngredientListItem(entry.ingredient, entry.amount, entry.users, options)
      );
    });
    block.appendChild(list);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-ingredients';
    placeholder.textContent = 'No ingredient details available';
    block.appendChild(placeholder);
  }
  return block;
}

function buildMealBlockElement(normalized, options = {}) {
  const ingredientEntries = buildIngredientEntries(normalized?.meal, normalized);
  return buildMealBlockFromEntries(normalized, ingredientEntries, options);
}

function renderMealColumn(container, entries, mealMap) {
  container.innerHTML = '';
  if (container?.classList) {
    container.classList.add('meal-cell');
  }
  if (!entries?.length) {
    return;
  }
  const column = document.createElement('div');
  column.className = 'meal-column';
  container.appendChild(column);
  entries.forEach(entry => {
    const normalized = normalizeMealEntry(entry, mealMap);
    if (!normalized) return;
    const block = buildMealBlockElement(normalized, { variant: 'screen' });
    if (block) {
      column.appendChild(block);
    }
  });
}

function createPrintCard(dateLabel, sectionLabel, block) {
  const card = document.createElement('div');
  card.className = 'print-card';
  const header = document.createElement('div');
  header.className = 'print-card-header';
  if (dateLabel) {
    const dateEl = document.createElement('div');
    dateEl.className = 'print-card-date';
    dateEl.textContent = dateLabel;
    header.appendChild(dateEl);
  }
  if (sectionLabel) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'print-card-section';
    sectionEl.textContent = sectionLabel;
    header.appendChild(sectionEl);
  }
  card.appendChild(header);
  const body = document.createElement('div');
  body.className = 'print-card-body';
  if (block) {
    body.appendChild(block);
  }
  card.appendChild(body);
  return card;
}

function parseCssDimension(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('px')) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.height = trimmed;
  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return pixels || null;
}

function getPrintPageHeight(container) {
  if (!container) return 0;
  const styles = getComputedStyle(container);
  const raw = styles.getPropertyValue('--print-page-height');
  const parsed = parseCssDimension(raw);
  return parsed || 0;
}

function renderPrintPages(data, mealMap) {
  const container = document.getElementById('printPages');
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(data) || !data.length) {
    return;
  }

  const originalStyles = {
    display: container.style.display,
    visibility: container.style.visibility,
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    width: container.style.width
  };

  container.style.display = 'block';
  container.style.visibility = 'hidden';
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '100%';

  const pageHeight = getPrintPageHeight(container);
  const tolerance = 1;
  const MAX_PER_ROW = 2;

  function createPage() {
    const page = document.createElement('section');
    page.className = 'print-page';
    const columns = document.createElement('div');
    columns.className = 'print-columns';
    page.appendChild(columns);
    return { page, columns };
  }

  let currentPage = null;
  let currentRow = null;
  let rowCount = 0;

  function startNewPage() {
    currentPage = createPage();
    container.appendChild(currentPage.page);
    currentRow = null;
    rowCount = 0;
  }

  function ensureRow() {
    if (!currentPage) {
      startNewPage();
    }
    if (!currentRow) {
      currentRow = document.createElement('div');
      currentRow.className = 'print-row';
      currentPage.columns.appendChild(currentRow);
      rowCount = 0;
    } else {
      rowCount = currentRow.children.length;
    }
  }

  function clearEmptyStructures(pageRef, rowRef) {
    if (rowRef && !rowRef.children.length) {
      rowRef.remove();
      if (currentRow === rowRef) {
        currentRow = null;
        rowCount = 0;
      }
    } else if (rowRef === currentRow) {
      rowCount = rowRef ? rowRef.children.length : 0;
    }

    if (pageRef && !pageRef.columns.children.length) {
      pageRef.page.remove();
      if (currentPage === pageRef) {
        currentPage = null;
        currentRow = null;
        rowCount = 0;
      }
    }
  }

  function tryPlaceCard(card, allowNewPage = true, skipCheck = false) {
    if (!card) return true;
    ensureRow();
    const targetPage = currentPage;
    const targetRow = currentRow;
    targetRow.appendChild(card);
    let rowChildren = targetRow.children.length;

    if (!skipCheck && pageHeight && pageHeight > 0) {
      const height = targetPage.page.getBoundingClientRect().height;
      if (height > pageHeight + tolerance) {
        targetRow.removeChild(card);
        rowChildren = targetRow.children.length;
        clearEmptyStructures(targetPage, targetRow);
        if (allowNewPage) {
          startNewPage();
          return tryPlaceCard(card, false, skipCheck);
        }
        return false;
      }
    }

    if (currentRow === targetRow) {
      rowCount = rowChildren;
    }
    if (currentRow && currentRow.children.length >= MAX_PER_ROW) {
      currentRow = null;
      rowCount = 0;
    }
    return true;
  }

  function buildEntryCard(entry) {
    const options = { variant: 'print' };
    if (entry.partInfo && entry.partInfo.count > 1) {
      options.partInfo = entry.partInfo;
    }
    const block = buildMealBlockFromEntries(entry.normalized, entry.ingredientEntries, options);
    return createPrintCard(entry.dateLabel, entry.sectionLabel, block);
  }

  function placeEntry(entry) {
    const card = buildEntryCard(entry);
    const placed = tryPlaceCard(card, true);
    if (!placed) {
      card.remove();
    }
    return placed;
  }

  function splitEntry(entry) {
    const ingredients = Array.isArray(entry.ingredientEntries)
      ? entry.ingredientEntries
      : [];
    if (!pageHeight || ingredients.length <= 1) {
      return null;
    }

    const measurement = createPage();
    container.appendChild(measurement.page);

    const fragments = [];
    let cursor = 0;
    while (cursor < ingredients.length) {
      let low = 1;
      let high = ingredients.length - cursor;
      let bestCount = 0;
      while (low <= high) {
        const mid = Math.max(1, Math.floor((low + high) / 2));
        const slice = ingredients.slice(cursor, cursor + mid);
        const block = buildMealBlockFromEntries(entry.normalized, slice, {
          variant: 'print',
          partInfo: { index: fragments.length, count: fragments.length + 1 }
        });
        const card = createPrintCard(entry.dateLabel, entry.sectionLabel, block);
        measurement.columns.appendChild(card);
        const height = measurement.page.getBoundingClientRect().height;
        measurement.columns.removeChild(card);
        if (height <= pageHeight + tolerance) {
          bestCount = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (!bestCount) {
        bestCount = 1;
      }
      const sliceEntries = ingredients.slice(cursor, cursor + bestCount);
      fragments.push({
        dateLabel: entry.dateLabel,
        sectionLabel: entry.sectionLabel,
        normalized: entry.normalized,
        ingredientEntries: sliceEntries,
        partInfo: { index: fragments.length, count: 0 }
      });
      cursor += bestCount;
    }

    measurement.page.remove();

    if (fragments.length <= 1) {
      return null;
    }
    fragments.forEach((fragment, idx) => {
      fragment.partInfo.count = fragments.length;
      fragment.partInfo.index = idx;
    });
    return fragments;
  }

  const queue = [];
  data.forEach(day => {
    if (!day) return;
    const dateLabel = day.dayName ? `${day.date} (${day.dayName})` : day.date;
    if (Array.isArray(day.meals)) {
      day.meals.forEach(entry => {
        const normalized = normalizeMealEntry(entry, mealMap);
        if (!normalized) return;
        queue.push({
          dateLabel,
          sectionLabel: 'Cook Today',
          normalized,
          ingredientEntries: buildIngredientEntries(normalized.meal, normalized)
        });
      });
    }
    if (Array.isArray(day.prepList)) {
      day.prepList.forEach(entry => {
        const normalized = normalizeMealEntry(entry, mealMap);
        if (!normalized) return;
        queue.push({
          dateLabel,
          sectionLabel: 'Prep Ahead',
          normalized,
          ingredientEntries: buildIngredientEntries(normalized.meal, normalized)
        });
      });
    }
  });

  if (!queue.length) {
    container.style.display = originalStyles.display;
    container.style.visibility = originalStyles.visibility;
    container.style.position = originalStyles.position;
    container.style.left = originalStyles.left;
    container.style.top = originalStyles.top;
    container.style.width = originalStyles.width;
    return;
  }

  for (let i = 0; i < queue.length; i += 1) {
    const entry = queue[i];
    if (!entry) continue;
    if (!Array.isArray(entry.ingredientEntries)) {
      entry.ingredientEntries = buildIngredientEntries(entry.normalized?.meal, entry.normalized);
    }
    let placed = placeEntry(entry);
    if (!placed && pageHeight > 0) {
      const parts = splitEntry(entry);
      if (parts && parts.length) {
        queue.splice(i, 1, ...parts);
        i -= 1;
        continue;
      }
    }
    if (!placed) {
      const fallbackCard = buildEntryCard(entry);
      tryPlaceCard(fallbackCard, true, true);
    }
  }

  container.style.display = originalStyles.display;
  container.style.visibility = originalStyles.visibility;
  container.style.position = originalStyles.position;
  container.style.left = originalStyles.left;
  container.style.top = originalStyles.top;
  container.style.width = originalStyles.width;
}

function clearPrintPages() {
  const container = document.getElementById('printPages');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = '';
  container.style.visibility = '';
  container.style.position = '';
  container.style.left = '';
  container.style.top = '';
  container.style.width = '';
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

  function addPrepRecord(map, mealId, amount, options = {}, userInfo = null) {
    if (!mealId || !amount) return;
    let record = map.get(mealId);
    if (!record) {
      record = {
        mealId,
        total: 0,
        wholeMeal: false,
        itemTotals: null,
        itemUsers: null,
        targets: [],
        userTotals: null
      };
      map.set(mealId, record);
    }
    record.total += amount;
    const descriptor = buildUserDescriptor(userInfo);
    if (descriptor) {
      record.userTotals = record.userTotals || {};
      incrementUserTotals(record.userTotals, descriptor, amount);
    }

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
      record.itemUsers = null;
      return;
    }
    if (record.wholeMeal) return;
    const items = Array.isArray(options.items) ? options.items : [];
    if (!items.length) return;
    if (!record.itemTotals) record.itemTotals = {};
    if (!record.itemUsers) record.itemUsers = {};
    items.forEach(idx => {
      if (idx === null || idx === undefined) return;
      const key = String(idx);
      record.itemTotals[key] = (record.itemTotals[key] || 0) + amount;
      if (descriptor) {
        record.itemUsers[key] = record.itemUsers[key] || {};
        incrementUserTotals(record.itemUsers[key], descriptor, amount);
      }
    });
  }

  function clonePrepRecord(record) {
    return {
      mealId: record.mealId,
      total: record.total,
      wholeMeal: record.wholeMeal,
      itemTotals: record.itemTotals ? { ...record.itemTotals } : null,
      itemUsers: cloneItemUsers(record.itemUsers),
      targets: Array.isArray(record.targets)
        ? record.targets.map(target => ({ ...target }))
        : [],
      userTotals: cloneUserTotals(record.userTotals)
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
    target.userTotals = mergeUserTotals(target.userTotals, source.userTotals);
    if (source.wholeMeal) {
      target.wholeMeal = true;
      target.itemTotals = null;
      target.itemUsers = null;
      return;
    }
    if (target.wholeMeal) return;
    if (!source.itemTotals) return;
    if (!target.itemTotals) target.itemTotals = {};
    Object.keys(source.itemTotals).forEach(key => {
      target.itemTotals[key] = (target.itemTotals[key] || 0) + source.itemTotals[key];
    });
    target.itemUsers = mergeItemUsers(target.itemUsers, source.itemUsers);
  }

  const rows = [];
  for (let i = 0; i < calcDays; i++) {
    const dStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const counts = new Map();
    const ahead = new Map();
    function addCookTotal(id, amount, leftovers, prepared, userInfo) {
      if (!id || !amount) return;
      let record = counts.get(id);
      if (!record) {
        record = {
          total: 0,
          leftoverDates: new Set(),
          prepared: !!prepared,
          userTotals: null
        };
        counts.set(id, record);
      }
      record.total += amount;
      if (prepared) record.prepared = true;
      const descriptor = buildUserDescriptor(userInfo);
      if (descriptor) {
        record.userTotals = record.userTotals || {};
        incrementUserTotals(record.userTotals, descriptor, amount);
      }
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
                meal.prepared,
                userEntry
              );
            }
            if (meal.prepAhead) {
              addPrepRecord(
                ahead,
                calEntry.mealId,
                userEntry.multiplier,
                {
                  wholeMeal: true,
                  targets: [{ date: dStr, dayName }]
                },
                userEntry
              );
            } else if (Array.isArray(meal.ingredients)) {
              const indices = [];
              meal.ingredients.forEach((ing, idx) => {
                if (ing && ing.prepAhead) {
                  indices.push(idx);
                }
              });
              if (indices.length) {
                addPrepRecord(
                  ahead,
                  calEntry.mealId,
                  userEntry.multiplier,
                  {
                    items: indices,
                    targets: [{ date: dStr, dayName }]
                  },
                  userEntry
                );
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
    meals: Array.from(row.counts.entries()).map(([id, info]) => {
      const users = serializeUserTotals(info.userTotals);
      return {
        id,
        total: info.total,
        leftoverDates: Array.from(info.leftoverDates).sort(),
        users
      };
    }),
    prepList: row.prepList
      ? Array.from(row.prepList.values()).map(record => {
          const result = {
            mealId: record.mealId,
            total: record.total
          };
          const users = serializeUserTotals(record.userTotals);
          if (users.length) {
            result.users = users;
          }
          if (Array.isArray(record.targets) && record.targets.length) {
            result.targets = record.targets.map(target => ({ ...target }));
          }
          if (record.itemTotals) {
            result.items = Object.entries(record.itemTotals).map(([idx, total]) => {
              const parsedIndex = Number(idx);
              const itemUsers = serializeUserTotals(record.itemUsers?.[idx]);
              const item = {
                index: Number.isNaN(parsedIndex) ? idx : parsedIndex,
                total
              };
              if (itemUsers.length) {
                item.users = itemUsers;
              }
              return item;
            });
          }
          if (record.wholeMeal) {
            result.wholeMeal = true;
          }
          if (Array.isArray(result.items)) {
            result.items = result.items.map(item => {
              if (Array.isArray(item.users) && item.users.length) {
                return item;
              }
              if (users.length) {
                return { ...item, users };
              }
              const clone = { ...item };
              delete clone.users;
              return clone;
            });
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
  const [users, calendar, multipliers, mealMap, cookingDays, densities] =
    await Promise.all([
      loadUsers(),
      loadCalendar(),
      loadUserPortionMultipliers(),
      loadAllMeals(),
      loadCookingDays(),
      loadDensityMap()
    ]);
  densityMap = densities || {};
  const userEntries = buildUserEntries(users, multipliers, calendar);
  const prepDays = normalizePrepDays(cookingDays?.prepDay);
  const { start, days } = getParams();
  document.getElementById('startDate').value = start || new Date().toISOString().split('T')[0];
  document.getElementById('numDays').value = days;

  let currentData = [];
  let printPrepared = false;
  const printContainer = document.getElementById('printPages');
  const printButton = document.getElementById('printBtn');

  function preparePrint() {
    if (!printContainer) return;
    if (!currentData.length) {
      clearPrintPages();
      printPrepared = false;
      return;
    }
    renderPrintPages(currentData, mealMap);
    const container = document.getElementById('printPages');
    printPrepared = !!container && container.childElementCount > 0;
    return printPrepared;
  }

  function resetPrint() {
    if (!printContainer) return;
    clearPrintPages();
    printPrepared = false;
  }

  function waitForNextFrame() {
    return new Promise(resolve => {
      const raf =
        (typeof window !== 'undefined' && window.requestAnimationFrame) || null;
      if (typeof raf === 'function') {
        raf(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function notify(message) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    } else if (typeof alert === 'function') {
      alert(message);
    }
  }

  function update() {
    const startVal = document.getElementById('startDate').value;
    const daysVal = parseInt(document.getElementById('numDays').value, 10) || 7;
    const data = buildData(calendar, userEntries, mealMap, startVal, daysVal, prepDays);
    currentData = data;
    renderRows(data, mealMap);
    if (printPrepared) {
      preparePrint();
    } else if (printContainer) {
      clearPrintPages();
    }
  }

  document.getElementById('showBtn').addEventListener('click', update);
  document.getElementById('eatViewBtn').addEventListener('click', openEatView);

  if (printButton) {
    printButton.addEventListener('click', async () => {
      if (typeof window.print !== 'function') {
        const message = 'Printing is not supported in this browser.';
        console.warn(message);
        notify(message);
        return;
      }

      update();
      preparePrint();
      await waitForNextFrame();

      if (!printPrepared) {
        const message = 'There is no printable content available yet.';
        console.warn(message);
        notify(message);
        return;
      }

      window.print();
    });
  }

  if (printContainer) {
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', resetPrint);
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('print');
      const mqListener = event => {
        if (event.matches) {
          preparePrint();
        } else {
          resetPrint();
        }
      };
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', mqListener);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(mqListener);
      }
    }
  }

  update();
}

document.addEventListener('DOMContentLoaded', init);
