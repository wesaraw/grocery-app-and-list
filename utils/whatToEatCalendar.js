export function generateWhatToEatCalendar(
  users,
  preparedCal,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  weeks = 4
) {
  const calendar = {};
  const nonPrepIndex = {};
  const date = new Date(startDate);
  for (const u of users) calendar[u] = {};

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
        if (!meals.length) return;
        const numSlots = mealsPerDay[cat] || 1;
        const prepMealId = preparedCal[dateStr]?.[cat];
        const idxRec = nonPrepIndex[user] || (nonPrepIndex[user] = {});
        const nonPrepMeals = meals.filter(m => !m.prepared);
        const choices = [];
        for (let s = 0; s < numSlots; s++) {
          let chosen;
          if (s === 0 && prepMealId && meals.find(m => (m.id || m.name) === prepMealId)) {
            chosen = prepMealId;
          } else {
            const list = nonPrepMeals.length ? nonPrepMeals : meals;
            const idx = idxRec[cat] || 0;
            const meal = list[idx % list.length];
            chosen = meal.id || meal.name || String(idx);
            idxRec[cat] = idx + 1;
          }
          // advance index even for prepared meals to keep rotation
          if (s === 0 && prepMealId && meals.find(m => (m.id || m.name) === prepMealId)) {
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
