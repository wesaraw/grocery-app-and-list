export function generateWhatToEatCalendar(
  users,
  preparedCal,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  weeks = 4,
  priceThresholds = {},
  slotOverrides = {}
) {
  const calendar = {};
  const nonPrepState = {};
  const sharedNonPrepState = {};
  const sharedDailyPick = {};
  const overrideSlotKeyCache = {};

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
    if (value && typeof value === 'object') {
      if (Array.isArray(value.slots)) {
        value.slots.forEach(slot => {
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
        });
      } else if (Array.isArray(value.slotDays)) {
        value.slotDays.forEach(slot => {
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
        });
      }
    }
    if (!normalizedSlots.length && Array.isArray(value)) {
      const seen = new Set();
      const arr = [];
      value.forEach(day => {
        if (typeof day === 'string' && !seen.has(day)) {
          seen.add(day);
          arr.push(day);
        }
      });
      normalizedSlots.push(arr);
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
    return { days: normalizedDays, daySet, slots: normalizedSlots, slotSets };
  }

  for (let i = 0; i < weeks * 7; i++) {
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    sharedDailyPick[dateStr] = sharedDailyPick[dateStr] || {};
    const dayOverrideSlotKeys =
      overrideSlotKeyCache[dayName] ||
      (overrideSlotKeyCache[dayName] = computeOverrideSlotKeys(dayName));
    users.forEach(user => {
      calendar[user][dateStr] = calendar[user][dateStr] || {};
      const prefs = subscriptions[user] || {};
      const rawDayPrefs = eatingDays[user] || {};
      const dayPrefs = {};
      Object.entries(rawDayPrefs).forEach(([categoryId, value]) => {
        dayPrefs[categoryId] = normalizeDayPreference(value);
      });
      const overridesForUser = slotOverrides[user] || {};
      const overridesForDay = overridesForUser[dayName] || {};
      const stateRec = nonPrepState[user] || (nonPrepState[user] = {});
      const maxPrice =
        priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity;
      const contextCache = {};

      function getContext(categoryId) {
        if (contextCache[categoryId]) return contextCache[categoryId];
        const meals = prefs[categoryId] || [];
        const numSlots = resolveSlotCount(categoryId);
        const prepMealId = preparedCal[dateStr]?.[categoryId];
        const nonPrepMeals = meals.filter(
          m => !m.prepared && (m.totalCost == null || m.totalCost <= maxPrice)
        );
        const sharedMeals = nonPrepMeals.filter(
          m => (subCount[categoryId]?.[m.id || m.name] || 0) > 1
        );
        const affordableAll = meals.filter(
          m => m.totalCost == null || m.totalCost <= maxPrice
        );
        const nonPrepFallback = meals.filter(m => !m.prepared);
        const weightedNonPrep = weightMeals(nonPrepMeals);
        const weightedShared = weightMeals(sharedMeals);
        const weightedAffordable = weightMeals(affordableAll.filter(m => !m.prepared));
        const weightedFallback = weightMeals(nonPrepFallback);
        const weightedAvail = weightMeals(meals);
        const chooseList =
          weightedNonPrep.length
            ? weightedNonPrep
            : weightedAffordable.length
            ? weightedAffordable
            : weightedFallback.length
            ? weightedFallback
            : weightedAvail;
        const context = {
          categoryId,
          meals,
          numSlots,
          prepMealId,
          weightedShared,
          chooseList
        };
        contextCache[categoryId] = context;
        return context;
      }

      function attemptPick(categoryId, slotKey, normalizedSlotOverride) {
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
        if (!prepOk && !context.weightedShared.length && !context.chooseList.length) {
          return null;
        }
        let chosenId = null;
        if (prepOk) {
          chosenId = context.prepMealId;
        } else if (context.weightedShared.length) {
          if (!sharedDailyPick[dateStr][categoryId]) {
            sharedDailyPick[dateStr][categoryId] = {};
          }
          if (!sharedDailyPick[dateStr][categoryId][sharedSlotKey]) {
            const sharedState =
              sharedNonPrepState[categoryId] || (sharedNonPrepState[categoryId] = {});
            const meal = pickWeighted(context.weightedShared, sharedState);
            if (!meal) return null;
            sharedDailyPick[dateStr][categoryId][sharedSlotKey] =
              meal.id || meal.name;
          }
          chosenId = sharedDailyPick[dateStr][categoryId][sharedSlotKey];
        } else if (context.chooseList.length) {
          const state = stateRec[categoryId] || (stateRec[categoryId] = {});
          const meal = pickWeighted(context.chooseList, state);
          if (!meal) return null;
          chosenId = meal.id || meal.name;
        }
        if (normalizedSlot === 0 && prepOk) {
          if (context.weightedShared.length) {
            if (!sharedDailyPick[dateStr][categoryId]) {
              sharedDailyPick[dateStr][categoryId] = {};
            }
            if (!sharedDailyPick[dateStr][categoryId][sharedSlotKey]) {
              const sharedState =
                sharedNonPrepState[categoryId] ||
                (sharedNonPrepState[categoryId] = {});
              const meal = pickWeighted(context.weightedShared, sharedState);
              if (meal) {
                sharedDailyPick[dateStr][categoryId][sharedSlotKey] =
                  meal.id || meal.name;
              }
            }
          } else if (context.chooseList.length) {
            const state = stateRec[categoryId] || (stateRec[categoryId] = {});
            pickWeighted(context.chooseList, state);
          }
        }
        return chosenId != null ? { chosenId } : null;
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
        const choices = [];
        for (let s = 0; s < iterationSlots; s++) {
          let chosenId = null;
          const overrideCategory = slotOverridesForCat[s];
          if (overrideCategory) {
            const overrideContext = getContext(overrideCategory);
            const overrideSlotCount = overrideContext
              ? Math.max(1, overrideContext.numSlots ?? 0)
              : 1;
            const normalizedOverrideSlot = Math.max(
              0,
              Math.min(s, overrideSlotCount - 1)
            );
            const overrideKeyMap =
              dayOverrideSlotKeys[overrideCategory] || {};
            const overrideComboKey = `${cat}:${s}`;
            const overrideSlotKey =
              overrideKeyMap[overrideComboKey] != null
                ? overrideKeyMap[overrideComboKey]
                : undefined;
            const overridePick = attemptPick(
              overrideCategory,
              overrideSlotKey != null ? overrideSlotKey : normalizedOverrideSlot,
              normalizedOverrideSlot
            );
            if (overridePick) {
              chosenId = overridePick.chosenId;
            }
          }
          const baseSlotActive = slotSets[s] ? slotSets[s].has(dayName) : false;
          if (chosenId == null && baseSlotActive) {
            const basePick = attemptPick(cat, s);
            if (basePick) {
              chosenId = basePick.chosenId;
            }
          }
          choices.push(chosenId);
        }
        if (numSlots === 0 && !choices.some(id => id != null)) {
          return;
        }
        calendar[user][dateStr][cat] =
          iterationSlots === 1 ? choices[0] : choices;
      });
    });
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
