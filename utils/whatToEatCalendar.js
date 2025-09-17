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
  const sharedNonPrepState = {};
  const sharedDailyPick = {};

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

  for (let i = 0; i < weeks * 7; i++) {
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    sharedDailyPick[dateStr] = sharedDailyPick[dateStr] || {};
    users.forEach(user => {
      calendar[user][dateStr] = calendar[user][dateStr] || {};
      const prefs = subscriptions[user] || {};
      const dayPrefs = eatingDays[user] || {};
      const overridesForUser = slotOverrides[user] || {};
      const overridesForDay = overridesForUser[dayName] || {};
      const stateRec = nonPrepState[user] || (nonPrepState[user] = {});
      const maxPrice =
        priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity;
      const contextCache = {};

      function getContext(categoryId) {
        if (contextCache[categoryId]) return contextCache[categoryId];
        const meals = (prefs[categoryId] || []).filter(m =>
          (m.ingredients || []).every(ing =>
            isItemInSeason(itemSeasons, ing.name, date)
          )
        );
        const numSlots = mealsPerDay[categoryId] || 1;
        const prepMealId = preparedCal[dateStr]?.[categoryId];
        const nonPrepMeals = meals.filter(
          m => !m.prepared && (m.totalCost == null || m.totalCost <= maxPrice)
        );
        const sharedMeals = nonPrepMeals.filter(
          m => m.groupMeal && (subCount[categoryId]?.[m.id || m.name] || 0) > 1
        );
        const affordableAll = meals.filter(
          m => m.totalCost == null || m.totalCost <= maxPrice
        );
        const nonPrepFallback = meals.filter(m => !m.prepared);
        const weightedNonPrep = weightMeals(nonPrepMeals);
        const weightedShared = weightMeals(sharedMeals);
        const weightedAffordable = weightMeals(
          affordableAll.filter(m => !m.prepared)
        );
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

      function attemptPick(categoryId, slotIndex) {
        const context = getContext(categoryId);
        if (!context) return null;
        const targetSlots = context.numSlots || 1;
        const normalizedSlot = Math.max(
          0,
          Math.min(slotIndex, targetSlots - 1)
        );
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
          if (!sharedDailyPick[dateStr][categoryId][normalizedSlot]) {
            const sharedState =
              sharedNonPrepState[categoryId] || (sharedNonPrepState[categoryId] = {});
            const meal = pickWeighted(context.weightedShared, sharedState);
            if (!meal) return null;
            sharedDailyPick[dateStr][categoryId][normalizedSlot] =
              meal.id || meal.name;
          }
          chosenId = sharedDailyPick[dateStr][categoryId][normalizedSlot];
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
            if (!sharedDailyPick[dateStr][categoryId][normalizedSlot]) {
              const sharedState =
                sharedNonPrepState[categoryId] ||
                (sharedNonPrepState[categoryId] = {});
              const meal = pickWeighted(context.weightedShared, sharedState);
              if (meal) {
                sharedDailyPick[dateStr][categoryId][normalizedSlot] =
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

      const categories = new Set(Object.keys(prefs));
      Object.keys(overridesForDay).forEach(cat => categories.add(cat));
      categories.forEach(cat => {
        const validDays = dayPrefs[cat] || [];
        const slotOverridesForCat = overridesForDay[cat] || {};
        const hasOverride = Object.keys(slotOverridesForCat).length > 0;
        if (!validDays.includes(dayName) && !hasOverride) return;
        const numSlots = mealsPerDay[cat] || 1;
        const choices = [];
        for (let s = 0; s < numSlots; s++) {
          let chosenId = null;
          const overrideCategory = slotOverridesForCat[s];
          if (overrideCategory) {
            const overridePick = attemptPick(overrideCategory, s);
            if (overridePick) {
              chosenId = overridePick.chosenId;
            }
          }
          if (chosenId == null) {
            const basePick = attemptPick(cat, s);
            if (basePick) {
              chosenId = basePick.chosenId;
            }
          }
          choices.push(chosenId);
        }
        calendar[user][dateStr][cat] = numSlots === 1 ? choices[0] : choices;
      });
    });
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
