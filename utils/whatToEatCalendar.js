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
  itemSeasons = {}
) {
  const calendar = {};
  const nonPrepState = {};
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
    users.forEach(user => {
      calendar[user][dateStr] = calendar[user][dateStr] || {};
      const prefs = subscriptions[user] || {};
      const dayPrefs = eatingDays[user] || {};
      Object.keys(prefs).forEach(cat => {
        const validDays = dayPrefs[cat] || [];
        if (!validDays.includes(dayName)) return;
        const meals = prefs[cat] || [];
        const availMeals = meals.filter(m =>
          (m.ingredients || []).every(ing =>
            isItemInSeason(itemSeasons, ing.name, date)
          )
        );
        if (!availMeals.length) return;
        const numSlots = mealsPerDay[cat] || 1;
        const prepMealId = preparedCal[dateStr]?.[cat];
        const stateRec = nonPrepState[user] || (nonPrepState[user] = {});
        const maxPrice =
          priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity;
        const nonPrepMeals = availMeals.filter(
          m => !m.prepared && (m.totalCost == null || m.totalCost <= maxPrice)
        );
        const affordableAll = availMeals.filter(
          m => m.totalCost == null || m.totalCost <= maxPrice
        );
        const nonPrepFallback = availMeals.filter(m => !m.prepared);
        const weightedNonPrep = weightMeals(nonPrepMeals);
        const weightedAffordable = weightMeals(affordableAll.filter(m => !m.prepared));
        const weightedFallback = weightMeals(nonPrepFallback);
        const weightedAvail = weightMeals(availMeals);
        const chooseList =
          weightedNonPrep.length
            ? weightedNonPrep
            : weightedAffordable.length
            ? weightedAffordable
            : weightedFallback.length
            ? weightedFallback
            : weightedAvail;
        const choices = [];
        for (let s = 0; s < numSlots; s++) {
          let chosen;
          const prepMeal = availMeals.find(m => (m.id || m.name) === prepMealId);
          const prepOk =
            prepMeal && (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);
          if (s === 0 && prepOk) {
            chosen = prepMealId;
          } else {
            const list = chooseList;
            const state = stateRec[cat] || (stateRec[cat] = {});
            const meal = pickWeighted(list, state);
            chosen = meal.id || meal.name;
          }
          // advance index even for prepared meals to keep rotation
          if (s === 0 && prepOk) {
            // still advance rotation by simulating a pick
            const state = stateRec[cat] || (stateRec[cat] = {});
            pickWeighted(chooseList, state);
          }
          choices.push(chosen);
        }
        calendar[user][dateStr][cat] = numSlots === 1 ? choices[0] : choices;
      });
    });
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
