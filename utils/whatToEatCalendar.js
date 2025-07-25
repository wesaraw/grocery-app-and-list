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
  const nonPrepIndex = {};
  const date = new Date(startDate);
  for (const u of users) calendar[u] = {};

  function weightMeals(list) {
    const out = [];
    list.forEach(m => {
      const w = m && m.weight != null ? m.weight : 1;
      for (let i = 0; i < w; i++) out.push(m);
    });
    return out;
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
        const idxRec = nonPrepIndex[user] || (nonPrepIndex[user] = {});
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
        const choices = [];
        for (let s = 0; s < numSlots; s++) {
          let chosen;
          const prepMeal = availMeals.find(m => (m.id || m.name) === prepMealId);
          const prepOk =
            prepMeal && (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);
          if (s === 0 && prepOk) {
            chosen = prepMealId;
          } else {
            let list = weightedNonPrep.length
              ? weightedNonPrep
              : weightedAffordable.length
              ? weightedAffordable
              : [];
            if (!list.length) list = weightedFallback.length ? weightedFallback : weightedAvail;
            const idx = idxRec[cat] || 0;
            const meal = list[idx % list.length];
            chosen = meal.id || meal.name || String(idx);
            idxRec[cat] = idx + 1;
          }
          // advance index even for prepared meals to keep rotation
          if (s === 0 && prepOk) {
            idxRec[cat] = (idxRec[cat] || 0) + 1;
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
