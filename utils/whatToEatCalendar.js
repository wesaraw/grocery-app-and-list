export function generateWhatToEatCalendar(
  users,
  preparedCal,
  subscriptions,
  eatingDays,
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
        const prepMealId = preparedCal[dateStr]?.[cat];
        let chosen;
        if (prepMealId && meals.find(m => (m.id || m.name) === prepMealId)) {
          chosen = prepMealId;
        } else {
          const idxRec = nonPrepIndex[user] || (nonPrepIndex[user] = {});
          const idx = idxRec[cat] || 0;
          const meal = meals[idx % meals.length];
          chosen = meal.id || meal.name || String(idx);
          idxRec[cat] = idx + 1;
        }
        calendar[user][dateStr][cat] = chosen;
      });
    });
    date.setDate(date.getDate() + 1);
  }

  return calendar;
}
