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
  const sharedIndex = {};
  const backupIndex = {};
  const nonPrepIndex = {};
  const refUser = users[0];
  const date = new Date(startDate);
  for (const u of users) {
    calendar[u] = {};
    backupIndex[u] = {};
    nonPrepIndex[u] = {};
  }

  const categories = Object.keys(mealsPerDay || {});

  for (let i = 0; i < weeks * 7; i++) {
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    categories.forEach(cat => {
      const numSlots = mealsPerDay[cat] || 1;
      const activeUsers = users.filter(u => {
        const days = (eatingDays[u] || {})[cat] || [];
        return days.includes(dayName);
      });
      if (!activeUsers.length) return;

      activeUsers.forEach(u => {
        calendar[u][dateStr] = calendar[u][dateStr] || {};
        calendar[u][dateStr][cat] = [];
      });

      for (let s = 0; s < numSlots; s++) {
        if (cat === 'lunchDinner') {
          const refList = (subscriptions[refUser] || {})[cat] || [];
          const refNonPrep = refList.filter(m => !m.prepared);
          const useList = refNonPrep.length ? refNonPrep : refList;
          const availRefList = useList.filter(m =>
            (m.ingredients || []).every(ing =>
              isItemInSeason(itemSeasons, ing.name, date)
            )
          );
          const idx = sharedIndex[cat] || 0;
          const refMeal = availRefList.length
            ? availRefList[idx % availRefList.length]
            : null;
          const refId = refMeal ? refMeal.id || refMeal.name || String(idx) : null;

          activeUsers.forEach(user => {
            const prefs = subscriptions[user] || {};
            const meals = prefs[cat] || [];
            const availMeals = meals.filter(m =>
              (m.ingredients || []).every(ing =>
                isItemInSeason(itemSeasons, ing.name, date)
              )
            );
            if (!availMeals.length) return;
            const prepMealId = preparedCal[dateStr]?.[cat];
            const maxPrice =
              priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity;
            const prepMeal = availMeals.find(m => (m.id || m.name) === prepMealId);
            const prepOk =
              s === 0 &&
              prepMeal &&
              (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);

            let chosen;
            if (prepOk) {
              chosen = prepMealId;
            } else {
              const hasShared = availMeals.some(
                m =>
                  (m.id || m.name) === refId &&
                  !m.prepared &&
                  (m.totalCost == null || m.totalCost <= maxPrice)
              );
              if (refMeal && hasShared) {
                chosen = refId;
              } else {
                const nonPrepMeals = availMeals.filter(
                  m => !m.prepared && (m.totalCost == null || m.totalCost <= maxPrice)
                );
                const affordableAll = availMeals.filter(
                  m => m.totalCost == null || m.totalCost <= maxPrice
                );
                const nonPrepFallback = availMeals.filter(m => !m.prepared);
                let list = nonPrepMeals.length
                  ? nonPrepMeals
                  : affordableAll.length
                  ? affordableAll.filter(m => !m.prepared)
                  : [];
                if (!list.length) list = nonPrepFallback.length ? nonPrepFallback : availMeals;
                const rec = backupIndex[user];
                const bIdx = rec[cat] || 0;
                const meal = list[bIdx % list.length];
                chosen = meal.id || meal.name || String(bIdx);
                rec[cat] = bIdx + 1;
              }
            }
            calendar[user][dateStr][cat][s] = chosen;
          });

          sharedIndex[cat] = idx + 1;
        } else {
          activeUsers.forEach(user => {
            const prefs = subscriptions[user] || {};
            const meals = prefs[cat] || [];
            const availMeals = meals.filter(m =>
              (m.ingredients || []).every(ing =>
                isItemInSeason(itemSeasons, ing.name, date)
              )
            );
            if (!availMeals.length) return;
            const prepMealId = preparedCal[dateStr]?.[cat];
            const maxPrice =
              priceThresholds[user] !== undefined ? priceThresholds[user] : Infinity;
            const prepMeal = availMeals.find(m => (m.id || m.name) === prepMealId);
            const prepOk =
              s === 0 &&
              prepMeal &&
              (prepMeal.totalCost == null || prepMeal.totalCost <= maxPrice);

            const nonPrepMeals = availMeals.filter(
              m => !m.prepared && (m.totalCost == null || m.totalCost <= maxPrice)
            );
            const affordableAll = availMeals.filter(
              m => m.totalCost == null || m.totalCost <= maxPrice
            );
            const nonPrepFallback = availMeals.filter(m => !m.prepared);
            let list = nonPrepMeals.length
              ? nonPrepMeals
              : affordableAll.length
              ? affordableAll.filter(m => !m.prepared)
              : [];
            if (!list.length) list = nonPrepFallback.length ? nonPrepFallback : availMeals;

            let chosen;
            if (prepOk) {
              chosen = prepMealId;
            } else {
              const rec = nonPrepIndex[user];
              const idx = rec[cat] || 0;
              const meal = list[idx % list.length];
              chosen = meal.id || meal.name || String(idx);
              rec[cat] = idx + 1;
            }

            if (prepOk) {
              const rec = nonPrepIndex[user];
              rec[cat] = (rec[cat] || 0) + 1;
            }

            calendar[user][dateStr][cat][s] = chosen;
          });
        }
      }

      activeUsers.forEach(u => {
        if (numSlots === 1) {
          calendar[u][dateStr][cat] = calendar[u][dateStr][cat][0];
        }
      });
    });
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
