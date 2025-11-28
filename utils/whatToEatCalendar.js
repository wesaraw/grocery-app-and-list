import { isItemInSeason } from './seasonData.js';
import { normalizeCalendarEntry } from './calendarUtils.js';

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item));
  }
  if (value && typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      result[key] = cloneValue(val);
    });
    return result;
  }
  return value;
}

function toISODateString(date) {
  return date.toISOString().split('T')[0];
}

const DEFAULT_MAX_NUTRIENT_SCORE = 10;
const NUTRIENT_SCORE_TOLERANCE = 0.0001;

function cloneNutrientScoreMetadata(score) {
  if (!score || typeof score !== 'object') {
    return null;
  }
  const total = Number(
    score.total != null ? score.total : score.totalPoints != null ? score.totalPoints : null
  );
  const perNutrient = {};
  Object.entries(score.perNutrient || {}).forEach(([key, value]) => {
    if (!key) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      perNutrient[key] = numeric;
    }
  });
  const hasPerNutrient = Object.keys(perNutrient).length > 0;
  const hasTotal = Number.isFinite(total);
  if (!hasPerNutrient && !hasTotal) {
    return null;
  }
  const result = {};
  if (hasTotal) {
    result.total = total;
  }
  if (hasPerNutrient) {
    result.perNutrient = perNutrient;
  }
  return result;
}

function buildMealLookupFromSubscriptions(subscriptions = {}) {
  const lookup = new Map();
  Object.values(subscriptions || {}).forEach(prefs => {
    Object.values(prefs || {}).forEach(meals => {
      (meals || []).forEach(meal => {
        if (!meal || typeof meal !== 'object') return;
        if (meal.id != null) {
          lookup.set(`id:${String(meal.id)}`, meal);
        }
        if (meal.name) {
          lookup.set(`name:${meal.name}`, meal);
        }
      });
    });
  });
  return lookup;
}

function buildNutrientGoalConfig(targetLookup = {}, options = {}) {
  if (!targetLookup || typeof targetLookup !== 'object') {
    return null;
  }
  const entries = Object.values(targetLookup).filter(
    entry => entry && entry.key
  );
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
      label: entry.label || key,
      rank: clampedRank,
      multiplier,
      goalPoints
    };
    orderedKeys.push(key);
  });
  if (!orderedKeys.length) return null;
  return {
    orderedKeys,
    goalsByKey,
    totalNutrients: orderedKeys.length,
    maxPointsPerNutrient: maxPoints
  };
}

function normalizeForcedDay(dayValue) {
  const result = {};
  if (!dayValue || typeof dayValue !== 'object') return result;
  Object.entries(dayValue).forEach(([categoryId, slotValue]) => {
    if (typeof categoryId === 'string' && categoryId.startsWith('_')) {
      return;
    }
    if (Array.isArray(slotValue)) {
      result[categoryId] = slotValue.map(item =>
        item == null ? null : normalizeCalendarEntry(item)
      );
    } else if (slotValue == null) {
      result[categoryId] = [null];
    } else {
      result[categoryId] = [normalizeCalendarEntry(slotValue)];
    }
  });
  return result;
}

function cloneForcedEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    return normalizeCalendarEntry(entry);
  }
  if (typeof entry === 'object') {
    const normalized = normalizeCalendarEntry(entry);
    if (!normalized) return null;
    const extra = {};
    Object.keys(entry).forEach(key => {
      if (!['mealId', 'type', 'leftoverTargets', 'leftoverSource'].includes(key)) {
        extra[key] = entry[key];
      }
    });
    return { ...normalized, ...extra };
  }
  return null;
}

function normalizeForcedCategorySlots(slotValue) {
  const slotMap = {};
  if (Array.isArray(slotValue)) {
    slotValue.forEach((entry, idx) => {
      if (entry === null) {
        slotMap[idx] = null;
        return;
      }
      const cloned = cloneForcedEntry(entry);
      if (cloned) {
        slotMap[idx] = cloned;
      }
    });
    return slotMap;
  }
  if (slotValue && typeof slotValue === 'object') {
    const keys = Object.keys(slotValue);
    const hasNumericKey = keys.some(key => !Number.isNaN(Number(key)));
    if (hasNumericKey) {
      keys.forEach(key => {
        const value = slotValue[key];
        if (value === null) {
          slotMap[key] = null;
          return;
        }
        const cloned = cloneForcedEntry(value);
        if (cloned) {
          slotMap[key] = cloned;
        }
      });
      return slotMap;
    }
    const cloned = cloneForcedEntry(slotValue);
    if (cloned) {
      slotMap[0] = cloned;
    } else if (slotValue === null) {
      slotMap[0] = null;
    }
    return slotMap;
  }
  if (slotValue === null) {
    slotMap[0] = null;
    return slotMap;
  }
  const cloned = cloneForcedEntry(slotValue);
  if (cloned) {
    slotMap[0] = cloned;
  }
  return slotMap;
}

function normalizeForcedUserEntry(entry) {
  const result = {};
  if (!entry || typeof entry !== 'object') {
    return result;
  }
  Object.entries(entry).forEach(([categoryId, slotValue]) => {
    const slotMap = normalizeForcedCategorySlots(slotValue);
    if (Object.keys(slotMap).length) {
      result[categoryId] = slotMap;
    } else if (slotValue != null) {
      result[categoryId] = {};
    }
  });
  return result;
}

function mergeForcedUserEntries(target, source) {
  if (!source || typeof source !== 'object') return;
  Object.entries(source).forEach(([categoryId, slotMap]) => {
    if (!target[categoryId]) {
      target[categoryId] = {};
    }
    const categoryTarget = target[categoryId];
    if (!slotMap || typeof slotMap !== 'object') return;
    Object.entries(slotMap).forEach(([slotKey, entry]) => {
      if (entry === null) {
        categoryTarget[slotKey] = null;
        return;
      }
      const cloned = cloneForcedEntry(entry);
      if (cloned) {
        categoryTarget[slotKey] = cloned;
      }
    });
  });
}

function incrementDateStr(dateStr) {
  if (!dateStr) return null;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + 1);
  return toISODateString(dt);
}

function serializeEntry(entry) {
  if (entry == null) return null;
  const nutrientScore = cloneNutrientScoreMetadata(entry.nutrientScore);
  if (entry.type === 'leftover') {
    return {
      type: 'leftover',
      mealId: entry.mealId,
      leftoverSource: entry.leftoverSource ? { ...entry.leftoverSource } : null,
      ...(nutrientScore ? { nutrientScore } : {})
    };
  }
  const targets = Array.isArray(entry.leftoverTargets)
    ? entry.leftoverTargets.map(t => ({ ...t }))
    : [];
  if (!targets.length && !nutrientScore) {
    return entry.mealId;
  }
  return {
    type: 'cook',
    mealId: entry.mealId,
    leftoverTargets: targets,
    ...(nutrientScore ? { nutrientScore } : {})
  };
}

function buildAllowedMealIdSet(meals) {
  const set = new Set();
  if (!Array.isArray(meals)) return set;
  meals.forEach(meal => {
    if (!meal) return;
    const { id, name } = meal;
    if (id !== undefined && id !== null) {
      set.add(id);
      set.add(String(id));
    }
    if (name != null && name !== '') {
      set.add(name);
    }
  });
  return set;
}

export function buildAllowedMealLookup(subscriptions = {}) {
  const result = {};
  if (!subscriptions || typeof subscriptions !== 'object') {
    return result;
  }
  Object.entries(subscriptions).forEach(([user, prefs]) => {
    if (!prefs || typeof prefs !== 'object') return;
    const userMap = {};
    Object.entries(prefs).forEach(([categoryId, meals]) => {
      const set = buildAllowedMealIdSet(meals);
      if (set.size) {
        userMap[categoryId] = set;
      }
    });
    if (Object.keys(userMap).length) {
      result[user] = userMap;
    }
  });
  return result;
}

function isMealAllowed(allowedSet, mealId) {
  if (!allowedSet || allowedSet.size === 0) return false;
  if (allowedSet.has(mealId)) return true;
  if (mealId != null) {
    const str = String(mealId);
    if (allowedSet.has(str)) return true;
  }
  return false;
}

function filterCalendarEntryForAllowed(entry, allowedSet) {
  if (entry == null) return null;
  const normalized = normalizeCalendarEntry(entry);
  if (!normalized) return null;
  if (normalized.type === 'cook') {
    if (!isMealAllowed(allowedSet, normalized.mealId)) {
      return null;
    }
  }
  return serializeEntry(normalized);
}

function filterCalendarValueByAllowed(value, allowedSet) {
  if (Array.isArray(value)) {
    const filtered = value.map(item => filterCalendarEntryForAllowed(item, allowedSet));
    const keep = filtered.some(item => item != null);
    if (!keep) {
      return { keep: false, value: null };
    }
    return {
      keep: true,
      value: filtered.map(item => (item == null ? null : item))
    };
  }
  if (value == null) {
    return { keep: false, value: null };
  }
  if (typeof value === 'string') {
    const filtered = filterCalendarEntryForAllowed(value, allowedSet);
    if (!filtered) {
      return { keep: false, value: null };
    }
    return { keep: true, value: filtered };
  }
  if (typeof value === 'object') {
    const isEntry =
      value.mealId != null || value.id != null || value.name != null || value.type != null;
    if (isEntry) {
      const filtered = filterCalendarEntryForAllowed(value, allowedSet);
      if (!filtered) {
        return { keep: false, value: null };
      }
      return { keep: true, value: filtered };
    }
    const keys = Object.keys(value);
    const next = {};
    let hasAny = false;
    keys.forEach(key => {
      const { keep, value: filtered } = filterCalendarValueByAllowed(value[key], allowedSet);
      if (keep) {
        next[key] = filtered;
        hasAny = true;
      }
    });
    return hasAny ? { keep: true, value: next } : { keep: false, value: null };
  }
  return { keep: false, value: null };
}

export function filterCalendarDayByAllowedMeals(dayValue, allowedCategories = null) {
  if (dayValue == null) return null;
  if (Array.isArray(dayValue)) {
    const { keep, value } = filterCalendarValueByAllowed(dayValue, allowedCategories);
    return keep ? value : null;
  }
  if (typeof dayValue !== 'object') {
    return null;
  }
  const result = {};
  let hasValues = false;
  Object.entries(dayValue).forEach(([categoryId, value]) => {
    if (typeof categoryId === 'string' && categoryId.startsWith('_')) {
      result[categoryId] = cloneValue(value);
      return;
    }
    const allowedSet = allowedCategories ? allowedCategories[categoryId] : null;
    const { keep, value: filtered } = filterCalendarValueByAllowed(value, allowedSet);
    if (keep) {
      result[categoryId] = filtered;
      hasValues = true;
    }
  });
  return hasValues || Object.keys(result).some(key => key.startsWith('_')) ? result : null;
}

export function generateWhatToEatCalendar(
  users,
  preparedCal,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  weeks = 4,
  priceThresholds = {},
  itemSeasons = {},
  slotOverrides = {},
  weeklyOverrides = null,
  options = {}
) {
  const {
    previousCalendar = null,
    freezeBefore = null,
    initialState = null,
    nutritionTargets = null,
    nutrientScoreOptions = null
  } = options || {};

  const freezeBeforeStr =
    typeof freezeBefore === 'string' && freezeBefore ? freezeBefore : null;

  const allowedMealsByUser = buildAllowedMealLookup(subscriptions);
  const nutrientGoalConfig = buildNutrientGoalConfig(
    nutritionTargets,
    nutrientScoreOptions
  );
  const mealLookup = buildMealLookupFromSubscriptions(subscriptions);
  const mealNutrientCache = new WeakMap();
  const dayNutritionStateByUser = {};

  function resolveMealFromLookup(mealId) {
    if (mealId == null) return null;
    const idKey = `id:${String(mealId)}`;
    const nameKey = `name:${String(mealId)}`;
    return mealLookup.get(idKey) || mealLookup.get(nameKey) || null;
  }

  function ensureNutrientDayState(user, dateStr) {
    if (!nutrientGoalConfig) return null;
    if (!dayNutritionStateByUser[user]) {
      dayNutritionStateByUser[user] = {};
    }
    const userState = dayNutritionStateByUser[user];
    if (!userState[dateStr]) {
      const totals = {};
      const remaining = {};
      nutrientGoalConfig.orderedKeys.forEach(key => {
        const goal = nutrientGoalConfig.goalsByKey[key];
        totals[key] = 0;
        remaining[key] = goal?.goalPoints || 0;
      });
      userState[dateStr] = { totals, remaining };
    }
    return userState[dateStr];
  }

  function buildNutrientSummaryFromState(dayState) {
    if (!nutrientGoalConfig || !dayState) {
      return null;
    }
    const perNutrient = {};
    nutrientGoalConfig.orderedKeys.forEach(key => {
      const goalPoints = nutrientGoalConfig.goalsByKey[key]?.goalPoints || 0;
      const total = Math.max(0, Math.min(goalPoints, dayState.totals[key] || 0));
      perNutrient[key] = {
        goal: goalPoints,
        achieved: total
      };
    });
    return {
      orderedKeys: nutrientGoalConfig.orderedKeys.slice(),
      perNutrient,
      totalNutrients: nutrientGoalConfig.totalNutrients,
      maxPointsPerNutrient: nutrientGoalConfig.maxPointsPerNutrient
    };
  }

  function getMealNutrientVector(meal) {
    if (!nutrientGoalConfig || !meal) return null;
    if (mealNutrientCache.has(meal)) {
      return mealNutrientCache.get(meal);
    }
    const perNutrient = {};
    let total = 0;
    const perServingScores = meal?.nutritionTotals?.nutrientScores?.perServing || {};
    nutrientGoalConfig.orderedKeys.forEach(key => {
      const goal = nutrientGoalConfig.goalsByKey[key];
      if (!goal) {
        perNutrient[key] = 0;
        return;
      }
      const entry = perServingScores[key];
      const rawPoints = Number(entry?.points);
      const capped = Number.isFinite(rawPoints)
        ? Math.max(0, Math.min(nutrientGoalConfig.maxPointsPerNutrient, rawPoints))
        : 0;
      const weighted = capped * goal.multiplier;
      perNutrient[key] = weighted;
      total += weighted;
    });
    const vector = { perNutrient, total };
    mealNutrientCache.set(meal, vector);
    return vector;
  }

  function computeAppliedPoints(vector, dayState) {
    if (!nutrientGoalConfig || !vector || !dayState) {
      return { total: 0, perNutrient: {} };
    }
    const perNutrient = {};
    let total = 0;
    nutrientGoalConfig.orderedKeys.forEach(key => {
      const raw = vector.perNutrient[key] || 0;
      if (raw <= 0) {
        perNutrient[key] = 0;
        return;
      }
      const remaining =
        dayState.remaining[key] != null
          ? dayState.remaining[key]
          : nutrientGoalConfig.goalsByKey[key]?.goalPoints || 0;
      const applied = Math.min(raw, remaining);
      perNutrient[key] = applied;
      total += applied;
    });
    return { total, perNutrient };
  }

  function scoreMealForDay(user, dateStr, meal) {
    if (!nutrientGoalConfig || !meal) {
      return { total: 0, perNutrient: {} };
    }
    const dayState = ensureNutrientDayState(user, dateStr);
    if (!dayState) {
      return { total: 0, perNutrient: {} };
    }
    const vector = getMealNutrientVector(meal);
    if (!vector) {
      return { total: 0, perNutrient: {} };
    }
    return computeAppliedPoints(vector, dayState);
  }

  function applyMealNutrition(user, dateStr, meal) {
    if (!nutrientGoalConfig || !meal) return null;
    const dayState = ensureNutrientDayState(user, dateStr);
    if (!dayState) return null;
    const vector = getMealNutrientVector(meal);
    if (!vector) return null;
    const applied = computeAppliedPoints(vector, dayState);
    Object.entries(applied.perNutrient || {}).forEach(([key, value]) => {
      const numeric = Number(value) || 0;
      if (numeric <= 0) return;
      dayState.totals[key] = (dayState.totals[key] || 0) + numeric;
      const goalPoints = nutrientGoalConfig.goalsByKey[key]?.goalPoints || 0;
      const remaining = goalPoints - dayState.totals[key];
      dayState.remaining[key] = remaining > 0 ? remaining : 0;
    });
    return applied;
  }

  let snapshotBase = null;
  if (initialState && typeof initialState === 'object') {
    if (
      initialState.freezeSnapshot &&
      initialState.freezeSnapshot.asOfDate === freezeBeforeStr
    ) {
      snapshotBase = initialState.freezeSnapshot;
    } else if (initialState.asOfDate === freezeBeforeStr) {
      snapshotBase = initialState;
    }
  }

  let nonPrepState = cloneValue(snapshotBase?.nonPrepState || {});
  let sharedGroupState = cloneValue(snapshotBase?.sharedGroupState || {});
  let leftoverCarry = cloneValue(snapshotBase?.leftoverCarry || {});
  let recencyState = cloneValue(snapshotBase?.recencyState || {});
  const snapshotStartDate = snapshotBase?.asOfDate || null;

  const calendar = {};
  users.forEach(user => {
    calendar[user] = {};
  });

  const forcedByDate = new Map();
  const preservedDates = new Set();

  if (previousCalendar && typeof previousCalendar === 'object') {
    users.forEach(user => {
      const prevUser = previousCalendar[user] || {};
      const targetUser = calendar[user];
      const allowedForUser = allowedMealsByUser[user] || null;
      Object.entries(prevUser).forEach(([dateStr, dayValue]) => {
        if (freezeBeforeStr && dateStr >= freezeBeforeStr) return;
        const filteredDay = filterCalendarDayByAllowedMeals(dayValue, allowedForUser);
        if (!filteredDay) return;
        targetUser[dateStr] = filteredDay;
        preservedDates.add(dateStr);
        const forcedDay = forcedByDate.get(dateStr) || {};
        const existingUser = normalizeForcedUserEntry(forcedDay[user]);
        const normalizedForced = normalizeForcedDay(filteredDay);
        Object.entries(normalizedForced).forEach(([categoryId, slotValue]) => {
          const slotMap = normalizeForcedCategorySlots(slotValue);
          if (!existingUser[categoryId]) {
            existingUser[categoryId] = {};
          }
          Object.entries(slotMap).forEach(([slotKey, entry]) => {
            existingUser[categoryId][slotKey] = entry;
          });
        });
        forcedDay[user] = existingUser;
        forcedByDate.set(dateStr, forcedDay);
      });
    });
  }

  if (weeklyOverrides && typeof weeklyOverrides === 'object') {
    Object.entries(weeklyOverrides).forEach(([dateStr, perUser]) => {
      if (!perUser || typeof perUser !== 'object') return;
      const forcedDay = forcedByDate.get(dateStr) || {};
      let dayChanged = false;
      Object.entries(perUser).forEach(([user, userEntries]) => {
        if (!userEntries || typeof userEntries !== 'object') return;
        const existingUser = normalizeForcedUserEntry(forcedDay[user]);
        const overrideUser = normalizeForcedUserEntry(userEntries);
        mergeForcedUserEntries(existingUser, overrideUser);
        if (Object.keys(existingUser).length) {
          forcedDay[user] = existingUser;
          dayChanged = true;
        }
      });
      if (dayChanged) {
        forcedByDate.set(dateStr, forcedDay);
      }
    });
  }

  const preservedDateList = Array.from(preservedDates).sort();
  const effectiveSeedingDates = preservedDateList.filter(dateStr => {
    if (freezeBeforeStr && dateStr >= freezeBeforeStr) return false;
    if (snapshotStartDate && dateStr < snapshotStartDate) return false;
    return true;
  });

  function buildTimeline() {
    const items = [];
    effectiveSeedingDates.forEach(dateStr => {
      items.push({
        date: new Date(dateStr + 'T00:00:00'),
        dateStr,
        forced: forcedByDate.get(dateStr) || null,
        write: false
      });
    });

    const start = new Date(startDate);
    for (let i = 0; i < weeks * 7; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      const dateStr = toISODateString(current);
      if (freezeBeforeStr && dateStr < freezeBeforeStr) continue;
      items.push({ date: current, dateStr, forced: forcedByDate.get(dateStr) || null, write: true });
    }
    items.sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0));
    return items;
  }

  const timeline = buildTimeline();

  const subCount = {};
  Object.values(subscriptions).forEach(prefs => {
    Object.entries(prefs || {}).forEach(([cat, meals]) => {
      subCount[cat] = subCount[cat] || {};
      (meals || []).forEach(m => {
        const id = m.id || m.name;
        subCount[cat][id] = (subCount[cat][id] || 0) + 1;
      });
    });
  });

  function resolveSlotCount(categoryId) {
    const raw = mealsPerDay ? mealsPerDay[categoryId] : undefined;
    if (raw == null) {
      return 1;
    }
    const numeric =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
        ? Number(raw.trim() === '' ? 0 : raw)
        : Number(raw);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const floored = Math.floor(numeric);
    return floored < 0 ? 0 : floored;
  }

  function weightMeals(list) {
    return list
      .map(m => ({ meal: m, weight: m && m.weight != null ? m.weight : 1 }))
      .filter(w => w.weight > 0);
  }

  function pickWeighted(list, state, forcedId = null) {
    const total = list.reduce((s, i) => s + i.weight, 0);
    if (!total) return null;
    let chosenItem = null;
    list.forEach(it => {
      const id = it.meal?.id || it.meal?.name;
      if (id == null) return;
      state[id] = (state[id] || 0) + (it.weight || 0);
      if (forcedId != null && id === forcedId && !chosenItem) {
        chosenItem = it;
      }
    });
    if (!chosenItem) {
      let maxEntry = null;
      let maxValue = -Infinity;
      list.forEach(it => {
        const id = it.meal?.id || it.meal?.name;
        if (id == null) return;
        const value = state[id];
        if (maxEntry == null || value > maxValue) {
          maxEntry = it;
          maxValue = value;
        }
      });
      chosenItem = maxEntry;
    }
    if (!chosenItem) return null;
    const chosenId = chosenItem.meal?.id || chosenItem.meal?.name;
    if (chosenId == null) return null;
    state[chosenId] -= total;
    return chosenItem.meal;
  }

  function createCookEntry(mealId) {
    return { type: 'cook', mealId, leftoverTargets: [] };
  }

  function createLeftoverEntry(mealId, source) {
    return { type: 'leftover', mealId, leftoverSource: source || null };
  }

  function rotateArray(arr, seed) {
    if (!Array.isArray(arr) || !arr.length) return arr;
    const offset = ((seed % arr.length) + arr.length) % arr.length;
    if (!offset) return arr.slice();
    return arr.slice(offset).concat(arr.slice(0, offset));
  }

  function computeSeed(...parts) {
    const joined = parts.filter(Boolean).join('|');
    let hash = 0;
    for (let i = 0; i < joined.length; i++) {
      hash = (hash * 33 + joined.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function prioritizePickList(list, user, categoryId, dateStr) {
    const empty = { primary: [], secondary: [], lookup: new Map() };
    if (!Array.isArray(list) || !list.length) return empty;
    const recencyForUser = recencyState[user]?.[categoryId] || {};
    const today = new Date(dateStr + 'T00:00:00');
    const info = list.map(entry => {
      const mealId = entry.meal?.id || entry.meal?.name || null;
      if (!mealId) {
        return { entry, mealId: null, daysSince: Infinity };
      }
      const last = recencyForUser[mealId];
      if (!last) {
        return { entry, mealId, daysSince: Infinity };
      }
      const diffMs = today - new Date(last + 'T00:00:00');
      const daysSince = Number.isFinite(diffMs) ? Math.floor(diffMs / 86400000) : Infinity;
      return { entry, mealId, daysSince };
    });
    const threshold = 7;
    let primaryInfo = info.filter(item => item.daysSince >= threshold);
    if (!primaryInfo.length) {
      let maxGap = -Infinity;
      info.forEach(item => {
        if (item.daysSince > maxGap) maxGap = item.daysSince;
      });
      primaryInfo = info.filter(item => item.daysSince === maxGap);
    }
    const primarySet = new Set(primaryInfo);
    const secondaryInfo = info.filter(item => !primarySet.has(item));
    const lookup = new Map();
    info.forEach(item => {
      if (item.mealId) {
        lookup.set(item.mealId, item.entry);
      }
    });

    function orderEntries(source, salt) {
      if (!source.length) return [];
      const seed = computeSeed(dateStr, categoryId, salt || '');
      const sorted = source
        .slice()
        .sort((a, b) => {
          if (a.daysSince !== b.daysSince) {
            return b.daysSince - a.daysSince;
          }
          const idA = a.mealId || '';
          const idB = b.mealId || '';
          if (idA === idB) return 0;
          const scoreA = computeSeed(seed, idA);
          const scoreB = computeSeed(seed, idB);
          if (scoreA === scoreB) return idA.localeCompare(idB);
          return scoreA - scoreB;
        })
        .map(item => item.entry);
      return rotateArray(sorted, seed);
    }

    return {
      primary: orderEntries(primaryInfo, 'primary'),
      secondary: orderEntries(secondaryInfo, 'secondary'),
      lookup
    };
  }

  function registerNextLeftover(store, user, categoryId, slotIndex, dateStr, entry) {
    if (!entry || typeof entry !== 'object') return;
    if (!store[user]) store[user] = {};
    if (!store[user][categoryId]) store[user][categoryId] = {};
    const slotPool = store[user][categoryId][slotIndex] || [];
    slotPool.push({
      entry,
      user,
      categoryId,
      slotIndex,
      date: dateStr
    });
    store[user][categoryId][slotIndex] = slotPool;
  }

  const overrideSlotKeyCache = {};

  function computeOverrideSlotKeys(dayName) {
    const perCategory = {};
    users.forEach(user => {
      const dayOverrides = slotOverrides[user]?.[dayName] || {};
      Object.entries(dayOverrides).forEach(([sourceCategoryId, slotMap = {}]) => {
        Object.entries(slotMap || {}).forEach(([slotIndexKey, targetCategoryId]) => {
          if (!targetCategoryId) return;
          const numericIndex = Number(slotIndexKey);
          if (!Number.isFinite(numericIndex)) return;
          const flooredIndex = Math.floor(numericIndex);
          if (flooredIndex < 0) return;
          const baseSlots = resolveSlotCount(targetCategoryId);
          const slotLimit = Math.max(1, Number.isFinite(baseSlots) ? baseSlots : 0);
          const normalizedIndex = Math.max(
            0,
            Math.min(flooredIndex, slotLimit - 1)
          );
          const map =
            perCategory[targetCategoryId] ||
            (perCategory[targetCategoryId] = {});
          const comboKey = `${sourceCategoryId}:${flooredIndex}`;
          if (map[comboKey] == null) {
            map[comboKey] = normalizedIndex;
          }
        });
      });
    });
    return perCategory;
  }

  function normalizeDayPreference(value) {
    const normalizedSlots = [];
    const normalizedPrep = [];
    const normalizedLeftover = [];
    function pushSlot(slot, prep, leftover) {
      const seen = new Set();
      const arr = [];
      if (Array.isArray(slot)) {
        slot.forEach(day => {
          if (typeof day === 'string' && !seen.has(day)) {
            seen.add(day);
            arr.push(day);
          }
        });
      }
      normalizedSlots.push(arr);
      if (Array.isArray(prep)) {
        const prepSeen = new Set();
        const prepArr = [];
        prep.forEach(day => {
          if (typeof day === 'string' && !prepSeen.has(day)) {
            prepSeen.add(day);
            prepArr.push(day);
          }
        });
        normalizedPrep.push(prepArr);
      } else {
        normalizedPrep.push([]);
      }
      if (Array.isArray(leftover)) {
        const leftoverSeen = new Set();
        const leftoverArr = [];
        leftover.forEach(day => {
          if (typeof day === 'string' && !leftoverSeen.has(day)) {
            leftoverSeen.add(day);
            leftoverArr.push(day);
          }
        });
        normalizedLeftover.push(leftoverArr);
      } else {
        normalizedLeftover.push([]);
      }
    }

    if (value && typeof value === 'object') {
      if (Array.isArray(value.slots)) {
        value.slots.forEach((slot, idx) => {
          const prep = Array.isArray(value.prepSlots?.[idx])
            ? value.prepSlots[idx]
            : Array.isArray(value.prepDays)
            ? value.prepDays
            : [];
          const leftover = Array.isArray(value.leftoverSlots?.[idx])
            ? value.leftoverSlots[idx]
            : Array.isArray(value.leftoverDays)
            ? value.leftoverDays
            : [];
          pushSlot(slot, prep, leftover);
        });
      } else if (Array.isArray(value.slotDays)) {
        value.slotDays.forEach((slot, idx) => {
          const prep = Array.isArray(value.prepSlots?.[idx])
            ? value.prepSlots[idx]
            : Array.isArray(value.prepDays)
            ? value.prepDays
            : [];
          const leftover = Array.isArray(value.leftoverSlots?.[idx])
            ? value.leftoverSlots[idx]
            : Array.isArray(value.leftoverDays)
            ? value.leftoverDays
            : [];
          pushSlot(slot, prep, leftover);
        });
      }
    }
    if (!normalizedSlots.length && Array.isArray(value)) {
      pushSlot(value, [], []);
    }
    let unionCandidates = Array.isArray(value?.days) ? value.days.slice() : [];
    if (!unionCandidates.length && normalizedSlots.length) {
      const unionSet = new Set();
      normalizedSlots.forEach(slot => {
        slot.forEach(day => {
          if (typeof day === 'string' && !unionSet.has(day)) {
            unionSet.add(day);
          }
        });
      });
      unionCandidates = Array.from(unionSet);
    }
    const daySet = new Set();
    const normalizedDays = [];
    if (Array.isArray(unionCandidates)) {
      unionCandidates.forEach(day => {
        if (typeof day === 'string' && !daySet.has(day)) {
          daySet.add(day);
          normalizedDays.push(day);
        }
      });
    }
    const slotSets = normalizedSlots.map(slot => new Set(slot));
    const prepSlots = normalizedSlots.map((slot, idx) => {
      const slotSet = slotSets[idx];
      const prepSource = normalizedPrep[idx] || [];
      return prepSource.filter(day => slotSet.has(day));
    });
    const leftoverSlots = normalizedSlots.map((slot, idx) => {
      const slotSet = slotSets[idx];
      const leftoverSource = normalizedLeftover[idx] || [];
      return leftoverSource.filter(day => slotSet.has(day));
    });
    const prepSlotSets = prepSlots.map(prep => new Set(prep));
    const leftoverSlotSets = leftoverSlots.map(leftover => new Set(leftover));
    return {
      days: normalizedDays,
      daySet,
      slots: normalizedSlots,
      slotSets,
      prepSlots,
      prepSlotSets,
      leftoverSlots,
      leftoverSlotSets
    };
  }

  function updateStoredEntry(user, dateStr, categoryId, slotIndex, entry) {
    const day = calendar[user]?.[dateStr];
    if (!day) return;
    const current = day[categoryId];
    if (Array.isArray(current)) {
      if (slotIndex == null || slotIndex < 0 || slotIndex >= current.length) return;
      const copy = current.slice();
      copy[slotIndex] = serializeEntry(entry);
      day[categoryId] = copy;
    } else if (slotIndex == null || slotIndex === 0) {
      day[categoryId] = serializeEntry(entry);
    }
  }

  let freezeSnapshot = null;
  if (!effectiveSeedingDates.length && freezeBeforeStr) {
    freezeSnapshot = {
      asOfDate: freezeBeforeStr,
      nonPrepState: cloneValue(nonPrepState),
      sharedGroupState: cloneValue(sharedGroupState),
      leftoverCarry: cloneValue(leftoverCarry),
      recencyState: cloneValue(recencyState)
    };
  }

  for (let idx = 0; idx < timeline.length; idx++) {
    const { date, dateStr, forced, write } = timeline[idx];
    const currentDate = date;
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dayOverrideSlotKeys =
      overrideSlotKeyCache[dayName] ||
      (overrideSlotKeyCache[dayName] = computeOverrideSlotKeys(dayName));
    const prevLeftovers = leftoverCarry;
    const nextLeftovers = {};

    const perUserData = {};
    users.forEach(user => {
      const prefs = subscriptions[user] || {};
      const rawDayPrefs = eatingDays[user] || {};
      const dayPrefs = {};
      Object.entries(rawDayPrefs).forEach(([categoryId, value]) => {
        dayPrefs[categoryId] = normalizeDayPreference(value);
      });
      const overridesForUser = slotOverrides[user] || {};
      const overridesForDay = overridesForUser[dayName] || {};
      const stateRec = nonPrepState[user] || (nonPrepState[user] = {});
      perUserData[user] = {
        prefs,
        dayPrefs,
        overridesForDay,
        overridesForUser,
        stateRec,
        maxPrice:
          priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity,
        contextCache: {}
      };
      if (!recencyState[user]) {
        recencyState[user] = {};
      }
    });

    const daySharedPlan = {};

    function ensureContext(user, categoryId) {
      const userData = perUserData[user];
      if (!userData) return null;
      if (userData.contextCache[categoryId]) {
        return userData.contextCache[categoryId];
      }
      const prefs = userData.prefs || {};
      const meals = (prefs[categoryId] || []).filter(m =>
        (m.ingredients || []).every(ing =>
          isItemInSeason(itemSeasons, ing.name, currentDate)
        )
      );
      const numSlots = resolveSlotCount(categoryId);
      const prepMealId = preparedCal[dateStr]?.[categoryId];
      const prepMeal = meals.find(m => (m.id || m.name) === prepMealId) || null;
      const nonPrepMeals = meals.filter(
        m => !m.prepared && (m.totalCost == null || m.totalCost <= userData.maxPrice)
      );
      const sharedNonPrepMeals = nonPrepMeals.filter(
        m => m.groupMeal && (subCount[categoryId]?.[m.id || m.name] || 0) > 1
      );
      const canSharePrepared =
        prepMeal &&
        prepMeal.groupMeal &&
        (subCount[categoryId]?.[prepMealId] || 0) > 1 &&
        (prepMeal.totalCost == null || prepMeal.totalCost <= userData.maxPrice);
      const sharedPreparedMeals = canSharePrepared ? [prepMeal] : [];
      const sharedMeals = sharedNonPrepMeals.concat(sharedPreparedMeals);
      const affordableAll = meals.filter(
        m => m.totalCost == null || m.totalCost <= userData.maxPrice
      );
      const nonPrepFallback = meals.filter(m => !m.prepared);
      const preparedMeals = meals.filter(
        m => m.prepared && (m.totalCost == null || m.totalCost <= userData.maxPrice)
      );
      const preparedFallback = meals.filter(m => m.prepared);
      const weightedNonPrep = weightMeals(nonPrepMeals);
      const weightedShared = weightMeals(sharedMeals);
      const weightedAffordable = weightMeals(
        affordableAll.filter(m => !m.prepared)
      );
      const weightedFallback = weightMeals(nonPrepFallback);
      const weightedPrepared = weightMeals(preparedMeals);
      const weightedPreparedFallback = weightMeals(preparedFallback);
      const weightedAvail = weightMeals(meals);
      const chooseList =
        weightedNonPrep.length
          ? weightedNonPrep
          : weightedAffordable.length
          ? weightedAffordable
          : weightedFallback.length
          ? weightedFallback
          : weightedAvail;
      const preparedChooseList =
        weightedPrepared.length
          ? weightedPrepared
          : weightedPreparedFallback.length
          ? weightedPreparedFallback
          : [];
      const context = {
        categoryId,
        meals,
        numSlots,
        prepMealId,
        prepMeal,
        sharedPreparedMealId: canSharePrepared ? prepMealId : null,
        weightedShared,
        chooseList,
        preparedChooseList
      };
      userData.contextCache[categoryId] = context;
      return context;
    }

    function registerSharedOption(user, categoryId, sharedSlotKey) {
      if (sharedSlotKey == null) return;
      const context = ensureContext(user, categoryId);
      if (!context || !context.weightedShared.length) return;
      const slotKeyId = String(sharedSlotKey);
      const categoryEntry =
        daySharedPlan[categoryId] ||
        (daySharedPlan[categoryId] = {
          slots: {},
          sharedCandidates: new Map(),
          consumed: new Set()
        });
      const slots = categoryEntry.slots;
      let slotEntry = slots[slotKeyId];
      if (!slotEntry) {
        slotEntry = slots[slotKeyId] = {
          candidates: new Map(),
          userMealPairs: new Set(),
          participatingUsers: new Set()
        };
      }
      slotEntry.participatingUsers.add(user);
      context.weightedShared.forEach(entry => {
        const meal = entry.meal;
        if (!meal) return;
        const mealId = meal.id || meal.name;
        if (mealId == null) return;
        const pairKey = `${user}||${mealId}`;
        if (slotEntry.userMealPairs.has(pairKey)) return;
        slotEntry.userMealPairs.add(pairKey);
        let sharedCandidate = categoryEntry.sharedCandidates.get(mealId);
        if (!sharedCandidate) {
          sharedCandidate = {
            meal,
            mealId,
            weight: entry.weight || 1,
            weighted: null,
            disabled: false
          };
          categoryEntry.sharedCandidates.set(mealId, sharedCandidate);
        }
        let candidate = slotEntry.candidates.get(mealId);
        if (!candidate) {
          candidate = {
            meal: sharedCandidate.meal,
            mealId: sharedCandidate.mealId,
            weight: sharedCandidate.weight,
            users: [],
            userSet: new Set(),
            weighted: null,
            disabled: false,
            sharedParent: sharedCandidate
          };
          slotEntry.candidates.set(mealId, candidate);
        }
        if (!candidate.userSet.has(user)) {
          candidate.userSet.add(user);
          candidate.users.push(user);
        }
      });
    }

    users.forEach(user => {
      const userData = perUserData[user];
      const categories = new Set([
        ...Object.keys(userData.prefs || {}),
        ...Object.keys(userData.overridesForDay || {}),
        ...Object.keys(userData.dayPrefs || {})
      ]);
      Object.values(userData.overridesForDay || {}).forEach(slotMap => {
        Object.values(slotMap || {}).forEach(targetCategoryId => {
          if (targetCategoryId) categories.add(targetCategoryId);
        });
      });
      categories.forEach(categoryId => {
        const slotOverridesForCat = userData.overridesForDay[categoryId] || {};
        const dayPrefEntry = userData.dayPrefs[categoryId];
        const unionSet = dayPrefEntry?.daySet;
        const hasOverride = Object.keys(slotOverridesForCat).length > 0;
        const participatesToday = unionSet ? unionSet.has(dayName) : false;
        if (!participatesToday && !hasOverride) return;
        const numSlots = resolveSlotCount(categoryId);
        const highestOverrideIndex = Object.keys(slotOverridesForCat).reduce(
          (max, key) => {
            const numeric = Number(key);
            if (!Number.isFinite(numeric)) return max;
            const floored = Math.floor(numeric);
            return floored >= 0 ? Math.max(max, floored) : max;
          },
          -1
        );
        const iterationSlots = Math.max(numSlots, highestOverrideIndex + 1, 0);
        const slotSets = dayPrefEntry?.slotSets || [];
        for (let s = 0; s < iterationSlots; s++) {
          const overrideCategory = slotOverridesForCat[s];
          if (overrideCategory) {
            const overrideContext = ensureContext(user, overrideCategory);
            const overrideSlotCount = overrideContext
              ? Math.max(1, overrideContext.numSlots ?? 0)
              : 1;
            const normalizedOverrideSlot = Math.max(
              0,
              Math.min(s, overrideSlotCount - 1)
            );
            const overrideKeyMap = dayOverrideSlotKeys[overrideCategory] || {};
            const overrideComboKey = `${categoryId}:${s}`;
            const overrideSlotKey =
              overrideKeyMap[overrideComboKey] != null
                ? overrideKeyMap[overrideComboKey]
                : undefined;
            const targetSharedSlotKey =
              overrideSlotKey != null ? overrideSlotKey : normalizedOverrideSlot;
            registerSharedOption(user, overrideCategory, targetSharedSlotKey);
          }
          const baseSlotActive = slotSets[s] ? slotSets[s].has(dayName) : false;
          if (baseSlotActive) {
            registerSharedOption(user, categoryId, s);
          }
        }
      });
    });

    Object.entries(daySharedPlan).forEach(([categoryId, categoryEntry]) => {
      categoryEntry?.sharedCandidates?.forEach(sharedCandidate => {
        sharedCandidate.disabled = false;
      });
      Object.entries(categoryEntry?.slots || {}).forEach(([slotKey, slotEntry]) => {
        const bySize = {};
        slotEntry.candidates.forEach(candidate => {
          candidate.disabled = false;
          candidate.weighted = { meal: candidate.meal, weight: candidate.weight };
          const size = candidate.users.length;
          if (size <= 0) return;
          const bucket =
            bySize[size] ||
            (bySize[size] = { entries: [], map: new Map() });
          bucket.entries.push(candidate);
          bucket.map.set(candidate.mealId, candidate);
        });
        slotEntry.sizeOrder = Object.keys(bySize)
          .map(n => Number(n))
          .sort((a, b) => b - a);
        slotEntry.bySize = bySize;
        slotEntry.assigned = {};
      });
    });

    function resolveSharedAssignment(
      categoryId,
      sharedSlotKey,
      user,
      forcedEntry = null,
      preferredMealId = null
    ) {
      if (sharedSlotKey == null) return null;
      const slotKeyId = String(sharedSlotKey);
      const categoryPlan = daySharedPlan[categoryId];
      if (!categoryPlan) return null;
      const slotPlan = categoryPlan.slots?.[slotKeyId];
      if (!slotPlan) return null;
      if (slotPlan.participatingUsers && !slotPlan.participatingUsers.has(user)) {
        return null;
      }
      if (slotPlan.assigned[user]) {
        return slotPlan.assigned[user];
      }
      const forcedFromEntry =
        forcedEntry && forcedEntry.type === 'cook' ? forcedEntry.mealId : null;
      const forcedMealId =
        forcedFromEntry != null
          ? forcedFromEntry
          : preferredMealId != null
          ? preferredMealId
          : null;
      const consumedMeals =
        categoryPlan.consumed || (categoryPlan.consumed = new Set());
      for (const size of slotPlan.sizeOrder || []) {
        const bucket = slotPlan.bySize[size];
        if (!bucket) continue;
        const stateBucket =
          sharedGroupState[categoryId] || (sharedGroupState[categoryId] = {});
        const sizeState = stateBucket[size] || (stateBucket[size] = {});
        while (true) {
          const activeCandidates = bucket.entries.filter(candidate => {
            if (!candidate) return false;
            const isForced = forcedMealId != null && candidate.mealId === forcedMealId;
            if (candidate.disabled && !isForced) return false;
            if (
              candidate.sharedParent &&
              candidate.sharedParent.disabled &&
              !isForced
            ) {
              return false;
            }
            if (consumedMeals.has(candidate.mealId) && !isForced) {
              return false;
            }
            return candidate.userSet.has(user);
          });
          if (!activeCandidates.length) break;
          const prioritized = prioritizeSharedCandidates(
            activeCandidates,
            categoryId,
            dateStr
          );
          let candidateList = prioritized.primary.slice();
          function hasCandidate(listEntries, mealId) {
            if (mealId == null) return false;
            return listEntries.some(entry => entry?.mealId === mealId);
          }
          if (forcedMealId != null) {
            const forcedCandidate =
              prioritized.lookup.get(forcedMealId) ||
              activeCandidates.find(item => item.mealId === forcedMealId);
            if (forcedCandidate && !hasCandidate(candidateList, forcedMealId)) {
              candidateList = candidateList.concat([forcedCandidate]);
            }
          }
          if (!candidateList.length) {
            candidateList = prioritized.secondary.slice();
          }
          if (!candidateList.length) {
            candidateList = activeCandidates.slice();
          }
          const meal = pickSharedCandidate(
            candidateList,
            sizeState,
            forcedMealId,
            user,
            dateStr
          );
          if (!meal) break;
          const mealId = meal.id || meal.name;
          const candidate = bucket.map.get(mealId);
          const isForcedPick = forcedMealId != null && forcedMealId === mealId;
          if (
            !candidate ||
            (!isForcedPick &&
              (candidate.disabled ||
                (candidate.sharedParent && candidate.sharedParent.disabled) ||
                consumedMeals.has(candidate.mealId))) ||
            !candidate.userSet.has(user)
          ) {
            if (candidate && !isForcedPick) candidate.disabled = true;
            continue;
          }
          const conflict = candidate.users.some(
            u => slotPlan.assigned[u] && slotPlan.assigned[u] !== mealId
          );
          if (conflict) {
            candidate.disabled = true;
            continue;
          }
          candidate.users.forEach(u => {
            slotPlan.assigned[u] = mealId;
          });
          candidate.disabled = true;
          if (candidate.sharedParent) {
            candidate.sharedParent.disabled = true;
          }
          consumedMeals.add(candidate.mealId);
          return mealId;
        }
      }
      return null;
    }

  function prioritizeSharedCandidates(candidates, categoryId, dateStr) {
    const empty = { primary: [], secondary: [], lookup: new Map() };
    if (!Array.isArray(candidates) || !candidates.length) return empty;
      const enriched = candidates.map(candidate => {
        let minDays = Infinity;
        candidate.users.forEach(user => {
          const userRecency = recencyState[user]?.[categoryId] || {};
          const last = userRecency[candidate.mealId];
          if (!last) return;
          const diff =
            new Date(dateStr + 'T00:00:00') - new Date(last + 'T00:00:00');
          const days = Number.isFinite(diff) ? Math.floor(diff / 86400000) : Infinity;
          if (days < minDays) minDays = days;
        });
        return { candidate, daysSince: minDays };
      });
      const threshold = 7;
      let primaryInfo = enriched.filter(item => item.daysSince >= threshold);
      if (!primaryInfo.length) {
        let maxGap = -Infinity;
        enriched.forEach(item => {
          if (item.daysSince > maxGap) maxGap = item.daysSince;
        });
        primaryInfo = enriched.filter(item => item.daysSince === maxGap);
      }
      const primarySet = new Set(primaryInfo);
      const secondaryInfo = enriched.filter(item => !primarySet.has(item));
      const lookup = new Map();
      enriched.forEach(item => {
        if (item.candidate?.mealId) {
          lookup.set(item.candidate.mealId, item.candidate);
        }
      });

      function orderCandidates(source, salt) {
        if (!source.length) return [];
        const seed = computeSeed(dateStr, categoryId, 'shared', salt || '');
        const sorted = source
          .slice()
          .sort((a, b) => {
            if (a.daysSince !== b.daysSince) {
              return b.daysSince - a.daysSince;
            }
            const idA = a.candidate.mealId || '';
            const idB = b.candidate.mealId || '';
            if (idA === idB) return 0;
            const scoreA = computeSeed(seed, idA);
            const scoreB = computeSeed(seed, idB);
            if (scoreA === scoreB) {
              return idA.localeCompare(idB);
            }
            return scoreA - scoreB;
          })
          .map(item => item.candidate);
        return rotateArray(sorted, seed);
      }

    return {
      primary: orderCandidates(primaryInfo, 'primary'),
      secondary: orderCandidates(secondaryInfo, 'secondary'),
      lookup
    };
  }

  function pickSharedCandidate(candidateList, sizeState, forcedMealId, user, dateStr) {
    if (!Array.isArray(candidateList) || !candidateList.length) {
      return null;
    }
    if (!nutrientGoalConfig) {
      const weightedList = candidateList.map(candidate => candidate.weighted);
      return pickWeighted(weightedList, sizeState, forcedMealId);
    }
    const forcedCandidate =
      forcedMealId != null
        ? candidateList.find(candidate => candidate?.mealId === forcedMealId)
        : null;
    if (forcedCandidate) {
      return forcedCandidate.meal;
    }
    const dayState = ensureNutrientDayState(user, dateStr);
    if (!dayState) {
      const weightedList = candidateList.map(candidate => candidate.weighted);
      return pickWeighted(weightedList, sizeState, forcedMealId);
    }
    const scored = candidateList.map(candidate => {
      const meal = candidate?.meal || null;
      const vector = meal ? getMealNutrientVector(meal) : null;
      const scoreInfo = vector ? computeAppliedPoints(vector, dayState) : null;
      return { candidate, score: scoreInfo ? scoreInfo.total : 0 };
    });
    let maxScore = -Infinity;
    scored.forEach(item => {
      if (item.score > maxScore) maxScore = item.score;
    });
    if (!Number.isFinite(maxScore)) maxScore = 0;
    const topCandidates = scored
      .filter(item => Math.abs(item.score - maxScore) < NUTRIENT_SCORE_TOLERANCE)
      .map(item => item.candidate)
      .filter(Boolean);
    if (topCandidates.length === 1) {
      return topCandidates[0].meal;
    }
    const pool = topCandidates.length ? topCandidates : candidateList;
    const weightedList = pool.map(candidate => candidate.weighted);
    return pickWeighted(weightedList, sizeState, forcedMealId);
  }

    users.forEach(user => {
      calendar[user][dateStr] = calendar[user][dateStr] || {};
      const userData = perUserData[user];
      const prefs = userData.prefs || {};
      const dayPrefs = userData.dayPrefs || {};
      const overridesForDay = userData.overridesForDay || {};
      const stateRec = userData.stateRec;
      const maxPrice = userData.maxPrice;
      const contextCache = userData.contextCache;
      const forcedForUser = forced ? forced[user] || {} : null;

      function getContext(categoryId) {
        if (contextCache[categoryId]) return contextCache[categoryId];
        return ensureContext(user, categoryId);
      }

      function updateDaySummaryMetadata() {
        if (!write || !nutrientGoalConfig) return;
        const dayState = ensureNutrientDayState(user, dateStr);
        if (!dayState) return;
        const summary = buildNutrientSummaryFromState(dayState);
        if (!summary) return;
        // Namespaced key so category loops can ignore it while UI can read progress data.
        calendar[user][dateStr]._nutrientSummary = summary;
      }

      function recordMealNutritionForEntry(entry, meal, mealId) {
        if (!write || !nutrientGoalConfig || !entry) return;
        const resolvedMeal = meal || resolveMealFromLookup(mealId);
        if (!resolvedMeal) return;
        const applied = applyMealNutrition(user, dateStr, resolvedMeal);
        if (!applied) return;
        entry.nutrientScore = {
          total: applied.total,
          perNutrient: { ...applied.perNutrient }
        };
        updateDaySummaryMetadata();
      }

      function attemptPick(categoryId, slotKey, normalizedSlotOverride, options = {}) {
        const { requirePrepared = false, forcedMealId = null, forcedEntry = null } = options;
        const context = getContext(categoryId);
        if (!context) return null;
        const normalizedCount = context.numSlots ?? 0;
        const hasOverrideIndex = normalizedSlotOverride != null;
        const slotLimit = hasOverrideIndex
          ? Math.max(1, normalizedCount)
          : normalizedCount;
        if (!hasOverrideIndex && slotLimit <= 0) {
          return null;
        }
        const slotKeyNumber =
          typeof slotKey === 'number'
            ? slotKey
            : slotKey != null && !Number.isNaN(Number(slotKey))
            ? Number(slotKey)
            : 0;
        const normalizedSlot =
          normalizedSlotOverride != null
            ? normalizedSlotOverride
            : Math.max(0, Math.min(slotKeyNumber, slotLimit - 1));
        const sharedSlotKey = slotKey != null ? slotKey : normalizedSlot;
        const meals = context.meals;
        const prepMeal = context.prepMeal
          ? context.prepMeal
          : meals.find(m => (m.id || m.name) === context.prepMealId);
        const prepOk =
          normalizedSlot === 0 &&
          prepMeal &&
          (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);
        const forcedMatchesPrep =
          forcedMealId != null && forcedMealId === context.prepMealId;
        const preferPrepared = prepOk && (!forcedMealId || forcedMatchesPrep);
        const sharedPreferredId =
          preferPrepared && context.sharedPreparedMealId != null
            ? context.sharedPreparedMealId
            : null;
        let chosenId = null;
        let chosenMeal = null;
        let usedSharedAssignment = false;
        let attemptedShared = false;
        if (
          sharedSlotKey != null &&
          (sharedPreferredId != null || (!requirePrepared && context.weightedShared.length))
        ) {
          attemptedShared = true;
          const sharedChoice = resolveSharedAssignment(
            categoryId,
            sharedSlotKey,
            user,
            forcedEntry,
            sharedPreferredId
          );
          if (sharedChoice != null) {
            chosenId = sharedChoice;
            chosenMeal =
              meals.find(m => (m.id || m.name) === sharedChoice) || null;
            usedSharedAssignment = true;
          }
        }
        if (!usedSharedAssignment && preferPrepared) {
          chosenId = context.prepMealId;
          chosenMeal = prepMeal || null;
        } else if (
          !usedSharedAssignment &&
          !attemptedShared &&
          !requirePrepared &&
          context.weightedShared.length
        ) {
          const sharedChoice = resolveSharedAssignment(
            categoryId,
            sharedSlotKey,
            user,
            forcedEntry
          );
          if (sharedChoice != null) {
            chosenId = sharedChoice;
            chosenMeal =
              meals.find(m => (m.id || m.name) === sharedChoice) || null;
            usedSharedAssignment = true;
          }
        }
        function selectMealFromCandidates(candidateEntries, weightState, forcedId) {
          if (!Array.isArray(candidateEntries) || !candidateEntries.length) {
            return null;
          }
          if (!nutrientGoalConfig) {
            return pickWeighted(candidateEntries, weightState, forcedId);
          }
          const forcedChoice =
            forcedId != null
              ? candidateEntries.find(entry => {
                  const id = entry?.meal?.id || entry?.meal?.name;
                  return id != null && id === forcedId;
                })
              : null;
          if (forcedChoice) {
            return forcedChoice.meal;
          }
          const scoredEntries = candidateEntries.map(entry => {
            const meal = entry?.meal || null;
            const scoreInfo = meal ? scoreMealForDay(user, dateStr, meal) : null;
            const total = scoreInfo ? scoreInfo.total : 0;
            return { entry, total };
          });
          let maxScore = -Infinity;
          scoredEntries.forEach(item => {
            if (item.total > maxScore) maxScore = item.total;
          });
          if (!Number.isFinite(maxScore)) maxScore = 0;
          const tiedEntries = scoredEntries
            .filter(item => Math.abs(item.total - maxScore) < NUTRIENT_SCORE_TOLERANCE)
            .map(item => item.entry)
            .filter(Boolean);
          if (tiedEntries.length === 1) {
            return tiedEntries[0].meal;
          }
          const pool = tiedEntries.length ? tiedEntries : candidateEntries;
          return pickWeighted(pool, weightState, forcedId);
        }

        if (chosenId == null) {
          const pickList = requirePrepared
            ? context.preparedChooseList.length
              ? context.preparedChooseList
              : context.chooseList
            : context.chooseList;
          const prioritized = prioritizePickList(
            pickList,
            user,
            categoryId,
            dateStr
          );
          const state = stateRec[categoryId] || (stateRec[categoryId] = {});
          let candidateList = prioritized.primary.slice();
          function includesMeal(listEntries, mealId) {
            if (mealId == null) return false;
            return listEntries.some(entry => {
              const id = entry?.meal?.id || entry?.meal?.name;
              return id != null && id === mealId;
            });
          }
          if (forcedMealId != null) {
            const forcedEntry =
              prioritized.lookup.get(forcedMealId) ||
              pickList.find(entry => {
                const id = entry.meal?.id || entry.meal?.name;
                return id != null && id === forcedMealId;
              });
            if (forcedEntry && !includesMeal(candidateList, forcedMealId)) {
              candidateList = candidateList.concat([forcedEntry]);
            }
          }
          if (!candidateList.length) {
            candidateList = prioritized.secondary.slice();
          }
          if (!candidateList.length) {
            candidateList = pickList;
          }
          if (candidateList.length) {
            const meal = selectMealFromCandidates(candidateList, state, forcedMealId);
            if (meal) {
              chosenId = meal.id || meal.name;
              chosenMeal = meal;
            }
          }
        }
        if (normalizedSlot === 0 && preferPrepared) {
          if (
            context.weightedShared.length &&
            sharedSlotKey != null &&
            !usedSharedAssignment
          ) {
            resolveSharedAssignment(
              categoryId,
              sharedSlotKey,
              user,
              forcedEntry,
              sharedPreferredId
            );
          } else if (!requirePrepared && context.chooseList.length) {
            const state = stateRec[categoryId] || (stateRec[categoryId] = {});
            pickWeighted(context.chooseList, state, forcedMealId);
          }
        }
        return chosenId != null ? { chosenId, meal: chosenMeal || prepMeal || null } : null;
      }

      const categories = new Set([
        ...Object.keys(prefs),
        ...Object.keys(overridesForDay),
        ...Object.keys(dayPrefs || {})
      ]);
      categories.forEach(cat => {
        const prefEntry = dayPrefs[cat];
        const unionSet = prefEntry?.daySet;
        const slotOverridesForCat = overridesForDay[cat] || {};
        const hasOverride = Object.keys(slotOverridesForCat).length > 0;
        const participatesToday = unionSet ? unionSet.has(dayName) : false;
        if (!participatesToday && !hasOverride) return;
        const numSlots = resolveSlotCount(cat);
        const highestOverrideIndex = Object.keys(slotOverridesForCat).reduce(
          (max, key) => {
            const numeric = Number(key);
            if (!Number.isFinite(numeric)) return max;
            const floored = Math.floor(numeric);
            return floored >= 0 ? Math.max(max, floored) : max;
          },
          -1
        );
        const iterationSlots = Math.max(numSlots, highestOverrideIndex + 1, 0);
        const slotSets = prefEntry?.slotSets || [];
        const prepSlotSets = prefEntry?.prepSlotSets || [];
        const leftoverSlotSets = prefEntry?.leftoverSlotSets || [];
        const descriptors = [];
        for (let s = 0; s < iterationSlots; s++) {
          const overrideCategory = slotOverridesForCat[s];
          let normalizedOverrideSlot = null;
          let overrideSlotKey = null;
          if (overrideCategory) {
            const overrideContext = getContext(overrideCategory);
            const overrideSlotCount = overrideContext
              ? Math.max(1, overrideContext.numSlots ?? 0)
              : 1;
            normalizedOverrideSlot = Math.max(
              0,
              Math.min(s, overrideSlotCount - 1)
            );
            const overrideKeyMap = dayOverrideSlotKeys[overrideCategory] || {};
            const overrideComboKey = `${cat}:${s}`;
            if (overrideKeyMap[overrideComboKey] != null) {
              overrideSlotKey = overrideKeyMap[overrideComboKey];
            }
          }
          const baseSlotActive = slotSets[s] ? slotSets[s].has(dayName) : false;
          const needsPrep = baseSlotActive
            ? prepSlotSets[s]
              ? prepSlotSets[s].has(dayName)
              : false
            : false;
          const prefersLeftover = baseSlotActive
            ? leftoverSlotSets[s]
              ? leftoverSlotSets[s].has(dayName)
              : false
            : false;
          descriptors.push({
            slotIndex: s,
            overrideCategory,
            normalizedOverrideSlot,
            overrideSlotKey,
            baseSlotActive,
            needsPrep,
            prefersLeftover
          });
        }
        if (!descriptors.length) {
          if (iterationSlots <= 0) {
            return;
          }
          if (write) {
            calendar[user][dateStr][cat] = iterationSlots === 1 ? null : [];
          }
          return;
        }
        const slotResults = new Array(iterationSlots).fill(null);
        const pendingPrep = [];

        function updateRecencyForEntry(entry) {
          if (!entry || !entry.mealId) return;
          const userState = recencyState[user] || (recencyState[user] = {});
          const categoryState = userState[cat] || (userState[cat] = {});
          categoryState[entry.mealId] = dateStr;
        }

        function assignLeftoverFromPool(slotIndex, forcedEntry) {
          const categoryPools = prevLeftovers[user]?.[cat];
          const sourceMatcher =
            forcedEntry && forcedEntry.leftoverSource
              ? item => {
                  if (!item || !item.entry) return false;
                  return (
                    item.entry.mealId === forcedEntry.mealId &&
                    item.date === forcedEntry.leftoverSource.date &&
                    item.categoryId === forcedEntry.leftoverSource.categoryId &&
                    item.slotIndex === forcedEntry.leftoverSource.slot
                  );
                }
              : null;

          function consumeFromPool(poolKey, matcher) {
            const pool = categoryPools?.[poolKey];
            if (!Array.isArray(pool) || !pool.length) return null;
            const idx = matcher ? pool.findIndex(matcher) : -1;
            const sourceInfo = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift();
            return sourceInfo && sourceInfo.entry ? sourceInfo : null;
          }

          let sourceInfo = consumeFromPool(slotIndex, sourceMatcher);

          if (!sourceInfo && sourceMatcher) {
            const otherKeys = Object.keys(categoryPools || {}).filter(
              key => Number(key) !== slotIndex
            );
            for (const key of otherKeys) {
              sourceInfo = consumeFromPool(key, sourceMatcher);
              if (sourceInfo) break;
            }
          }

          if (!sourceInfo) {
            const slotKeys = Object.keys(categoryPools || {})
              .map(key => Number(key))
              .sort((a, b) => a - b);
            for (const key of slotKeys) {
              if (key === slotIndex) continue;
              sourceInfo = consumeFromPool(key, null);
              if (sourceInfo) break;
            }
          }

          if (!sourceInfo && categoryPools) {
            sourceInfo = consumeFromPool(slotIndex, null);
          }

          if (sourceInfo) {
            if (write) {
              sourceInfo.entry.leftoverTargets = Array.isArray(
                sourceInfo.entry.leftoverTargets
              )
                ? sourceInfo.entry.leftoverTargets
                : [];
              sourceInfo.entry.leftoverTargets.push({
                date: dateStr,
                categoryId: cat,
                slot: slotIndex
              });
              updateStoredEntry(
                sourceInfo.user,
                sourceInfo.date,
                sourceInfo.categoryId,
                sourceInfo.slotIndex,
                sourceInfo.entry
              );
            }
            slotResults[slotIndex] = createLeftoverEntry(
              sourceInfo.entry.mealId,
              {
                date: sourceInfo.date,
                categoryId: sourceInfo.categoryId,
                slot: sourceInfo.slotIndex
              }
            );
            updateRecencyForEntry(slotResults[slotIndex]);
            recordMealNutritionForEntry(
              slotResults[slotIndex],
              null,
              sourceInfo.entry.mealId
            );
            return true;
          }
          if (forcedEntry) {
            slotResults[slotIndex] = createLeftoverEntry(
              forcedEntry.mealId,
              forcedEntry.leftoverSource || null
            );
            updateRecencyForEntry(slotResults[slotIndex]);
            recordMealNutritionForEntry(slotResults[slotIndex], null, forcedEntry.mealId);
            return true;
          }
          return false;
        }

        function assignPickForDescriptor(descriptor, requirePrepared, forcedEntry) {
          const {
            slotIndex,
            overrideCategory,
            normalizedOverrideSlot,
            overrideSlotKey,
            baseSlotActive
          } = descriptor;
          if (forcedEntry && forcedEntry.type === 'leftover') {
            return assignLeftoverFromPool(slotIndex, forcedEntry);
          }
          const forcedMealId =
            forcedEntry && forcedEntry.type === 'cook' ? forcedEntry.mealId : null;
          let forcedMeal = null;
          if (forcedMealId) {
            if (overrideCategory) {
              const overrideContext = getContext(overrideCategory);
              forcedMeal =
                overrideContext?.meals.find(
                  m => (m.id || m.name) === forcedMealId
                ) || null;
            }
            if (!forcedMeal) {
              const baseContext = getContext(cat);
              forcedMeal =
                baseContext?.meals.find(m => (m.id || m.name) === forcedMealId) || null;
            }
          }
          let pick = null;
          const pickOptions = {
            requirePrepared: requirePrepared || (forcedMeal?.prepared ? true : false),
            forcedMealId,
            forcedEntry
          };
          if (overrideCategory) {
            pick = attemptPick(
              overrideCategory,
              overrideSlotKey != null ? overrideSlotKey : normalizedOverrideSlot,
              normalizedOverrideSlot,
              pickOptions
            );
          }
          if (!pick && baseSlotActive) {
            pick = attemptPick(cat, slotIndex, undefined, pickOptions);
          }
          if (forcedMealId && pick && pick.chosenId !== forcedMealId) {
            pick = null;
          }
          if (!pick && forcedMealId) {
            const entry = createCookEntry(forcedMealId);
            slotResults[slotIndex] = entry;
            let fallbackMeal = forcedMeal;
            if (!fallbackMeal && overrideCategory) {
              const overrideContext = getContext(overrideCategory);
              fallbackMeal =
                overrideContext?.meals.find(
                  m => (m.id || m.name) === forcedMealId
                ) || null;
            }
            if (!fallbackMeal) {
              const baseContext = getContext(cat);
              fallbackMeal =
                baseContext?.meals.find(
                  m => (m.id || m.name) === forcedMealId
                ) || null;
            }
            if (
              (fallbackMeal && fallbackMeal.leftoverOk) ||
              (forcedEntry &&
                Array.isArray(forcedEntry.leftoverTargets) &&
                forcedEntry.leftoverTargets.length)
            ) {
              registerNextLeftover(
                nextLeftovers,
                user,
                cat,
                slotIndex,
                dateStr,
                entry
              );
            }
            updateRecencyForEntry(entry);
            recordMealNutritionForEntry(entry, fallbackMeal, forcedMealId);
            return true;
          }
          if (!pick) return false;
          const entry = createCookEntry(pick.chosenId);
          slotResults[slotIndex] = entry;
          const meal = pick.meal;
          if (meal && meal.leftoverOk) {
            registerNextLeftover(
              nextLeftovers,
              user,
              cat,
              slotIndex,
              dateStr,
              entry
            );
          }
          updateRecencyForEntry(entry);
          recordMealNutritionForEntry(entry, meal, pick.chosenId);
          return true;
        }

        descriptors.forEach(descriptor => {
          const forcedEntry = forcedForUser ? forcedForUser[cat]?.[descriptor.slotIndex] : null;
          const preferLeftover =
            descriptor.prefersLeftover && (!forcedEntry || forcedEntry.type !== 'cook');
          const forcedLeftover = forcedEntry && forcedEntry.type === 'leftover' ? forcedEntry : null;
          if (preferLeftover || forcedLeftover) {
            if (assignLeftoverFromPool(descriptor.slotIndex, forcedLeftover)) {
              return;
            }
          }
          if (descriptor.needsPrep) {
            pendingPrep.push({ descriptor, forcedEntry });
            return;
          }
          assignPickForDescriptor(descriptor, false, forcedEntry);
        });

        pendingPrep.forEach(({ descriptor, forcedEntry }) => {
          if (!assignLeftoverFromPool(descriptor.slotIndex, forcedEntry)) {
            assignPickForDescriptor(descriptor, true, forcedEntry);
          }
        });

        if (!write) {
          return;
        }

        if (numSlots === 0 && !slotResults.some(entry => entry != null)) {
          return;
        }

        const serialized = slotResults.map(entry => serializeEntry(entry));
        calendar[user][dateStr][cat] =
          serialized.length === 1 ? serialized[0] : serialized;
      });
    });

    leftoverCarry = nextLeftovers;

    const lastSeedingIndex = effectiveSeedingDates.length - 1;
    if (freezeSnapshot == null && idx === lastSeedingIndex) {
      freezeSnapshot = {
        asOfDate:
          freezeBeforeStr || incrementDateStr(timeline[idx].dateStr),
        nonPrepState: cloneValue(nonPrepState),
        sharedGroupState: cloneValue(sharedGroupState),
        leftoverCarry: cloneValue(leftoverCarry),
        recencyState: cloneValue(recencyState)
      };
    }
  }

  if (freezeSnapshot == null && freezeBeforeStr) {
    freezeSnapshot = {
      asOfDate: freezeBeforeStr,
      nonPrepState: cloneValue(nonPrepState),
      sharedGroupState: cloneValue(sharedGroupState),
      leftoverCarry: cloneValue(leftoverCarry),
      recencyState: cloneValue(recencyState)
    };
  }

  const lastGeneratedDate = timeline.length
    ? timeline[timeline.length - 1].dateStr
    : null;

  const metadata = {
    asOfDate: incrementDateStr(lastGeneratedDate),
    nonPrepState: cloneValue(nonPrepState),
    sharedGroupState: cloneValue(sharedGroupState),
    leftoverCarry: cloneValue(leftoverCarry),
    recencyState: cloneValue(recencyState),
    freezeSnapshot
  };

  return { calendar, metadata };
}
