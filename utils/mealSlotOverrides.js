import { MEAL_TYPES, loadMealsPerDay } from './mealData.js';

const STORAGE_KEY = 'mealSlotOverrides';

/**
 * Stored override schema:
 * {
 *   id: string,
 *   userIndex: number,
 *   sourceCategoryId: string,
 *   slotIndex: number,
 *   overrideCategoryId: string,
 *   days: string[]
 * }
 */
export const MEAL_SLOT_OVERRIDE_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

function createId() {
  return `override-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ordinal(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function normalizeDays(days) {
  const seen = new Set();
  if (Array.isArray(days)) {
    days.forEach(day => {
      if (MEAL_SLOT_OVERRIDE_DAYS.includes(day)) {
        seen.add(day);
      }
    });
  }
  const normalized = MEAL_SLOT_OVERRIDE_DAYS.filter(day => seen.has(day));
  const original = Array.isArray(days) ? days.join('|') : '';
  const next = normalized.join('|');
  return { value: normalized, changed: next !== original };
}

function pickCategoryId(entry) {
  if (typeof entry.sourceCategoryId === 'string' && entry.sourceCategoryId) {
    return entry.sourceCategoryId;
  }
  if (typeof entry.slotCategoryId === 'string' && entry.slotCategoryId) {
    return entry.slotCategoryId;
  }
  if (typeof entry.categoryId === 'string' && entry.categoryId) {
    return entry.categoryId;
  }
  return '';
}

function pickOverrideCategoryId(entry) {
  if (typeof entry.overrideCategoryId === 'string' && entry.overrideCategoryId) {
    return entry.overrideCategoryId;
  }
  if (typeof entry.typeId === 'string' && entry.typeId) {
    return entry.typeId;
  }
  return '';
}

function buildRoleLabel(categoryId, index) {
  const cat = MEAL_TYPES[categoryId];
  const label = cat ? cat.label || categoryId : categoryId;
  if (categoryId === 'snack' || categoryId === 'dessert') {
    return label;
  }
  return ordinal(index + 1);
}

export function buildSlotDescriptorsFromMealsPerDay(mealsPerDay = {}) {
  const categories = new Set([
    ...Object.keys(MEAL_TYPES),
    ...Object.keys(mealsPerDay || {})
  ]);
  const descriptors = [];
  const byCategory = {};
  const slotCounts = {};
  categories.forEach(categoryId => {
    if (!categoryId) return;
    const rawCount = mealsPerDay ? mealsPerDay[categoryId] : undefined;
    const parsedValue = Number.isFinite(rawCount) ? rawCount : Number(rawCount);
    const count = Number.isFinite(parsedValue) ? Math.max(0, Math.floor(parsedValue)) : 0;
    slotCounts[categoryId] = count;
    if (!byCategory[categoryId]) {
      byCategory[categoryId] = [];
    }
    const typeLabel = MEAL_TYPES[categoryId]
      ? MEAL_TYPES[categoryId].label || categoryId
      : categoryId;
    for (let i = 0; i < count; i += 1) {
      const descriptor = {
        id: `${categoryId}:${i}`,
        sourceCategoryId: categoryId,
        slotIndex: i,
        roleLabel: buildRoleLabel(categoryId, i),
        categoryLabel: typeLabel
      };
      descriptors.push(descriptor);
      byCategory[categoryId].push(descriptor);
    }
  });
  return { descriptors, byCategory, slotCounts };
}

export async function loadMealSlotDescriptors() {
  const mealsPerDay = await loadMealsPerDay();
  return buildSlotDescriptorsFromMealsPerDay(mealsPerDay);
}

function normalizeEntry(entry, slotCounts) {
  if (!entry || typeof entry !== 'object') {
    return { record: null, changed: true };
  }
  let changed = false;
  const userIndex = Number(entry.userIndex);
  if (!Number.isInteger(userIndex) || userIndex < 0) {
    return { record: null, changed: true };
  }

  const sourceCategoryId = pickCategoryId(entry);
  const overrideCategoryId = pickOverrideCategoryId(entry);
  if (!sourceCategoryId || !overrideCategoryId) {
    return { record: null, changed: true };
  }

  const availableSlots = slotCounts[sourceCategoryId] ?? 0;
  if (availableSlots <= 0) {
    return { record: null, changed: true };
  }

  const rawSlotIndex = Number(entry.slotIndex);
  if (!Number.isInteger(rawSlotIndex)) {
    return { record: null, changed: true };
  }
  let slotIndex = rawSlotIndex;
  if (slotIndex < 0) {
    slotIndex = 0;
    changed = true;
  }
  if (slotIndex >= availableSlots) {
    slotIndex = availableSlots - 1;
    changed = true;
  }

  const { value: days, changed: daysChanged } = normalizeDays(entry.days);
  if (daysChanged) {
    changed = true;
  }

  let id = typeof entry.id === 'string' && entry.id ? entry.id : '';
  if (!id) {
    id = createId();
    changed = true;
  }

  if (entry.sourceCategoryId !== sourceCategoryId || entry.slotCategoryId !== undefined || entry.categoryId !== undefined) {
    changed = true;
  }
  if (entry.overrideCategoryId !== overrideCategoryId || entry.typeId !== undefined) {
    changed = true;
  }

  const record = {
    id,
    userIndex,
    sourceCategoryId,
    slotIndex,
    overrideCategoryId,
    days
  };

  return { record, changed };
}

function sanitizeList(list, slotCounts) {
  if (!Array.isArray(list)) {
    return { entries: [], changed: true };
  }
  const entries = [];
  let changed = false;
  list.forEach(item => {
    const { record, changed: entryChanged } = normalizeEntry(item, slotCounts);
    if (record) {
      entries.push(record);
      if (entryChanged) {
        changed = true;
      }
    } else {
      changed = true;
    }
  });
  if (entries.length !== list.length) {
    changed = true;
  }
  return { entries, changed };
}

export async function loadMealSlotOverrides() {
  const { slotCounts } = await loadMealSlotDescriptors();
  const { list, hadKey, invalidType } = await new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, data => {
      const value = data[STORAGE_KEY];
      resolve({
        list: Array.isArray(value) ? value : [],
        hadKey: Object.prototype.hasOwnProperty.call(data, STORAGE_KEY),
        invalidType: value !== undefined && !Array.isArray(value)
      });
    });
  });
  const { entries, changed } = sanitizeList(list, slotCounts);
  if (!hadKey || changed || invalidType) {
    await new Promise(resolve => {
      chrome.storage.local.set({ [STORAGE_KEY]: entries }, () => resolve());
    });
  }
  return entries;
}

export async function saveMealSlotOverrides(list) {
  const { slotCounts } = await loadMealSlotDescriptors();
  const { entries } = sanitizeList(list || [], slotCounts);
  await new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: entries }, () => resolve());
  });
}

export function generateMealSlotOverrideId() {
  return createId();
}

export function normalizeOverrideDays(days) {
  return normalizeDays(days).value;
}
