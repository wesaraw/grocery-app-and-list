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
  const result = { slots: [], prepSlots: [] };
  if (value && typeof value === 'object') {
    if (Array.isArray(value.slots)) {
      result.slots = value.slots.map(slot => (Array.isArray(slot) ? slot.slice() : []));
      if (Array.isArray(value.prepSlots)) {
        result.prepSlots = value.prepSlots.map(prep => (Array.isArray(prep) ? prep.slice() : []));
      } else if (Array.isArray(value.prepDays)) {
        const prepDays = value.prepDays.slice();
        result.prepSlots = result.slots.map(() => prepDays.slice());
      }
      return result;
    }
    if (Array.isArray(value.slotDays)) {
      result.slots = value.slotDays.map(slot => (Array.isArray(slot) ? slot.slice() : []));
      if (Array.isArray(value.prepSlots)) {
        result.prepSlots = value.prepSlots.map(prep => (Array.isArray(prep) ? prep.slice() : []));
      } else if (Array.isArray(value.prepDays)) {
        const prepDays = value.prepDays.slice();
        result.prepSlots = result.slots.map(() => prepDays.slice());
      }
      return result;
    }
  }
  if (Array.isArray(value)) {
    result.slots = [value.slice()];
    return result;
  }
  if (value && typeof value === 'object' && Array.isArray(value.days)) {
    result.slots = [value.days.slice()];
    if (Array.isArray(value.prepDays)) {
      result.prepSlots = [value.prepDays.slice()];
    }
    return result;
  }
  const count = clampDayCount(value);
  if (count > 0) {
    result.slots = [VALID_DAYS.slice(0, count)];
  }
  return result;
}

function normalizeSlotEntry(value) {
  const source = extractSlotSource(value);
  if (!source.slots.length) {
    return {
      slots: [],
      prepSlots: [],
      union: [],
      prepUnion: [],
      slotSets: [],
      prepSlotSets: [],
      unionSet: new Set(),
      prepUnionSet: new Set(),
      rawLength: 0
    };
  }
  const slots = source.slots.map(slot => normalizeDayList(slot));
  const slotSets = slots.map(slot => new Set(slot));
  const prepSlots = slots.map((slot, idx) => {
    const slotSet = slotSets[idx];
    const rawPrep = Array.isArray(source.prepSlots[idx]) ? source.prepSlots[idx] : [];
    const normalizedPrep = normalizeDayList(rawPrep);
    return normalizedPrep.filter(day => slotSet.has(day));
  });
  const prepSlotSets = prepSlots.map(prep => new Set(prep));
  const unionSet = new Set();
  slots.forEach(slot => {
    slot.forEach(day => unionSet.add(day));
  });
  const union = normalizeDayList(Array.from(unionSet));
  const prepUnionSet = new Set();
  prepSlots.forEach(prep => {
    prep.forEach(day => {
      if (unionSet.has(day)) {
        prepUnionSet.add(day);
      }
    });
  });
  const prepUnion = normalizeDayList(Array.from(prepUnionSet));
  return {
    slots,
    prepSlots,
    union,
    prepUnion,
    slotSets,
    prepSlotSets,
    unionSet,
    prepUnionSet,
    rawLength: source.slots.length
  };
}

function buildDecoratedValue(entry) {
  const decorated = entry.union.slice();
  decorated.slots = entry.slots.map(slot => slot.slice());
  decorated.prepSlots = entry.prepSlots.map(prep => prep.slice());
  decorated.prepDays = entry.prepUnion.slice();
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
  const storedPrepSlots = Array.isArray(value.prepSlots) ? value.prepSlots : null;
  if (!storedPrepSlots) {
    return entry.prepSlots.every(prep => prep.length === 0);
  }
  if (storedPrepSlots.length !== entry.prepSlots.length) {
    return false;
  }
  for (let i = 0; i < entry.prepSlots.length; i += 1) {
    const storedPrep = Array.isArray(storedPrepSlots[i]) ? storedPrepSlots[i] : [];
    const normalizedPrep = entry.prepSlots[i];
    if (storedPrep.length !== normalizedPrep.length) {
      return false;
    }
    for (let j = 0; j < normalizedPrep.length; j += 1) {
      if (storedPrep[j] !== normalizedPrep[j]) {
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
      slots: normalized.slots.map(slot => slot.slice()),
      prepSlots: normalized.prepSlots.map(prep => prep.slice())
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
      slots: normalized.slots.map(slot => slot.slice()),
      prepSlots: normalized.prepSlots.map(prep => prep.slice())
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
