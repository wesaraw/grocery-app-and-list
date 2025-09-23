import { MEAL_SLOT_OVERRIDE_DAYS } from './mealSlotOverrides.js';

const VALID_DAYS = Array.isArray(MEAL_SLOT_OVERRIDE_DAYS)
  ? MEAL_SLOT_OVERRIDE_DAYS
  : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const VALID_DAY_SET = new Set(VALID_DAYS);
const DAY_ORDER = new Map(VALID_DAYS.map((day, idx) => [day, idx]));

function clampDayCount(value) {
  if (value == null) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  return Math.min(VALID_DAYS.length, Math.round(numeric));
}

function normalizeDayList(list) {
  const seen = new Set();
  const normalized = [];
  if (Array.isArray(list)) {
    list.forEach(day => {
      if (VALID_DAY_SET.has(day) && !seen.has(day)) {
        seen.add(day);
        normalized.push(day);
      }
    });
  }
  normalized.sort((a, b) => (DAY_ORDER.get(a) || 0) - (DAY_ORDER.get(b) || 0));
  return normalized;
}

function extractSlotSource(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.slots)) {
      return value.slots.map(slot => (Array.isArray(slot) ? slot.slice() : []));
    }
    if (Array.isArray(value.slotDays)) {
      return value.slotDays.map(slot => (Array.isArray(slot) ? slot.slice() : []));
    }
  }
  if (Array.isArray(value)) {
    return [value.slice()];
  }
  if (value && typeof value === 'object' && Array.isArray(value.days)) {
    return [value.days.slice()];
  }
  const count = clampDayCount(value);
  if (count > 0) {
    return [VALID_DAYS.slice(0, count)];
  }
  return [];
}

function normalizeSlotEntry(value) {
  const rawSlots = extractSlotSource(value);
  if (!rawSlots.length) {
    return { slots: [], union: [], slotSets: [], unionSet: new Set(), rawLength: 0 };
  }
  const slots = rawSlots.map(slot => normalizeDayList(slot));
  const slotSets = slots.map(slot => new Set(slot));
  const unionSet = new Set();
  slots.forEach(slot => {
    slot.forEach(day => unionSet.add(day));
  });
  const union = normalizeDayList(Array.from(unionSet));
  return {
    slots,
    union,
    slotSets,
    unionSet,
    rawLength: rawSlots.length
  };
}

function buildDecoratedValue(entry) {
  const decorated = entry.union.slice();
  decorated.slots = entry.slots.map(slot => slot.slice());
  return decorated;
}

function isCanonicalValue(value, entry) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.slots)) {
    return false;
  }
  if (value.slots.length !== entry.slots.length) {
    return false;
  }
  for (let i = 0; i < entry.slots.length; i += 1) {
    const stored = Array.isArray(value.slots[i]) ? value.slots[i] : [];
    const normalized = entry.slots[i];
    if (stored.length !== normalized.length) {
      return false;
    }
    for (let j = 0; j < normalized.length; j += 1) {
      if (stored[j] !== normalized[j]) {
        return false;
      }
    }
  }
  return true;
}

function normalizeRecord(record) {
  const decorated = {};
  const canonical = {};
  let changed = false;
  if (!record || typeof record !== 'object') {
    return { decorated, canonical, changed: record !== undefined && record !== null };
  }
  Object.entries(record).forEach(([category, value]) => {
    const normalized = normalizeSlotEntry(value);
    if (!normalized.rawLength) {
      if (value !== undefined) changed = true;
      return;
    }
    canonical[category] = {
      slots: normalized.slots.map(slot => slot.slice())
    };
    decorated[category] = buildDecoratedValue(normalized);
    if (!isCanonicalValue(value, normalized)) {
      changed = true;
    }
  });
  const inputKeys = Object.keys(record);
  const canonicalKeys = Object.keys(canonical);
  if (!changed && inputKeys.length !== canonicalKeys.length) {
    changed = true;
  }
  return { decorated, canonical, changed };
}

function normalizeForSave(record) {
  if (!record || typeof record !== 'object') {
    return {};
  }
  const canonical = {};
  Object.entries(record).forEach(([category, value]) => {
    const normalized = normalizeSlotEntry(value);
    if (!normalized.rawLength) return;
    canonical[category] = {
      slots: normalized.slots.map(slot => slot.slice())
    };
  });
  return canonical;
}

export function loadUsers() {
  return new Promise(resolve => {
    chrome.storage.local.get('users', data => {
      if (Array.isArray(data.users) && data.users.length) {
        resolve(data.users);
      } else {
        const defaultUsers = Array.from({ length: 5 }, (_, i) => `User ${i + 1}`);
        resolve(defaultUsers);
      }
    });
  });
}

export function saveUsers(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ users: arr }, () => resolve());
  });
}

export function loadUserCategoryDays() {
  return new Promise(resolve => {
    chrome.storage.local.get('userCategoryDays', data => {
      const raw = Array.isArray(data.userCategoryDays) ? data.userCategoryDays : [];
      const decorated = [];
      const canonical = [];
      let changed = false;
      raw.forEach(record => {
        const { decorated: deco, canonical: norm, changed: recChanged } = normalizeRecord(record);
        decorated.push(deco);
        canonical.push(norm);
        if (recChanged) changed = true;
      });
      if (changed) {
        chrome.storage.local.set({ userCategoryDays: canonical }, () => resolve(decorated));
      } else {
        resolve(decorated);
      }
    });
  });
}

export function saveUserCategoryDays(arr) {
  const normalized = Array.isArray(arr) ? arr.map(normalizeForSave) : [];
  return new Promise(resolve => {
    chrome.storage.local.set({ userCategoryDays: normalized }, () => resolve());
  });
}

export function loadUserPriceThresholds() {
  return new Promise(resolve => {
    chrome.storage.local.get('userPriceThresholds', data => {
      resolve(data.userPriceThresholds || {});
    });
  });
}

export function saveUserPriceThresholds(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set({ userPriceThresholds: obj }, () => resolve());
  });
}

export function loadUserPortionMultipliers() {
  return new Promise(resolve => {
    chrome.storage.local.get('userPortionMultipliers', data => {
      const arr = Array.isArray(data.userPortionMultipliers)
        ? data.userPortionMultipliers.map(val =>
            typeof val === 'number' && Number.isFinite(val) ? val : 1
          )
        : [];
      resolve(arr);
    });
  });
}

export function saveUserPortionMultipliers(arr) {
  const sanitized = Array.isArray(arr)
    ? arr.map(val => (typeof val === 'number' && Number.isFinite(val) ? val : 1))
    : [];
  return new Promise(resolve => {
    chrome.storage.local.set({ userPortionMultipliers: sanitized }, () => resolve());
  });
}
