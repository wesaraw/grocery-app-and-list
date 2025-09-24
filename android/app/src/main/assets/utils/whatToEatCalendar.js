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

function normalizeForcedDay(dayValue) {
  const result = {};
  if (!dayValue || typeof dayValue !== 'object') return result;
  Object.entries(dayValue).forEach(([categoryId, slotValue]) => {
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

function incrementDateStr(dateStr) {
  if (!dateStr) return null;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + 1);
  return toISODateString(dt);
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
  options = {}
) {
  const {
    previousCalendar = null,
    freezeBefore = null,
    initialState = null
  } = options || {};

  const freezeBeforeStr =
    typeof freezeBefore === 'string' && freezeBefore ? freezeBefore : null;

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
      Object.entries(prevUser).forEach(([dateStr, dayValue]) => {
        if (freezeBeforeStr && dateStr >= freezeBeforeStr) return;
        targetUser[dateStr] = cloneValue(dayValue);
        preservedDates.add(dateStr);
        const forcedDay = forcedByDate.get(dateStr) || {};
        forcedDay[user] = normalizeForcedDay(dayValue);
        forcedByDate.set(dateStr, forcedDay);
      });
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
      items.push({ date: current, dateStr, forced: null, write: true });
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

  function serializeEntry(entry) {
    if (entry == null) return null;
    if (entry.type === 'leftover') {
      return {
        type: 'leftover',
        mealId: entry.mealId,
        leftoverSource: entry.leftoverSource ? { ...entry.leftoverSource } : null
      };
    }
    const targets = Array.isArray(entry.leftoverTargets)
      ? entry.leftoverTargets.map(t => ({ ...t }))
      : [];
    if (!targets.length) {
      return entry.mealId;
    }
    return {
      type: 'cook',
      mealId: entry.mealId,
      leftoverTargets: targets
    };
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
    function pushSlot(slot, prep) {
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
    }

    if (value && typeof value === 'object') {
      if (Array.isArray(value.slots)) {
        value.slots.forEach((slot, idx) => {
          const prep = Array.isArray(value.prepSlots?.[idx])
            ? value.prepSlots[idx]
            : Array.isArray(value.prepDays)
            ? value.prepDays
            : [];
          pushSlot(slot, prep);
        });
      } else if (Array.isArray(value.slotDays)) {
        value.slotDays.forEach((slot, idx) => {
          const prep = Array.isArray(value.prepSlots?.[idx])
            ? value.prepSlots[idx]
            : Array.isArray(value.prepDays)
            ? value.prepDays
            : [];
          pushSlot(slot, prep);
        });
      }
    }
    if (!normalizedSlots.length && Array.isArray(value)) {
      pushSlot(value, []);
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
    const prepSlotSets = prepSlots.map(prep => new Set(prep));
    return {
      days: normalizedDays,
      daySet,
      slots: normalizedSlots,
      slotSets,
      prepSlots,
      prepSlotSets
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
          const weightedList = candidateList.map(candidate => candidate.weighted);
          const meal = pickWeighted(weightedList, sizeState, forcedMealId);
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
            const meal = pickWeighted(candidateList, state, forcedMealId);
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
          descriptors.push({
            slotIndex: s,
            overrideCategory,
            normalizedOverrideSlot,
            overrideSlotKey,
            baseSlotActive,
            needsPrep
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
          const pool = prevLeftovers[user]?.[cat]?.[slotIndex];
          if (Array.isArray(pool) && pool.length) {
            let matchIndex = -1;
            if (forcedEntry && forcedEntry.leftoverSource) {
              matchIndex = pool.findIndex(item => {
                if (!item || !item.entry) return false;
                return (
                  item.entry.mealId === forcedEntry.mealId &&
                  item.date === forcedEntry.leftoverSource.date &&
                  item.categoryId === forcedEntry.leftoverSource.categoryId &&
                  item.slotIndex === forcedEntry.leftoverSource.slot
                );
              });
            }
            const sourceInfo =
              matchIndex >= 0 ? pool.splice(matchIndex, 1)[0] : pool.shift();
            if (sourceInfo && sourceInfo.entry) {
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
              return true;
            }
          }
          if (forcedEntry) {
            slotResults[slotIndex] = createLeftoverEntry(
              forcedEntry.mealId,
              forcedEntry.leftoverSource || null
            );
            updateRecencyForEntry(slotResults[slotIndex]);
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
          let pick = null;
          const pickOptions = {
            requirePrepared,
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
          if (!pick && forcedMealId) {
            const entry = createCookEntry(forcedMealId);
            slotResults[slotIndex] = entry;
            let fallbackMeal = null;
            if (overrideCategory) {
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
          return true;
        }

        descriptors.forEach(descriptor => {
          const forcedEntry = forcedForUser ? forcedForUser[cat]?.[descriptor.slotIndex] : null;
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
