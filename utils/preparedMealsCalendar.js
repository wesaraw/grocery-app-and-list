import { isItemInSeason } from './seasonData.js';

export function generatePreparedMealsCalendar(
  cookingDays,
  mealsByCategory,
  startDate,
  weeks = 4,
  itemSeasons = {}
) {
  const calendar = {};
  const mealState = {};
  const date = new Date(startDate);

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
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toISOString().split('T')[0];
    if (!calendar[dateStr]) calendar[dateStr] = {};
    Object.entries(cookingDays).forEach(([category, days]) => {
      if (!mealsByCategory[category]) return;
      if (days.includes(dayName)) {
        const meals = (mealsByCategory[category] || []).filter(m => {
          if (!m.prepared) return false;
          return (m.ingredients || []).every(ing =>
            isItemInSeason(itemSeasons, ing.name, date)
          );
        });
        const weighted = weightMeals(meals);
        if (weighted.length) {
          const state = mealState[category] || (mealState[category] = {});
          const meal = pickWeighted(weighted, state);
          const id = meal.id || meal.name;
          calendar[dateStr][category] = id || String(Object.keys(state).length);
        }
      }
    });
    date.setDate(date.getDate() + 1);
  }
  return calendar;
}
