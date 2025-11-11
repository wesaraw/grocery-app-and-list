import { convert } from './uomConverter.js';
import { loadDensityMap, convertWithDensity } from './unitNormalize.js';
import { roundQuantity } from './quantityFormat.js';

export function parseQuantity(str) {
  if (!str) return { value: 0, unit: null };
  const text = str.trim().toLowerCase();
  if (/^(?:just\s+a\s+)?pinch(?:\b|\s|$)/i.test(text)) {
    return { value: 1 / 16, unit: 'tsp' };
  }
  const m = text.match(/^([\d.]+(?:\/\d+)?)\s*([a-zA-Z-]+)?/);
  if (!m) return { value: 0, unit: null };
  let numStr = m[1];
  let value;
  const frac = numStr.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    value = !isNaN(num) && !isNaN(den) && den !== 0 ? num / den : 0;
  } else {
    value = parseFloat(numStr);
  }
  if (isNaN(value)) value = 0;
  let unit = m[2] ? m[2].toLowerCase() : null;
  if (!unit) unit = 'ea';
  return { value, unit };
}

export function getMealPortionCount(meal) {
  if (!meal || typeof meal !== 'object') {
    return 1;
  }
  const raw = meal.totalPortions;
  if (raw == null || raw === '') {
    return 1;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_INDEX = WEEKDAY_NAMES.reduce((map, name, idx) => {
  map[name.toLowerCase()] = idx;
  map[name.slice(0, 3).toLowerCase()] = idx;
  return map;
}, {});

function parseISODateString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const utcTime = Date.UTC(year, month - 1, day);
  const date = new Date(utcTime);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, utcTime };
}

function formatISODateFromUTC(utcTime) {
  const d = new Date(utcTime);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function normalizePrepDayList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(day => {
    if (typeof day !== 'string') return;
    const trimmed = day.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const idx = WEEKDAY_INDEX[key];
    if (idx == null || seen.has(idx)) return;
    seen.add(idx);
    result.push(WEEKDAY_NAMES[idx]);
  });
  result.sort((a, b) => WEEKDAY_INDEX[a.toLowerCase()] - WEEKDAY_INDEX[b.toLowerCase()]);
  return result;
}

export function resolveNextPrepWindow(cookingDays = {}, startDate = null) {
  const prepDays = normalizePrepDayList(cookingDays.prepDay);
  if (!prepDays.length) {
    return { prepDays, endDate: null };
  }
  const parsedStart = parseISODateString(startDate);
  if (!parsedStart) {
    return { prepDays, endDate: null };
  }
  const startDay = new Date(parsedStart.utcTime).getUTCDay();
  const prepDayIndexes = new Set(prepDays.map(day => WEEKDAY_INDEX[day.toLowerCase()]));
  const MS_PER_DAY = 86400000;
  for (let offset = 1; offset <= 7; offset += 1) {
    const dayIndex = (startDay + offset) % 7;
    if (prepDayIndexes.has(dayIndex)) {
      return { prepDays, endDate: formatISODateFromUTC(parsedStart.utcTime + offset * MS_PER_DAY) };
    }
  }
  return { prepDays, endDate: null };
}

export function weekNumber(dateStr) {
  const parsed = parseISODateString(dateStr);
  if (!parsed) return Number.NaN;
  const { year, utcTime } = parsed;
  const start = new Date(Date.UTC(year, 0, 1));
  const diffDays = (utcTime - start.getTime()) / 86400000;
  return Math.ceil(((diffDays + start.getUTCDay() + 1) / 7));
}

export function buildMealMap(mealsByCategory) {
  const map = new Map();
  Object.values(mealsByCategory || {}).forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(m => {
      if (!m) return;
      map.set(m.id || m.name, m);
    });
  });
  return map;
}

export function normalizeCalendarEntry(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const id = value.trim();
    if (!id) return null;
    return { mealId: id, type: 'cook', leftoverTargets: [], leftoverSource: null };
  }
  if (typeof value === 'object') {
    const mealId = value.mealId || value.id || value.name || null;
    if (!mealId) return null;
    const type = value.type === 'leftover' ? 'leftover' : 'cook';
    const leftoverTargets = Array.isArray(value.leftoverTargets)
      ? value.leftoverTargets
          .map(target =>
            target && typeof target === 'object'
              ? {
                  date: target.date || null,
                  categoryId: target.categoryId || null,
                  slot:
                    target.slot != null && Number.isFinite(Number(target.slot))
                      ? Number(target.slot)
                      : null
                }
              : null
          )
          .filter(target => target && target.date)
      : [];
    const leftoverSource =
      value.leftoverSource && typeof value.leftoverSource === 'object'
        ? {
            date: value.leftoverSource.date || null,
            categoryId: value.leftoverSource.categoryId || null,
            slot:
              value.leftoverSource.slot != null &&
              Number.isFinite(Number(value.leftoverSource.slot))
                ? Number(value.leftoverSource.slot)
                : null
          }
        : null;
    return { mealId, type, leftoverTargets, leftoverSource };
  }
  return null;
}

export function expandCalendarValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeCalendarEntry(item))
      .filter(entry => entry != null);
  }
  const entry = normalizeCalendarEntry(value);
  return entry ? [entry] : [];
}

export function aggregateCalendar(
  calendar = {},
  mealsByCategory = {},
  needsMap = new Map(),
  densityMap = {},
  perUser = false,
  userMultipliers = [],
  userIndexLookup = null,
  startDate = null,
  endDate = null
) {
  const mealMap = buildMealMap(mealsByCategory);
  const result = new Map();
  const parsedStartDate =
    typeof startDate === 'string' ? parseISODateString(startDate) : null;
  const startUtcTime = parsedStartDate ? parsedStartDate.utcTime : null;
  const parsedEndDate = typeof endDate === 'string' ? parseISODateString(endDate) : null;
  const endUtcTime = parsedEndDate ? parsedEndDate.utcTime : null;

  function resolveMultiplier(key) {
    if (userMultipliers == null) return 1;
    if (userMultipliers instanceof Map) {
      const val = userMultipliers.get(key);
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    } else if (Array.isArray(userMultipliers)) {
      const idx = Number(key);
      if (Number.isInteger(idx)) {
        const val = userMultipliers[idx];
        if (typeof val === 'number' && Number.isFinite(val)) return val;
      }
    } else if (typeof userMultipliers === 'object') {
      const val = userMultipliers[key];
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    }
    return 1;
  }

  function resolveUserIndex(key) {
    if (userIndexLookup instanceof Map) {
      const idx = userIndexLookup.get(key);
      return Number.isInteger(idx) ? idx : undefined;
    }
    if (userIndexLookup && typeof userIndexLookup === 'object') {
      const idx = userIndexLookup[key];
      if (Number.isInteger(idx)) return idx;
    }
    const numeric = Number(key);
    return Number.isInteger(numeric) ? numeric : undefined;
  }

  function resolveMealMultiplier(meal, idx, base) {
    if (!Number.isInteger(idx) || !meal || !Array.isArray(meal.userPortionOverrides)) {
      return base;
    }
    const override = meal.userPortionOverrides[idx];
    return typeof override === 'number' && Number.isFinite(override) ? override : base;
  }

  Object.entries(calendar).forEach(([userKey, days]) => {
    const baseMultiplier = resolveMultiplier(userKey);
    const userIndex = resolveUserIndex(userKey);
    Object.entries(days || {}).forEach(([dateStr, rec]) => {
      const parsedDate = parseISODateString(dateStr);
      if (!parsedDate) return;
      if (startUtcTime != null && parsedDate.utcTime < startUtcTime) {
        return;
      }
      if (endUtcTime != null && parsedDate.utcTime > endUtcTime) {
        return;
      }
      const week = weekNumber(dateStr);
      Object.values(rec || {}).forEach(val => {
        const entries = expandCalendarValue(val);
        entries.forEach(entry => {
          if (!entry) return;
          if (entry.type !== 'cook') return;
          const meal = mealMap.get(entry.mealId);
          if (!meal) return;
          const userMultiplier = resolveMealMultiplier(meal, userIndex, baseMultiplier);
          const leftoverCount = Array.isArray(entry.leftoverTargets)
            ? entry.leftoverTargets.length
            : 0;
          const leftoverFactor = 1 + leftoverCount;
          if (leftoverFactor <= 0) return;
          const effectiveMultiplier = userMultiplier * leftoverFactor;
          const mult = perUser ? meal.multiplier ?? 1 : meal.people ?? meal.multiplier ?? 1;
          const portionCount = getMealPortionCount(meal);
          (meal.ingredients || []).forEach(ing => {
            const { value, unit } = parseQuantity(ing.serving_size || ing.amount);
            if (!value) return;
            let qty = value;
            const target = needsMap.get(ing.name);
            if (unit && target && unit !== target) {
              const info = densityMap[ing.name] || {};
              qty = convertWithDensity(value, unit, target, {
                convert_volume_to_weight: info.convert,
                custom_density_ratio: info.ratio
              });
            }
            let arr = result.get(ing.name);
            if (!arr) {
              arr = Array(53).fill(0);
              result.set(ing.name, arr);
            }
            const perPortionQty = qty / portionCount;
            arr[week] += perPortionQty * mult * effectiveMultiplier;
            arr[week] = roundQuantity(arr[week]);
          });
        });
      });
    });
  });
  return result; // Map of ingredient -> weekly qty array
}
