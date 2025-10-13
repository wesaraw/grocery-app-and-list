import { weekNumber } from './calendarUtils.js';

const STORAGE_KEY = 'weeklyMealOverrides';

function createId() {
  return `weekly-override-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function toISODateString(date) {
  return date.toISOString().split('T')[0];
}

function normalizeDate(value) {
  if (typeof value !== 'string') {
    return { iso: null, year: null, week: null, changed: true };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { iso: null, year: null, week: null, changed: trimmed !== value };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { iso: null, year: null, week: null, changed: true };
  }
  const iso = toISODateString(parsed);
  const year = parsed.getFullYear();
  const week = weekNumber(iso);
  const changed = iso !== trimmed;
  return { iso, year, week, changed };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { record: null, changed: entry !== undefined && entry !== null };
  }
  let changed = false;

  const userIndex = Number(entry.userIndex);
  if (!Number.isInteger(userIndex) || userIndex < 0) {
    return { record: null, changed: true };
  }

  const { iso: isoDate, year, week, changed: dateChanged } = normalizeDate(entry.date);
  if (!isoDate) {
    return { record: null, changed: true };
  }
  if (dateChanged) {
    changed = true;
  }

  const categoryId =
    typeof entry.categoryId === 'string' && entry.categoryId.trim()
      ? entry.categoryId.trim()
      : '';
  if (!categoryId) {
    return { record: null, changed: true };
  }

  const rawSlotIndex = Number(entry.slotIndex);
  if (!Number.isInteger(rawSlotIndex)) {
    return { record: null, changed: true };
  }
  const slotIndex = rawSlotIndex < 0 ? 0 : rawSlotIndex;
  if (slotIndex !== rawSlotIndex) {
    changed = true;
  }

  const mealId =
    typeof entry.mealId === 'string' && entry.mealId.trim() ? entry.mealId.trim() : '';
  if (!mealId) {
    return { record: null, changed: true };
  }

  let id = typeof entry.id === 'string' && entry.id ? entry.id : '';
  if (!id) {
    id = createId();
    changed = true;
  }

  const rawWeek = Number(entry.week);
  if (!Number.isInteger(rawWeek) || rawWeek !== week) {
    changed = true;
  }

  const rawYear = Number(entry.year);
  if (!Number.isInteger(rawYear) || rawYear !== year) {
    changed = true;
  }

  const record = {
    id,
    userIndex,
    year,
    week,
    date: isoDate,
    categoryId,
    slotIndex,
    mealId
  };

  const allowedKeys = new Set([
    'id',
    'userIndex',
    'year',
    'week',
    'date',
    'categoryId',
    'slotIndex',
    'mealId'
  ]);
  Object.keys(entry).forEach(key => {
    if (!allowedKeys.has(key) && entry[key] !== undefined) {
      changed = true;
    }
  });

  return { record, changed };
}

function sanitizeList(list) {
  if (!Array.isArray(list)) {
    return { entries: [], changed: true };
  }
  const entries = [];
  const seenIds = new Set();
  let changed = false;
  list.forEach(item => {
    const { record, changed: entryChanged } = normalizeEntry(item);
    if (!record) {
      changed = true;
      return;
    }
    if (seenIds.has(record.id)) {
      changed = true;
      return;
    }
    seenIds.add(record.id);
    entries.push(record);
    if (entryChanged) {
      changed = true;
    }
  });
  if (entries.length !== list.length) {
    changed = true;
  }
  return { entries, changed };
}

export function loadWeeklyMealOverrides() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, data => {
      const raw = data[STORAGE_KEY];
      const hadKey = Object.prototype.hasOwnProperty.call(data, STORAGE_KEY);
      const invalidType = raw !== undefined && !Array.isArray(raw);
      const { entries, changed } = sanitizeList(Array.isArray(raw) ? raw : []);
      if (!hadKey || changed || invalidType) {
        chrome.storage.local.set({ [STORAGE_KEY]: entries }, () => resolve(entries));
      } else {
        resolve(entries);
      }
    });
  });
}

export function saveWeeklyMealOverrides(list) {
  const { entries } = sanitizeList(list || []);
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: entries }, () => resolve());
  });
}

function resolveUserName(userIndex, users) {
  if (Array.isArray(users) && typeof users[userIndex] === 'string' && users[userIndex]) {
    return users[userIndex];
  }
  if (Number.isInteger(userIndex)) {
    return `User ${userIndex + 1}`;
  }
  return 'User';
}

export function groupWeeklyOverridesByDateAndUser(overrides = [], users = [], options = {}) {
  const { year = null, week = null } = options || {};
  const grouped = {};
  overrides.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    if (year != null && entry.year !== year) return;
    if (week != null && entry.week !== week) return;
    const { date, userIndex, categoryId, slotIndex, mealId } = entry;
    if (!date || !categoryId || mealId == null || slotIndex == null) return;
    const userName = resolveUserName(userIndex, users);
    if (!grouped[date]) {
      grouped[date] = {};
    }
    if (!grouped[date][userName]) {
      grouped[date][userName] = {};
    }
    if (!grouped[date][userName][categoryId]) {
      grouped[date][userName][categoryId] = {};
    }
    grouped[date][userName][categoryId][slotIndex] = {
      type: 'cook',
      mealId,
      overrideId: entry.id,
      year: entry.year,
      week: entry.week,
      date: entry.date
    };
  });
  return grouped;
}

export function generateWeeklyMealOverrideId() {
  return createId();
}
