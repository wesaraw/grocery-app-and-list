import { isItemInSeason } from './seasonData.js';

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
  slotOverrides = {}
) {
  const calendar = {};
  const nonPrepState = {};
  const sharedGroupState = {};
  const overrideSlotKeyCache = {};
  let leftoverCarry = {};

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
  const date = new Date(startDate);
  for (const u of users) calendar[u] = {};

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

  function pickWeighted(list, state) {
    const total = list.reduce((s, i) => s + i.weight, 0);
    if (!total) return null;
    for (const it of list) {
      const id = it.meal.id || it.meal.name;
      state[id] = (state[id] || 0) + it.weight;
    }
    let chosen = list[0].meal;
    let chosenId = list[0].meal.id || list[0].meal.name;
    let max = state[chosenId];
    for (const it of list) {
      const id = it.meal.id || it.meal.name;
      if (state[id] > max) {
        max = state[id];
        chosen = it.meal;
        chosenId = id;
      }
    }
    state[chosenId] -= total;
    return chosen;
  }

  function createCookEntry(mealId) {
    return { type: 'cook', mealId, leftoverTargets: [] };
  }

  function createLeftoverEntry(mealId, source) {
    return { type: 'leftover', mealId, leftoverSource: source };
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

  function computeOverrideSlotKeys(dayName) {
    const perCategory = {};
    users.forEach(user => {
      const dayOverrides = slotOverrides[user]?.[dayName] || {};
      Object.entries(dayOverrides).forEach(([sourceCategoryId, slotMap = {}]) => {
        Object.entries(slotMap || {}).forEach(([slotIndex, targetCategoryId]) => {
          if (!targetCategoryId) return;
          const baseSlots = resolveSlotCount(targetCategoryId);
          const categoryEntry =
            perCategory[targetCategoryId] ||
            (perCategory[targetCategoryId] = {
              baseSlots,
              nextOffset: 0,
              map: {}
            });
          const comboKey = `${sourceCategoryId}:${slotIndex}`;
          if (categoryEntry.map[comboKey] == null) {
            categoryEntry.map[comboKey] =
              categoryEntry.baseSlots + categoryEntry.nextOffset;
            categoryEntry.nextOffset += 1;
          }
        });
      });
    });
    const result = {};
    Object.entries(perCategory).forEach(([categoryId, data]) => {
      result[categoryId] = data.map;
    });
    return result;
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

  for (let i = 0; i < weeks * 7; i++) {
    const currentDate = new Date(date);
    const dateStr = currentDate.toISOString().split('T')[0];
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
      perUserData[user] = {
        prefs,
        dayPrefs,
        overridesForDay,
        overridesForUser,
        stateRec: nonPrepState[user] || (nonPrepState[user] = {}),
        maxPrice:
          priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity,
        contextCache: {}
      };
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
      const nonPrepMeals = meals.filter(
        m => !m.prepared && (m.totalCost == null || m.totalCost <= userData.maxPrice)
      );
      const sharedMeals = nonPrepMeals.filter(
        m => m.groupMeal && (subCount[categoryId]?.[m.id || m.name] || 0) > 1
      );
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
        daySharedPlan[categoryId] || (daySharedPlan[categoryId] = {});
      let slotEntry = categoryEntry[slotKeyId];
      if (!slotEntry) {
        slotEntry = categoryEntry[slotKeyId] = {
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
        let candidate = slotEntry.candidates.get(mealId);
        if (!candidate) {
          candidate = {
            meal,
            mealId,
            weight: entry.weight || 1,
            users: [],
            userSet: new Set(),
            weighted: null,
            disabled: false
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

    Object.entries(daySharedPlan).forEach(([categoryId, slots]) => {
      Object.entries(slots).forEach(([slotKey, slotEntry]) => {
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

    function resolveSharedAssignment(categoryId, sharedSlotKey, user) {
      if (sharedSlotKey == null) return null;
      const slotKeyId = String(sharedSlotKey);
      const categoryPlan = daySharedPlan[categoryId];
      if (!categoryPlan) return null;
      const slotPlan = categoryPlan[slotKeyId];
      if (!slotPlan) return null;
      if (slotPlan.participatingUsers && !slotPlan.participatingUsers.has(user)) {
        return null;
      }
      if (slotPlan.assigned[user]) {
        return slotPlan.assigned[user];
      }
      for (const size of slotPlan.sizeOrder || []) {
        const bucket = slotPlan.bySize[size];
        if (!bucket) continue;
        const stateBucket =
          sharedGroupState[categoryId] || (sharedGroupState[categoryId] = {});
        const sizeState = stateBucket[size] || (stateBucket[size] = {});
        while (true) {
          const activeCandidates = bucket.entries.filter(
            candidate => !candidate.disabled && candidate.userSet.has(user)
          );
          if (!activeCandidates.length) break;
          const weightedList = activeCandidates.map(candidate => candidate.weighted);
          const meal = pickWeighted(weightedList, sizeState);
          if (!meal) break;
          const mealId = meal.id || meal.name;
          const candidate = bucket.map.get(mealId);
          if (!candidate || candidate.disabled || !candidate.userSet.has(user)) {
            if (candidate) candidate.disabled = true;
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
          return mealId;
        }
      }
      return null;
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

      function getContext(categoryId) {
        if (contextCache[categoryId]) return contextCache[categoryId];
        return ensureContext(user, categoryId);
      }

    function attemptPick(categoryId, slotKey, normalizedSlotOverride, options = {}) {
      const { requirePrepared = false } = options;
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
        const prepMeal = meals.find(
          m => (m.id || m.name) === context.prepMealId
        );
        const prepOk =
          normalizedSlot === 0 &&
          prepMeal &&
          (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);
        if (
          !prepOk &&
          !requirePrepared &&
          !context.weightedShared.length &&
          !context.chooseList.length
        ) {
          return null;
        }
        if (requirePrepared && !prepOk && !context.preparedChooseList.length) {
          if (!context.chooseList.length) {
            return null;
          }
        }
        let chosenId = null;
        let chosenMeal = null;
        if (prepOk) {
          chosenId = context.prepMealId;
          chosenMeal = prepMeal || null;
        } else if (!requirePrepared && context.weightedShared.length) {
          const sharedChoice = resolveSharedAssignment(
            categoryId,
            sharedSlotKey,
            user
          );
          if (sharedChoice != null) {
            chosenId = sharedChoice;
            chosenMeal = meals.find(
              m => (m.id || m.name) === sharedChoice
            );
          }
        }
        if (chosenId == null) {
          const pickList = requirePrepared
            ? context.preparedChooseList.length
              ? context.preparedChooseList
              : context.chooseList
            : context.chooseList;
          if (pickList.length) {
            const state = stateRec[categoryId] || (stateRec[categoryId] = {});
            const meal = pickWeighted(pickList, state);
            if (meal) {
              chosenId = meal.id || meal.name;
              chosenMeal = meal;
            }
          }
        }
        if (normalizedSlot === 0 && prepOk && !requirePrepared) {
          if (context.weightedShared.length) {
            resolveSharedAssignment(categoryId, sharedSlotKey, user);
          } else if (context.chooseList.length) {
            const state = stateRec[categoryId] || (stateRec[categoryId] = {});
            pickWeighted(context.chooseList, state);
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
          calendar[user][dateStr][cat] = iterationSlots === 1 ? null : [];
          return;
        }
        const slotResults = new Array(iterationSlots).fill(null);
        const pendingPrep = [];

        function assignPickForDescriptor(descriptor, requirePrepared) {
          const { slotIndex, overrideCategory, normalizedOverrideSlot, overrideSlotKey, baseSlotActive } = descriptor;
          let pick = null;
          if (overrideCategory) {
            pick = attemptPick(
              overrideCategory,
              overrideSlotKey != null ? overrideSlotKey : normalizedOverrideSlot,
              normalizedOverrideSlot,
              { requirePrepared }
            );
          }
          if (!pick && baseSlotActive) {
            pick = attemptPick(cat, slotIndex, undefined, { requirePrepared });
          }
          if (!pick) return false;
          const entry = createCookEntry(pick.chosenId);
          slotResults[slotIndex] = entry;
          if (pick.meal && pick.meal.leftoverOk) {
            registerNextLeftover(
              nextLeftovers,
              user,
              cat,
              slotIndex,
              dateStr,
              entry
            );
          }
          return true;
        }

        descriptors.forEach(descriptor => {
          if (descriptor.needsPrep) {
            pendingPrep.push(descriptor);
            return;
          }
          assignPickForDescriptor(descriptor, false);
        });

        pendingPrep.forEach(descriptor => {
          const { slotIndex } = descriptor;
          const pool =
            prevLeftovers[user]?.[cat]?.[slotIndex];
          if (Array.isArray(pool) && pool.length) {
            const sourceInfo = pool.shift();
            if (sourceInfo && sourceInfo.entry) {
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
              slotResults[slotIndex] = createLeftoverEntry(
                sourceInfo.entry.mealId,
                {
                  date: sourceInfo.date,
                  categoryId: sourceInfo.categoryId,
                  slot: sourceInfo.slotIndex
                }
              );
              return;
            }
          }
          assignPickForDescriptor(descriptor, true);
        });

        if (numSlots === 0 && !slotResults.some(entry => entry != null)) {
          return;
        }

        const serialized = slotResults.map(entry => serializeEntry(entry));
        calendar[user][dateStr][cat] =
          serialized.length === 1 ? serialized[0] : serialized;
      });
    });

    leftoverCarry = nextLeftovers;
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
