import { isItemInSeason } from './seasonData.js';

export function generatePreparedMealsCalendar(
  cookingDays,
  mealsByCategory,
  startDate,
  weeks = 4,
  itemSeasons = {}
) {
  const calendar = {};
  const mealIndices = {};
  const date = new Date(startDate);

  function weightMeals(list) {
    const out = [];
    list.forEach(m => {
      const w = m && m.weight != null ? m.weight : 1;
      for (let i = 0; i < w; i++) out.push(m);
    });
    return out;
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
          const idx = mealIndices[category] || 0;
          const meal = weighted[idx % weighted.length];
          calendar[dateStr][category] = meal.id || meal.name || String(idx);
          mealIndices[category] = idx + 1;
        }
      }
    });
    date.setDate(date.getDate() + 1);
  }
  return calendar;
}
