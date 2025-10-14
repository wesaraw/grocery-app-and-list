import { loadUsers, loadUserCategoryDays } from './utils/userData.js';
import { initializeMealCategories, MEAL_TYPES } from './utils/mealData.js';
import { loadMealSlotDescriptors, loadMealSlotOverrides } from './utils/mealSlotOverrides.js';
import {
  loadWeeklyMealOverrides,
  saveWeeklyMealOverrides,
  generateWeeklyMealOverrideId
} from './utils/weeklyMealOverrides.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadJSON } from './utils/dataLoader.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { weekNumber } from './utils/calendarUtils.js';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

const DAY_ABBR = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat'
};

function normalizeCategoryKeyValue(value) {
  if (value == null) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function ensureCategoryLabelEntry(labelsById, categoryId, label) {
  if (!labelsById || !categoryId || !label) return;
  if (!labelsById[categoryId]) {
    labelsById[categoryId] = label;
  }
}

function registerCategoryLabel(map, rawLabel, categoryId) {
  if (!(map instanceof Map) || !categoryId || rawLabel == null) return;
  const stringLabel = rawLabel.toString();
  if (!stringLabel) return;
  const trimmed = stringLabel.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  const normalized = normalizeCategoryKeyValue(trimmed);
  const collapsed = normalized.replace(/and/g, '');
  [trimmed, lower, normalized, collapsed]
    .filter(Boolean)
    .forEach(key => {
      if (!map.has(key)) {
        map.set(key, categoryId);
      }
    });
}

function buildCategoryLabelMaps(descriptorData = {}) {
  const labelToId = new Map();
  const labelsById = {};
  const byCategory = descriptorData.byCategory || {};

  Object.entries(byCategory).forEach(([categoryId, descriptors]) => {
    if (!categoryId) return;
    registerCategoryLabel(labelToId, categoryId, categoryId);
    const list = Array.isArray(descriptors) ? descriptors : [];
    list.forEach(descriptor => {
      if (descriptor?.categoryLabel) {
        registerCategoryLabel(labelToId, descriptor.categoryLabel, categoryId);
        ensureCategoryLabelEntry(labelsById, categoryId, descriptor.categoryLabel);
      }
    });
  });

  Object.entries(MEAL_TYPES).forEach(([categoryId, config]) => {
    if (!categoryId) return;
    registerCategoryLabel(labelToId, categoryId, categoryId);
    if (config?.label) {
      registerCategoryLabel(labelToId, config.label, categoryId);
      ensureCategoryLabelEntry(labelsById, categoryId, config.label);
    }
  });

  return { labelToId, labelsById };
}

function cloneDayPreference(pref) {
  if (!pref || typeof pref !== 'object') {
    return {};
  }
  const clone = { ...pref };
  if (Array.isArray(pref.days)) {
    clone.days = pref.days.slice();
  }
  if (Array.isArray(pref.union)) {
    clone.union = pref.union.slice();
  }
  if (Array.isArray(pref.slots)) {
    clone.slots = pref.slots.map(slot => (Array.isArray(slot) ? slot.slice() : []));
  }
  return clone;
}

function mergeArrayUnique(base = [], addition = []) {
  const result = new Set();
  base.forEach(entry => {
    if (entry != null) {
      result.add(entry);
    }
  });
  addition.forEach(entry => {
    if (entry != null) {
      result.add(entry);
    }
  });
  return Array.from(result);
}

function mergeSlotPreference(target = {}, addition = {}) {
  const result = { ...target };
  if (Array.isArray(addition.days)) {
    result.days = mergeArrayUnique(result.days || [], addition.days);
  }
  if (Array.isArray(addition.union)) {
    result.union = mergeArrayUnique(result.union || [], addition.union);
  }
  if (Array.isArray(addition.slots)) {
    const existing = Array.isArray(result.slots) ? result.slots : [];
    const max = Math.max(existing.length, addition.slots.length);
    const merged = [];
    for (let i = 0; i < max; i += 1) {
      const existingSet = new Set(Array.isArray(existing[i]) ? existing[i] : []);
      const additionArray = Array.isArray(addition.slots[i]) ? addition.slots[i] : [];
      additionArray.forEach(entry => {
        if (entry != null) {
          existingSet.add(entry);
        }
      });
      merged[i] = Array.from(existingSet);
    }
    result.slots = merged;
  }
  Object.keys(addition || {}).forEach(key => {
    if (key === 'days' || key === 'union' || key === 'slots') return;
    result[key] = addition[key];
  });
  return result;
}

function resolveCategoryIdKey(rawKey, { labelLookup, descriptorsByCategory } = {}) {
  if (rawKey == null) return '';
  const stringKey = rawKey.toString();
  const trimmed = stringKey.trim();
  if (!trimmed) return '';
  if (descriptorsByCategory && descriptorsByCategory[trimmed]) return trimmed;
  if (MEAL_TYPES[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (descriptorsByCategory && descriptorsByCategory[lower]) return lower;
  if (MEAL_TYPES[lower]) return lower;
  const normalized = normalizeCategoryKeyValue(trimmed);
  const lookup =
    labelLookup instanceof Map
      ? labelLookup.get(trimmed) || labelLookup.get(lower) || labelLookup.get(normalized)
      : null;
  if (lookup) return lookup;
  if (normalized && descriptorsByCategory && descriptorsByCategory[normalized]) return normalized;
  if (normalized && MEAL_TYPES[normalized]) return normalized;
  return trimmed;
}

function ensureCategoryLabelMapping(categoryId, label, labelLookup, labelsById) {
  if (!categoryId || !label) return;
  ensureCategoryLabelEntry(labelsById, categoryId, label);
  registerCategoryLabel(labelLookup, label, categoryId);
}

const userSelect = document.getElementById('userSelect');
const yearInput = document.getElementById('yearInput');
const weekInput = document.getElementById('weekInput');
const slotColumn = document.getElementById('slotColumn');
const selectedSlotLabel = document.getElementById('selectedSlotLabel');
const mealOptions = document.getElementById('mealOptions');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const saveBtn = document.getElementById('saveBtn');
const statusMessage = document.getElementById('statusMessage');

const state = {
  users: [],
  userDayPrefs: [],
  slotDescriptorsByCategory: {},
  slotCounts: {},
  slotOverrides: [],
  slotOverridesByUser: {},
  weeklyOverrides: [],
  mealsByCategory: {},
  mealLookup: new Map(),
  categoryIdByLabel: new Map(),
  categoryLabelsById: {},
  currentUserIndex: null,
  currentYear: null,
  currentWeek: null,
  slotMetadata: new Map(),
  slotButtons: new Map(),
  selectedSlotKey: null,
  baselineAssignments: new Map(),
  workingAssignments: new Map(),
  hiddenAssignments: [],
  saving: false,
  copying: false,
  dirty: false
};

function toISODateString(date) {
  return date.toISOString().split('T')[0];
}

function getCurrentWeekInfo() {
  const now = new Date();
  const iso = toISODateString(now);
  const year = Number.parseInt(iso.slice(0, 4), 10);
  return { year: Number.isInteger(year) ? year : now.getUTCFullYear(), week: weekNumber(iso) };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function setStatus(message, type = 'info') {
  if (!statusMessage) return;
  statusMessage.textContent = message || '';
  if (type === 'error') {
    statusMessage.style.color = '#b3261e';
  } else if (type === 'success') {
    statusMessage.style.color = '#1a7f45';
  } else {
    statusMessage.style.color = '#555e72';
  }
}

function mapFromEntries(entries = []) {
  const map = new Map();
  entries.forEach(entry => {
    if (!entry) return;
    map.set(entry.key, { ...entry });
  });
  return map;
}

function cloneAssignmentMap(map) {
  const next = new Map();
  map.forEach((value, key) => {
    next.set(key, { ...value });
  });
  return next;
}

function assignmentsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (other.mealId !== value.mealId) return false;
  }
  return true;
}

function resolveCategoryLabel(categoryId) {
  if (state.categoryLabelsById && state.categoryLabelsById[categoryId]) {
    return state.categoryLabelsById[categoryId];
  }
  const descriptorList = state.slotDescriptorsByCategory[categoryId];
  if (descriptorList && descriptorList.length && descriptorList[0]?.categoryLabel) {
    return descriptorList[0].categoryLabel;
  }
  const type = MEAL_TYPES[categoryId];
  if (type?.label) return type.label;
  return categoryId;
}

function formatSlotLabel(descriptor, categoryId, slotIndex) {
  const baseLabel = descriptor?.categoryLabel || resolveCategoryLabel(categoryId);
  const roleLabel = descriptor?.roleLabel;
  let slotCount = state.slotCounts[categoryId];
  if (!Number.isFinite(slotCount)) {
    const descriptors = state.slotDescriptorsByCategory[categoryId];
    slotCount = Array.isArray(descriptors) ? descriptors.length : undefined;
  }
  const showIndex =
    roleLabel && roleLabel !== baseLabel
      ? `${baseLabel} – ${roleLabel}`
      : slotCount && slotCount > 1
      ? `${baseLabel} – Slot ${slotIndex + 1}`
      : baseLabel;
  return showIndex || baseLabel;
}

function isMealAvailableForUser(meal, userIndex, totalUsers) {
  if (!meal) return false;
  if (Array.isArray(meal.users)) {
    if (userIndex < 0) return false;
    if (userIndex >= meal.users.length) {
      return false;
    }
    return Boolean(meal.users[userIndex]);
  }
  if (meal.active === false) return false;
  if (meal.people != null) {
    const numeric = Number(meal.people);
    if (Number.isFinite(numeric)) {
      return numeric > 0;
    }
  }
  if (meal.multiplier != null) {
    const numeric = Number(meal.multiplier);
    if (Number.isFinite(numeric)) {
      return numeric > 0;
    }
  }
  return true;
}

async function loadMeals(type) {
  const config = MEAL_TYPES[type];
  if (!config) return [];
  const { key, path } = config;
  let arr = await loadItemArray(key);
  if (!Array.isArray(arr) || arr.length === 0) {
    let fallback = await loadJSON(path);
    if (!Array.isArray(fallback)) fallback = [];
    arr = await convertArrayToNames(fallback);
  }
  if (Array.isArray(arr)) {
    arr.forEach(m => {
      if (m && typeof m === 'object') {
        if (m.prepared === undefined) m.prepared = false;
        if (m.leftoverOk === undefined) m.leftoverOk = false;
        if (m.recipeBook === undefined) m.recipeBook = '';
      }
    });
  }
  return arr || [];
}

async function loadMealsByCategory() {
  const result = {};
  const entries = Object.keys(MEAL_TYPES);
  for (const type of entries) {
    result[type] = await loadMeals(type);
  }
  return result;
}

function buildMealLookup(mealsByCategory) {
  const map = new Map();
  Object.entries(mealsByCategory || {}).forEach(([categoryId, list]) => {
    (list || []).forEach(meal => {
      if (!meal) return;
      const id = meal.id || meal.name;
      if (!id) return;
      map.set(id, { meal, categoryId });
    });
  });
  return map;
}

function remapUserDayPreferenceMap(prefMap, options = {}) {
  const { resolveCategoryId, labelLookup, labelsById } = options;
  const normalized = {};
  if (!prefMap || typeof prefMap !== 'object') {
    return normalized;
  }
  Object.entries(prefMap).forEach(([rawKey, prefValue]) => {
    if (!rawKey) return;
    const resolvedId = resolveCategoryId ? resolveCategoryId(rawKey) : rawKey;
    if (!resolvedId) return;
    const clone = cloneDayPreference(prefValue);
    const label =
      typeof clone.categoryLabel === 'string' && clone.categoryLabel
        ? clone.categoryLabel
        : typeof rawKey === 'string'
        ? rawKey
        : '';
    if (label) {
      clone.categoryLabel = label;
      ensureCategoryLabelMapping(resolvedId, label, labelLookup, labelsById);
    }
    const existing = normalized[resolvedId];
    if (existing) {
      normalized[resolvedId] = mergeSlotPreference(existing, clone);
    } else {
      normalized[resolvedId] = clone;
    }
  });
  return normalized;
}

function normalizeUserDayPrefs(list, userCount, options = {}) {
  const arr = Array.isArray(list) ? list.slice() : [];
  while (arr.length < userCount) {
    arr.push({});
  }
  for (let i = 0; i < arr.length; i += 1) {
    if (!arr[i] || typeof arr[i] !== 'object') {
      arr[i] = {};
    } else {
      arr[i] = remapUserDayPreferenceMap(arr[i], options);
    }
  }
  return arr;
}

function buildSlotOverridesByUser(overrides = []) {
  const map = {};
  overrides.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const userIndex = Number(entry.userIndex);
    if (!Number.isInteger(userIndex) || userIndex < 0) return;
    const days = Array.isArray(entry.days) ? entry.days : [];
    if (!days.length) return;
    const source = entry.sourceCategoryId;
    const target = entry.overrideCategoryId;
    if (!source || !target) return;
    const slotIndex = Number(entry.slotIndex);
    if (!Number.isInteger(slotIndex) || slotIndex < 0) return;
    const userMap = map[userIndex] || (map[userIndex] = {});
    days.forEach(day => {
      if (!DAY_NAMES.includes(day)) return;
      const dayMap = userMap[day] || (userMap[day] = {});
      const categoryMap = dayMap[source] || (dayMap[source] = {});
      categoryMap[slotIndex] = target;
    });
  });
  return map;
}

function buildWeekDates(year, week) {
  const dates = [];
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1) {
    return dates;
  }
  const cursor = new Date(Date.UTC(year, 0, 1));
  const limit = new Date(Date.UTC(year + 1, 0, 1));
  let found = false;

  while (cursor < limit) {
    const iso = toISODateString(cursor);
    const currentWeek = weekNumber(iso);
    if (Number.isFinite(currentWeek) && currentWeek === week) {
      found = true;
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (!found) {
    return dates;
  }

  const start = new Date(cursor.getTime());
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const baseDay = start.getUTCDate();

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getTime());
    date.setUTCDate(baseDay + i);
    dates.push({
      date,
      iso: toISODateString(date),
      dayName: DAY_NAMES[date.getUTCDay()]
    });
  }

  return dates;
}

function computeOverrideKeyMapsForUser(userIndex) {
  const result = {};
  const overrides = state.slotOverridesByUser[userIndex] || {};
  DAY_NAMES.forEach(dayName => {
    const dayOverrides = overrides[dayName] || {};
    const perCategory = {};
    Object.entries(dayOverrides).forEach(([sourceCategoryId, slotMap = {}]) => {
      Object.entries(slotMap || {}).forEach(([slotIndexKey, targetCategoryId]) => {
        if (!targetCategoryId) return;
        const numericIndex = Number(slotIndexKey);
        if (!Number.isFinite(numericIndex)) return;
        const floored = Math.floor(numericIndex);
        if (floored < 0) return;
        const slotCount = state.slotCounts[targetCategoryId] ?? 0;
        const limit = Math.max(1, Number.isFinite(slotCount) ? slotCount : 0);
        const normalized = Math.max(0, Math.min(floored, limit - 1));
        const map = perCategory[targetCategoryId] || (perCategory[targetCategoryId] = {});
        const comboKey = `${sourceCategoryId}:${floored}`;
        if (map[comboKey] == null) {
          map[comboKey] = normalized;
        }
      });
    });
    result[dayName] = perCategory;
  });
  return result;
}

function buildSlotMetadata(userIndex, year, week) {
  const slots = new Map();
  const weekDates = buildWeekDates(year, week);
  if (!weekDates.length) return slots;
  const userPrefs = state.userDayPrefs[userIndex] || {};
  const overridesByDay = state.slotOverridesByUser[userIndex] || {};
  const overrideKeyMaps = computeOverrideKeyMapsForUser(userIndex);

  weekDates.forEach(({ date, iso, dayName }) => {
    const overridesForDay = overridesByDay[dayName] || {};
    const overrideKeyMap = overrideKeyMaps[dayName] || {};
    const categories = new Set([
      ...Object.keys(userPrefs || {}),
      ...Object.keys(overridesForDay || {})
    ]);
    Object.values(overridesForDay || {}).forEach(slotMap => {
      Object.values(slotMap || {}).forEach(target => {
        if (target) categories.add(target);
      });
    });
    categories.forEach(categoryId => {
      const descriptors = state.slotDescriptorsByCategory[categoryId] || [];
      const slotCount = state.slotCounts[categoryId] ?? descriptors.length;
      const pref = userPrefs[categoryId] || {};
      const slotLists = Array.isArray(pref.slots) ? pref.slots : [];
      const slotSets = slotLists.map(slot => new Set(Array.isArray(slot) ? slot : []));
      const union = new Set(
        Array.isArray(pref.days)
          ? pref.days
          : Array.isArray(pref.union)
          ? pref.union
          : []
      );
      const overridesForCategory = overridesForDay[categoryId] || {};
      let highestOverride = -1;
      Object.keys(overridesForCategory).forEach(key => {
        const numeric = Math.floor(Number(key));
        if (Number.isFinite(numeric) && numeric > highestOverride) {
          highestOverride = numeric;
        }
      });
      const iterationSlots = Math.max(slotCount || 0, highestOverride + 1, 0);
      for (let slotIndex = 0; slotIndex < iterationSlots; slotIndex += 1) {
        const overrideTarget = overridesForCategory[slotIndex];
        if (overrideTarget) {
          const targetCount = state.slotCounts[overrideTarget] ?? 0;
          const limit = Math.max(1, Number.isFinite(targetCount) ? targetCount : 0);
          const normalizedIndex = Math.max(0, Math.min(slotIndex, limit - 1));
          const comboKey = `${categoryId}:${slotIndex}`;
          const overrideMap = overrideKeyMap[overrideTarget] || {};
          const mappedIndex =
            overrideMap[comboKey] != null ? overrideMap[comboKey] : normalizedIndex;
          const targetDescriptors = state.slotDescriptorsByCategory[overrideTarget] || [];
          const descriptor =
            targetDescriptors[mappedIndex] ||
            targetDescriptors[normalizedIndex] ||
            targetDescriptors[0] ||
            null;
          const key = `${iso}|${overrideTarget}|${mappedIndex}`;
          if (!slots.has(key)) {
            slots.set(key, {
              key,
              date,
              iso,
              dayName,
              categoryId: overrideTarget,
              slotIndex: mappedIndex,
              label: formatSlotLabel(descriptor, overrideTarget, mappedIndex),
              sourceCategoryId: categoryId,
              sourceSlotIndex: slotIndex
            });
          }
        }
        const baseSet = slotSets[slotIndex];
        const baseActive = baseSet ? baseSet.has(dayName) : union.has(dayName);
        if (baseActive) {
          const descriptor = descriptors[slotIndex] || descriptors[0] || null;
          const key = `${iso}|${categoryId}|${slotIndex}`;
          if (!slots.has(key)) {
            slots.set(key, {
              key,
              date,
              iso,
              dayName,
              categoryId,
              slotIndex,
              label: formatSlotLabel(descriptor, categoryId, slotIndex),
              sourceCategoryId: categoryId,
              sourceSlotIndex: slotIndex
            });
          }
        }
      }
    });
  });

  return slots;
}

function resolveMealName(mealId) {
  if (!mealId) return '';
  const entry = state.mealLookup.get(mealId);
  if (!entry) return mealId;
  return entry.meal?.name || mealId;
}

function setSelectedSlot(key) {
  state.selectedSlotKey = key;
  state.slotButtons.forEach((btn, btnKey) => {
    btn.dataset.selected = btnKey === key ? 'true' : 'false';
  });
  if (!key) {
    selectedSlotLabel.textContent = 'Select a slot to choose a meal.';
    clearSelectionBtn.dataset.visible = 'false';
    mealOptions.innerHTML = '<div class="empty-state">Choose a slot to view available meals.</div>';
    return;
  }
  const slot = state.slotMetadata.get(key);
  if (!slot) {
    selectedSlotLabel.textContent = 'Select a slot to choose a meal.';
    clearSelectionBtn.dataset.visible = 'false';
    mealOptions.innerHTML = '<div class="empty-state">Choose a slot to view available meals.</div>';
    return;
  }
  selectedSlotLabel.textContent = `${slot.dayName}, ${slot.label}`;
  const assignment = state.workingAssignments.get(key);
  clearSelectionBtn.dataset.visible = assignment ? 'true' : 'false';
  renderMealOptions(slot, assignment?.mealId || null);
}

function renderMealOptions(slot, selectedMealId) {
  mealOptions.innerHTML = '';
  const meals = state.mealsByCategory[slot.categoryId] || [];
  const available = meals.filter(meal =>
    isMealAvailableForUser(meal, state.currentUserIndex, state.users.length)
  );
  if (!available.length) {
    mealOptions.innerHTML = '<div class="empty-state">No meals available for this slot.</div>';
    return;
  }
  available
    .sort((a, b) => {
      const nameA = (a.name || a.id || '').toLowerCase();
      const nameB = (b.name || b.id || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    })
    .forEach(meal => {
      const id = meal.id || meal.name;
      if (!id) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'meal-btn';
      btn.textContent = meal.name || id;
      btn.dataset.selected = id === selectedMealId ? 'true' : 'false';
      btn.addEventListener('click', () => {
        assignMealToSlot(slot.key, id);
      });
      mealOptions.appendChild(btn);
    });
}

function updateSlotButtonState(key) {
  const btn = state.slotButtons.get(key);
  if (!btn) return;
  const assignment = state.workingAssignments.get(key);
  const baseline = state.baselineAssignments.get(key);
  const mealName = assignment ? resolveMealName(assignment.mealId) : 'No meal selected';
  if (btn._mealEl) {
    btn._mealEl.textContent = mealName || 'No meal selected';
  }
  const changed = baseline?.mealId !== assignment?.mealId;
  btn.dataset.changed = changed ? 'true' : 'false';
  clearSelectionBtn.dataset.visible =
    state.selectedSlotKey === key && assignment ? 'true' : 'false';
}

function assignMealToSlot(key, mealId) {
  if (!key || !mealId) return;
  const existing = state.workingAssignments.get(key);
  const baseline = state.baselineAssignments.get(key);
  const overrideId = existing?.overrideId || baseline?.overrideId || null;
  state.workingAssignments.set(key, {
    mealId,
    overrideId,
    key
  });
  updateSlotButtonState(key);
  setSelectedSlot(key);
  updateDirtyState();
}

function clearAssignment(key) {
  if (!key) return;
  state.workingAssignments.delete(key);
  updateSlotButtonState(key);
  if (state.selectedSlotKey === key) {
    clearSelectionBtn.dataset.visible = 'false';
    const slot = state.slotMetadata.get(key);
    if (slot) {
      renderMealOptions(slot, null);
    }
  }
  updateDirtyState();
}

function updateCopyAllButtonState() {
  if (!copyAllBtn) return;
  const hasBaseline =
    state.baselineAssignments instanceof Map && state.baselineAssignments.size > 0;
  const hasSelection =
    state.currentUserIndex != null &&
    Number.isInteger(state.currentYear) &&
    Number.isInteger(state.currentWeek);
  copyAllBtn.disabled = state.copying || state.saving || !hasSelection || !hasBaseline;
}

function updateDirtyState() {
  const dirty = !assignmentsEqual(state.workingAssignments, state.baselineAssignments);
  state.dirty = dirty;
  if (dirty) {
    saveBtn.dataset.visible = 'true';
  } else {
    saveBtn.dataset.visible = 'false';
  }
  saveBtn.disabled = state.saving || state.copying || !dirty;
  state.slotButtons.forEach((_, key) => updateSlotButtonState(key));
  updateCopyAllButtonState();
}

function buildBaselineAssignments(userIndex, year, week, slotKeys) {
  const entries = state.weeklyOverrides.filter(
    entry =>
      entry &&
      Number(entry.userIndex) === userIndex &&
      Number(entry.year) === year &&
      Number(entry.week) === week
  );
  const visible = [];
  const hidden = [];
  entries.forEach(entry => {
    const key = `${entry.date}|${entry.categoryId}|${entry.slotIndex}`;
    const payload = {
      key,
      mealId: entry.mealId,
      overrideId: entry.id,
      date: entry.date,
      categoryId: entry.categoryId,
      slotIndex: entry.slotIndex
    };
    if (slotKeys.has(key)) {
      visible.push(payload);
    } else {
      hidden.push(entry);
    }
  });
  state.hiddenAssignments = hidden;
  return mapFromEntries(visible);
}

function createSlotButton(slot) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'slot-btn';
  btn.dataset.key = slot.key;
  btn.dataset.categoryId = slot.categoryId;
  btn.dataset.slotIndex = String(slot.slotIndex);
  btn.dataset.date = slot.iso;
  btn.dataset.selected = 'false';
  btn.dataset.changed = 'false';
  const labelEl = document.createElement('span');
  labelEl.className = 'slot-label';
  const dayAbbr = DAY_ABBR[slot.dayName] || slot.dayName;
  labelEl.textContent = `${dayAbbr} · ${slot.label}`;
  const mealEl = document.createElement('span');
  mealEl.className = 'slot-meal';
  mealEl.textContent = 'No meal selected';
  btn.appendChild(labelEl);
  btn.appendChild(mealEl);
  btn._mealEl = mealEl;
  btn.addEventListener('click', () => {
    if (state.selectedSlotKey === slot.key) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot(slot.key);
    }
  });
  return btn;
}

function renderSlotColumn() {
  slotColumn.innerHTML = '';
  state.slotButtons.clear();
  if (!state.slotMetadata.size) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No meal slots are scheduled for this week.';
    slotColumn.appendChild(empty);
    return;
  }
  const groups = new Map();
  Array.from(state.slotMetadata.values())
    .sort((a, b) => {
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      if (a.categoryId !== b.categoryId) {
        const labelA = resolveCategoryLabel(a.categoryId).toLowerCase();
        const labelB = resolveCategoryLabel(b.categoryId).toLowerCase();
        if (labelA !== labelB) return labelA < labelB ? -1 : 1;
      }
      return a.slotIndex - b.slotIndex;
    })
    .forEach(slot => {
      if (!groups.has(slot.iso)) {
        groups.set(slot.iso, []);
      }
      groups.get(slot.iso).push(slot);
    });

  Array.from(groups.keys())
    .sort()
    .forEach(iso => {
      const slots = groups.get(iso) || [];
      if (!slots.length) return;
      const section = document.createElement('div');
      section.className = 'day-section';
      const heading = document.createElement('h2');
      const dayName = slots[0].dayName;
      heading.textContent = `${dayName} (${iso})`;
      section.appendChild(heading);
      const list = document.createElement('div');
      list.className = 'slot-list';
      slots.forEach(slot => {
        const btn = createSlotButton(slot);
        state.slotButtons.set(slot.key, btn);
        list.appendChild(btn);
      });
      section.appendChild(list);
      slotColumn.appendChild(section);
    });
}

function refreshSlots() {
  if (
    state.currentUserIndex == null ||
    !Number.isInteger(state.currentYear) ||
    !Number.isInteger(state.currentWeek)
  ) {
    slotColumn.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select a user to load their meal slots.';
    slotColumn.appendChild(empty);
    state.slotMetadata.clear();
    state.slotButtons.clear();
    state.baselineAssignments = new Map();
    state.workingAssignments = new Map();
    state.hiddenAssignments = [];
    setSelectedSlot(null);
    updateDirtyState();
    return;
  }
  state.slotMetadata = buildSlotMetadata(
    state.currentUserIndex,
    state.currentYear,
    state.currentWeek
  );
  const slotKeys = new Set(state.slotMetadata.keys());
  state.baselineAssignments = buildBaselineAssignments(
    state.currentUserIndex,
    state.currentYear,
    state.currentWeek,
    slotKeys
  );
  state.workingAssignments = cloneAssignmentMap(state.baselineAssignments);
  renderSlotColumn();
  state.slotButtons.forEach((_, key) => updateSlotButtonState(key));
  setSelectedSlot(null);
  updateDirtyState();
}

function onUserChange() {
  const idx = Number(userSelect.value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.users.length) {
    state.currentUserIndex = null;
  } else {
    state.currentUserIndex = idx;
  }
  refreshSlots();
}

function onYearChange() {
  const value = clampNumber(Number(yearInput.value), 2000, 2100);
  yearInput.value = value;
  state.currentYear = value;
  refreshSlots();
}

function onWeekChange() {
  const value = clampNumber(Number(weekInput.value), 1, 53);
  weekInput.value = value;
  state.currentWeek = value;
  refreshSlots();
}

async function handleSave() {
  if (!state.dirty || state.saving) return;
  if (
    state.currentUserIndex == null ||
    !Number.isInteger(state.currentYear) ||
    !Number.isInteger(state.currentWeek)
  ) {
    return;
  }
  state.saving = true;
  saveBtn.disabled = true;
  setStatus('Saving overrides...');
  try {
    const filtered = state.weeklyOverrides.filter(
      entry =>
        !(
          Number(entry.userIndex) === state.currentUserIndex &&
          Number(entry.year) === state.currentYear &&
          Number(entry.week) === state.currentWeek
        )
    );
    const preservedHidden = state.hiddenAssignments.map(entry => ({ ...entry }));
    preservedHidden.forEach(entry => {
      filtered.push(entry);
    });
    const additions = [];
    state.workingAssignments.forEach((value, key) => {
      if (!value?.mealId) return;
      const [date, categoryId, slotIndexStr] = key.split('|');
      const slotIndex = Number(slotIndexStr);
      if (!date || !categoryId || !Number.isInteger(slotIndex)) return;
      additions.push({
        id: value.overrideId || generateWeeklyMealOverrideId(),
        userIndex: state.currentUserIndex,
        year: state.currentYear,
        week: state.currentWeek,
        date,
        categoryId,
        slotIndex,
        mealId: value.mealId
      });
    });
    additions.forEach(entry => filtered.push(entry));
    await saveWeeklyMealOverrides(filtered);
    state.weeklyOverrides = filtered;
    state.baselineAssignments = cloneAssignmentMap(state.workingAssignments);
    updateDirtyState();
    setStatus('Overrides saved.', 'success');
    try {
      await calculateAndSaveMealNeeds({ resync: true });
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'inventory-updated' });
      }
    } catch (err) {
      console.warn('Meal needs recalculation failed', err);
    }
  } catch (error) {
    console.error('Failed to save overrides', error);
    setStatus('Failed to save overrides. Please try again.', 'error');
  } finally {
    state.saving = false;
    updateDirtyState();
  }
}

async function handleCopyOverridesToAllUsers() {
  if (state.copying || state.saving) return;
  if (
    state.currentUserIndex == null ||
    !Number.isInteger(state.currentYear) ||
    !Number.isInteger(state.currentWeek)
  ) {
    setStatus('Select a user, year, and week before copying overrides.', 'error');
    return;
  }
  if (!state.baselineAssignments || state.baselineAssignments.size === 0) {
    setStatus('There are no saved overrides to copy for this user.', 'info');
    return;
  }

  state.copying = true;
  updateDirtyState();
  setStatus('Copying overrides to subscribed users...');

  try {
    const year = state.currentYear;
    const week = state.currentWeek;
    const sourceUserIndex = state.currentUserIndex;
    const sourceAssignments = Array.from(state.baselineAssignments.values()).filter(
      assignment => assignment?.mealId
    );

    if (!sourceAssignments.length) {
      setStatus('There are no saved overrides to copy for this user.', 'info');
      return;
    }

    let updatedOverrides = state.weeklyOverrides.filter(Boolean);
    updatedOverrides = updatedOverrides.filter(entry => {
      if (!entry) return false;
      const entryYear = Number(entry.year);
      const entryWeek = Number(entry.week);
      const entryUser = Number(entry.userIndex);
      return !(entryYear === year && entryWeek === week && entryUser !== sourceUserIndex);
    });

    for (let userIndex = 0; userIndex < state.users.length; userIndex += 1) {
      if (userIndex === sourceUserIndex) continue;
      const slotMetadata = buildSlotMetadata(userIndex, year, week);
      if (!slotMetadata.size) continue;
      const availableKeys = new Set(slotMetadata.keys());

      sourceAssignments.forEach(assignment => {
        if (!availableKeys.has(assignment.key)) return;
        const slot = slotMetadata.get(assignment.key);
        if (!slot) return;
        const lookup = state.mealLookup.get(assignment.mealId);
        const meal = lookup?.meal;
        if (!meal) return;
        if (!isMealAvailableForUser(meal, userIndex, state.users.length)) return;
        updatedOverrides.push({
          id: generateWeeklyMealOverrideId(),
          userIndex,
          year,
          week,
          date: slot.iso,
          categoryId: slot.categoryId,
          slotIndex: slot.slotIndex,
          mealId: assignment.mealId
        });
      });
    }

    await saveWeeklyMealOverrides(updatedOverrides);
    state.weeklyOverrides = updatedOverrides;
    setStatus('Overrides copied to subscribed users.', 'success');
    try {
      await calculateAndSaveMealNeeds({ resync: true });
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'inventory-updated' });
      }
    } catch (err) {
      console.warn('Meal needs recalculation failed', err);
    }
  } catch (error) {
    console.error('Failed to copy overrides to all users', error);
    setStatus('Failed to copy overrides. Please try again.', 'error');
  } finally {
    state.copying = false;
    updateDirtyState();
  }
}

function handleClearSelection() {
  if (!state.selectedSlotKey) return;
  clearAssignment(state.selectedSlotKey);
}

async function initialize() {
  setStatus('Loading data...');
  try {
    await initializeMealCategories();
    const [users, userDayPrefs, descriptorData, slotOverrides, weeklyOverrides, mealsByCategory] =
      await Promise.all([
        loadUsers(),
        loadUserCategoryDays(),
        loadMealSlotDescriptors(),
        loadMealSlotOverrides(),
        loadWeeklyMealOverrides(),
        loadMealsByCategory()
      ]);
    state.users = Array.isArray(users) ? users : [];
    state.slotDescriptorsByCategory = descriptorData.byCategory || {};
    state.slotCounts = descriptorData.slotCounts || {};
    const { labelToId, labelsById } = buildCategoryLabelMaps(descriptorData);
    state.categoryIdByLabel = labelToId;
    state.categoryLabelsById = labelsById;
    const resolveCategoryId = rawKey =>
      resolveCategoryIdKey(rawKey, {
        labelLookup: state.categoryIdByLabel,
        descriptorsByCategory: state.slotDescriptorsByCategory
      });
    state.userDayPrefs = normalizeUserDayPrefs(userDayPrefs, state.users.length, {
      resolveCategoryId,
      labelLookup: state.categoryIdByLabel,
      labelsById: state.categoryLabelsById
    });
    state.slotOverrides = slotOverrides || [];
    state.slotOverridesByUser = buildSlotOverridesByUser(state.slotOverrides);
    state.weeklyOverrides = Array.isArray(weeklyOverrides) ? weeklyOverrides : [];
    state.mealsByCategory = mealsByCategory;
    state.mealLookup = buildMealLookup(mealsByCategory);

    userSelect.innerHTML = '';
    state.users.forEach((name, idx) => {
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = name || `User ${idx + 1}`;
      userSelect.appendChild(option);
    });

    const { year, week } = getCurrentWeekInfo();
    state.currentYear = year;
    state.currentWeek = week;
    yearInput.value = year;
    weekInput.value = week;
    if (state.users.length) {
      state.currentUserIndex = 0;
      userSelect.value = '0';
    }
    refreshSlots();
    setStatus('');
  } catch (error) {
    console.error('Failed to initialize meal scheduler', error);
    setStatus('Unable to load meal scheduler data. Please reopen the window.', 'error');
  }
}

userSelect.addEventListener('change', onUserChange);
yearInput.addEventListener('change', onYearChange);
weekInput.addEventListener('change', onWeekChange);
clearSelectionBtn.addEventListener('click', handleClearSelection);
saveBtn.addEventListener('click', handleSave);
copyAllBtn.addEventListener('click', handleCopyOverridesToAllUsers);

export const __test = {
  state,
  normalizeUserDayPrefs,
  buildCategoryLabelMaps,
  refreshSlots,
  resolveCategoryIdKey,
  buildWeekDates
};

document.addEventListener('DOMContentLoaded', initialize);
